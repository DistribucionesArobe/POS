"""Modulo de costeo de importaciones - CRUD + calculo + aplicar al catalogo.

Calculo estilo Excel de importador MX:
 1. Costo mercancia MXN = precio_unit * tipo_cambio * piezas
 2. Total mercancia = suma de todos los renglones
 3. Total gastos = suma de gastos NO reembolsables (con IVA prorrateado)
 4. Prorrateo por renglon: gastos * (monto_renglon / total_mercancia)
 5. Costo unit final = (monto_renglon + prorrateo) / piezas
 6. Precio venta sugerido = costo_unit * margen_sugerido (default 2.5x)
"""
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Importacion, ImportacionRenglon, ImportacionGasto, ImportacionGastoDefault,
    Usuario, VarianteProducto,
)
from app.services.security import get_active_empresa_id, get_current_user

router = APIRouter(prefix="/importaciones", tags=["importaciones"])


# ============ SCHEMAS ============

class RenglonIn(BaseModel):
    id: int | None = None
    orden: int = 0
    descripcion: str
    piezas: float = 0
    precio_unit_mercancia: float = 0
    kg_pieza: float = 0
    variante_id: int | None = None
    margen_sugerido_pct: float = 2.5
    arancel_pct: float = 0.15  # IGI del renglon


class GastoIn(BaseModel):
    id: int | None = None
    orden: int = 0
    concepto: str
    categoria: str | None = None
    monto: float = 0
    moneda: str = "MXN"
    causa_iva: bool = False
    tasa_iva: float = 0.16
    reembolsable: bool = False
    notas: str | None = None
    formula: str | None = None


class ImportacionIn(BaseModel):
    folio: str
    proveedor: str | None = None
    agente_aduanal: str | None = None
    referencia_pedimento: str | None = None
    contenedor: str | None = None
    puerto_llegada: str | None = None
    fecha: datetime | None = None
    fecha_arribo: datetime | None = None
    moneda_mercancia: str = "USD"
    tipo_cambio: float = 1.0
    estatus: str = "borrador"
    notas: str | None = None
    renglones: list[RenglonIn] = []
    gastos: list[GastoIn] = []


class GastoDefaultIn(BaseModel):
    concepto: str
    categoria: str | None = None
    monto_referencia: float = 0
    moneda: str = "MXN"
    causa_iva: bool = False
    reembolsable: bool = False


# ============ HELPERS ============

def _calcular(imp: Importacion) -> dict[str, Any]:
    """Calcula totales, prorrateo y costos unitarios."""
    tc = float(imp.tipo_cambio or 1)

    # Mercancia por renglon en MXN
    renglones_calc = []
    total_mercancia_mxn = 0.0
    for r in imp.renglones:
        monto_moneda = float(r.piezas or 0) * float(r.precio_unit_mercancia or 0)
        monto_mxn = monto_moneda * tc
        total_mercancia_mxn += monto_mxn
        renglones_calc.append({
            "id": r.id,
            "descripcion": r.descripcion,
            "piezas": float(r.piezas or 0),
            "kg_pieza": float(r.kg_pieza or 0),
            "kg_total": float(r.piezas or 0) * float(r.kg_pieza or 0),
            "precio_unit_mercancia": float(r.precio_unit_mercancia or 0),
            "monto_moneda": round(monto_moneda, 2),
            "monto_mxn": round(monto_mxn, 2),
            "variante_id": r.variante_id,
            "margen_sugerido_pct": float(r.margen_sugerido_pct or 2.5),
            "arancel_pct": float(getattr(r, "arancel_pct", 0.15) or 0.15),
        })

    # Valor aduana (CIF) = mercancia + flete maritimo + seguro (los del catalogo LDP)
    # IGI por arancel: suma de (monto_renglon_CIF x arancel_renglon)
    flete_maritimo_mxn = 0.0
    seguro_mxn = 0.0
    for g in imp.gastos:
        cat = (g.categoria or "").lower()
        con = (g.concepto or "").lower()
        if cat == "flete" and ("maritim" in con or "internacional" in con):
            flete_maritimo_mxn += float(g.monto or 0)
        elif cat == "seguro":
            seguro_mxn += float(g.monto or 0)
    valor_aduana = total_mercancia_mxn + flete_maritimo_mxn + seguro_mxn

    # IGI se calcula por renglon: cada uno absorbe su parte del flete+seguro por
    # prorrateo de mercancia, y sobre ese CIF proporcional se aplica su arancel.
    # Total IGI = suma. Este IGI luego se prorratea junto con los otros gastos.
    igi_total = 0.0
    if total_mercancia_mxn > 0:
        cif_extra = flete_maritimo_mxn + seguro_mxn  # a prorratear por mercancia
        for r in renglones_calc:
            pct_r = r["monto_mxn"] / total_mercancia_mxn
            cif_renglon = r["monto_mxn"] + pct_r * cif_extra
            r["cif_mxn"] = round(cif_renglon, 2)
            r["igi_mxn"] = round(cif_renglon * r["arancel_pct"], 2)
            igi_total += r["igi_mxn"]

    def _detect_formula(concepto: str) -> str | None:
        """Fallback: si el gasto no tiene formula guardada, detectar por nombre."""
        c = (concepto or "").lower().strip()
        if c.startswith("iva"):
            return "iva_valor_aduana"
        if c.startswith("dta"):
            return "dta_valor_aduana"
        if c.startswith("padron"):
            return "padron_5pct"
        if c.startswith("igi"):
            return "igi_por_arancel"
        return None

    def _monto_formula(g) -> float | None:
        f = getattr(g, "formula", None) or _detect_formula(g.concepto)
        if not f:
            return None
        if f == "iva_valor_aduana":
            return round(valor_aduana * 0.16, 2)
        if f == "dta_valor_aduana":
            return round(valor_aduana * 0.008, 2)
        if f == "padron_5pct":
            return round(valor_aduana * 0.05, 2)
        if f == "igi_por_arancel":
            return round(igi_total, 2)
        return None

    # Gastos: sumar solo NO reembolsables. Los que causan IVA suman IVA tambien.
    total_gastos_prorrateables = 0.0
    total_iva_gastos = 0.0
    total_gastos_reembolsables = 0.0
    gastos_calc = []
    for g in imp.gastos:
        # Si tiene formula, el monto se auto-calcula (ignora monto manual)
        monto_auto = _monto_formula(g)
        monto = monto_auto if monto_auto is not None else float(g.monto or 0)
        iva = monto * float(g.tasa_iva or 0) if g.causa_iva else 0.0
        subtotal_con_iva = monto + iva
        if g.reembolsable:
            total_gastos_reembolsables += subtotal_con_iva
        else:
            total_gastos_prorrateables += subtotal_con_iva
            total_iva_gastos += iva
        gastos_calc.append({
            "id": g.id, "orden": g.orden, "concepto": g.concepto,
            "categoria": g.categoria, "monto": monto, "moneda": g.moneda,
            "causa_iva": g.causa_iva, "tasa_iva": float(g.tasa_iva or 0),
            "reembolsable": g.reembolsable, "formula": getattr(g, "formula", None),
            "iva": round(iva, 2), "total": round(subtotal_con_iva, 2),
            "notas": g.notas,
        })

    # Prorrateo por renglon (% mercancia sobre total)
    for r in renglones_calc:
        pct = (r["monto_mxn"] / total_mercancia_mxn) if total_mercancia_mxn > 0 else 0
        r["pct_mercancia"] = round(pct * 100, 3)
        r["gastos_prorrateados"] = round(pct * total_gastos_prorrateables, 2)
        r["costo_total_mxn"] = round(r["monto_mxn"] + r["gastos_prorrateados"], 2)
        r["costo_unit_final_mxn"] = round(
            r["costo_total_mxn"] / r["piezas"], 4
        ) if r["piezas"] > 0 else 0
        r["precio_venta_sugerido_mxn"] = round(
            r["costo_unit_final_mxn"] * r["margen_sugerido_pct"], 2
        )
        r["ingreso_sugerido_mxn"] = round(
            r["precio_venta_sugerido_mxn"] * r["piezas"], 2
        )

    inversion_total = total_mercancia_mxn + total_gastos_prorrateables + total_gastos_reembolsables
    ingresos_sugeridos = sum(r["ingreso_sugerido_mxn"] for r in renglones_calc)
    utilidad_sugerida = ingresos_sugeridos - (total_mercancia_mxn + total_gastos_prorrateables)
    # Utilidad NO cuenta reembolsables porque te lo devuelven

    return {
        "moneda_mercancia": imp.moneda_mercancia,
        "tipo_cambio": tc,
        "total_mercancia_mxn": round(total_mercancia_mxn, 2),
        "total_gastos_prorrateables": round(total_gastos_prorrateables, 2),
        "total_gastos_reembolsables": round(total_gastos_reembolsables, 2),
        "total_iva_gastos": round(total_iva_gastos, 2),
        "inversion_total_mxn": round(inversion_total, 2),
        "pct_gastos_sobre_mercancia": round(
            (total_gastos_prorrateables / total_mercancia_mxn * 100), 2
        ) if total_mercancia_mxn > 0 else 0,
        "ingresos_sugeridos_mxn": round(ingresos_sugeridos, 2),
        "utilidad_sugerida_mxn": round(utilidad_sugerida, 2),
        "margen_utilidad_pct": round(
            utilidad_sugerida / ingresos_sugeridos * 100, 2
        ) if ingresos_sugeridos > 0 else 0,
        "n_renglones": len(renglones_calc),
        "n_piezas_total": sum(r["piezas"] for r in renglones_calc),
        "renglones": renglones_calc,
        "gastos": gastos_calc,
    }


def _serialize(imp: Importacion, incluir_calculo: bool = True) -> dict:
    d = {
        "id": imp.id,
        "folio": imp.folio,
        "proveedor": imp.proveedor,
        "agente_aduanal": imp.agente_aduanal,
        "referencia_pedimento": imp.referencia_pedimento,
        "contenedor": imp.contenedor,
        "puerto_llegada": imp.puerto_llegada,
        "fecha": imp.fecha.isoformat() if imp.fecha else None,
        "fecha_arribo": imp.fecha_arribo.isoformat() if imp.fecha_arribo else None,
        "moneda_mercancia": imp.moneda_mercancia,
        "tipo_cambio": float(imp.tipo_cambio),
        "estatus": imp.estatus,
        "notas": imp.notas,
        "creado_en": imp.creado_en.isoformat() if imp.creado_en else None,
    }
    if incluir_calculo:
        d["calculo"] = _calcular(imp)
    return d


# ============ ENDPOINTS ============

@router.get("")
def listar(
    limit: int = 50,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Lista importaciones de la empresa activa. Solo resumen (sin detalle)."""
    rows = (
        db.query(Importacion)
        .filter(Importacion.empresa_id == empresa_id)
        .order_by(Importacion.creado_en.desc())
        .limit(limit)
        .all()
    )
    resultado = []
    for imp in rows:
        calc = _calcular(imp)
        resultado.append({
            "id": imp.id, "folio": imp.folio, "proveedor": imp.proveedor,
            "contenedor": imp.contenedor, "estatus": imp.estatus,
            "fecha": imp.fecha.isoformat() if imp.fecha else None,
            "moneda_mercancia": imp.moneda_mercancia,
            "tipo_cambio": float(imp.tipo_cambio),
            "n_renglones": calc["n_renglones"],
            "total_mercancia_mxn": calc["total_mercancia_mxn"],
            "inversion_total_mxn": calc["inversion_total_mxn"],
            "utilidad_sugerida_mxn": calc["utilidad_sugerida_mxn"],
        })
    return resultado


@router.get("/gastos-default")
def gastos_default(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Regresa el catalogo de gastos default. Si esta vacio, sembra
    los conceptos tipicos del proceso aduanal MX (LDP-style)."""
    rows = (
        db.query(ImportacionGastoDefault)
        .filter(ImportacionGastoDefault.empresa_id == empresa_id)
        .filter(ImportacionGastoDefault.activo == True)
        .order_by(ImportacionGastoDefault.orden)
        .all()
    )
    if not rows:
        # Semilla: conceptos tipicos de una importacion MX (basado en LDP Logistics)
        semilla = [
            (10, "Flete maritimo", "flete", 0, False, False),
            (20, "Seguro de mercancia", "seguro", 0, True, False),
            (30, "IGI (Impuesto General de Importacion)", "impuesto", 0, False, False),
            (31, "DTA (Derecho de Tramite Aduanero)", "impuesto", 0, False, False),
            (32, "IVA de importacion", "impuesto", 0, False, False),
            (40, "Padron de importadores (5% valor aduana)", "agente", 0, True, False),
            (41, "Honorarios agente aduanal", "agente", 0, True, False),
            (42, "Revalidacion", "agente", 0, False, False),
            (43, "Reconocimiento aduanero", "agente", 0, False, False),
            (44, "Interfaz MVE (Manif. Valor Electronico)", "agente", 0, True, False),
            (50, "Maniobras en puerto", "maniobra", 0, False, False),
            (60, "Flete terrestre nacional", "flete", 0, True, False),
            (70, "Garantia de contenedor (reembolsable)", "otro", 0, False, True),
        ]
        for orden, concepto, cat, monto, iva, reemb in semilla:
            db.add(ImportacionGastoDefault(
                empresa_id=empresa_id, orden=orden, concepto=concepto,
                categoria=cat, monto_referencia=monto, moneda="MXN",
                causa_iva=iva, reembolsable=reemb, activo=True,
            ))
        db.commit()
        rows = (
            db.query(ImportacionGastoDefault)
            .filter(ImportacionGastoDefault.empresa_id == empresa_id)
            .filter(ImportacionGastoDefault.activo == True)
            .order_by(ImportacionGastoDefault.orden)
            .all()
        )
    return [
        {
            "id": g.id, "orden": g.orden, "concepto": g.concepto,
            "categoria": g.categoria, "monto_referencia": float(g.monto_referencia),
            "moneda": g.moneda, "causa_iva": g.causa_iva, "reembolsable": g.reembolsable,
            "formula": getattr(g, "formula", None),
        }
        for g in rows
    ]


@router.get("/{imp_id}")
def obtener(
    imp_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    imp = db.get(Importacion, imp_id)
    if not imp or imp.empresa_id != empresa_id:
        raise HTTPException(404, "Importacion no existe")
    d = _serialize(imp)
    d["renglones_raw"] = [
        {
            "id": r.id, "orden": r.orden, "descripcion": r.descripcion,
            "piezas": float(r.piezas), "precio_unit_mercancia": float(r.precio_unit_mercancia),
            "kg_pieza": float(r.kg_pieza), "variante_id": r.variante_id,
            "margen_sugerido_pct": float(r.margen_sugerido_pct),
            "arancel_pct": float(getattr(r, "arancel_pct", 0.15) or 0.15),
        }
        for r in imp.renglones
    ]
    def _detect(concepto: str) -> str | None:
        c = (concepto or "").lower().strip()
        if c.startswith("iva"): return "iva_valor_aduana"
        if c.startswith("dta"): return "dta_valor_aduana"
        if c.startswith("padron"): return "padron_5pct"
        if c.startswith("igi"): return "igi_por_arancel"
        return None
    d["gastos_raw"] = [
        {
            "id": g.id, "orden": g.orden, "concepto": g.concepto,
            "categoria": g.categoria, "monto": float(g.monto), "moneda": g.moneda,
            "causa_iva": g.causa_iva, "tasa_iva": float(g.tasa_iva),
            "reembolsable": g.reembolsable, "notas": g.notas,
            "formula": getattr(g, "formula", None) or _detect(g.concepto),
        }
        for g in imp.gastos
    ]
    return d


@router.post("")
def crear(
    payload: ImportacionIn,
    empresa_id: int = Depends(get_active_empresa_id),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Auto-folio si viene vacio o duplicado
    folio = payload.folio.strip()
    if not folio:
        n = db.query(Importacion).filter(Importacion.empresa_id == empresa_id).count()
        folio = f"IMP-{datetime.utcnow().year}-{n+1:04d}"

    imp = Importacion(
        empresa_id=empresa_id, folio=folio,
        proveedor=payload.proveedor, agente_aduanal=payload.agente_aduanal,
        referencia_pedimento=payload.referencia_pedimento,
        contenedor=payload.contenedor, puerto_llegada=payload.puerto_llegada,
        fecha=payload.fecha or datetime.utcnow(),
        fecha_arribo=payload.fecha_arribo,
        moneda_mercancia=payload.moneda_mercancia,
        tipo_cambio=payload.tipo_cambio,
        estatus=payload.estatus, notas=payload.notas,
        creado_por=usuario.id,
    )
    db.add(imp)
    db.flush()

    for r in payload.renglones:
        db.add(ImportacionRenglon(
            importacion_id=imp.id, orden=r.orden, descripcion=r.descripcion,
            piezas=r.piezas, precio_unit_mercancia=r.precio_unit_mercancia,
            kg_pieza=r.kg_pieza, variante_id=r.variante_id,
            margen_sugerido_pct=r.margen_sugerido_pct,
            arancel_pct=r.arancel_pct,
        ))
    for g in payload.gastos:
        db.add(ImportacionGasto(
            importacion_id=imp.id, orden=g.orden, concepto=g.concepto,
            categoria=g.categoria, monto=g.monto, moneda=g.moneda,
            causa_iva=g.causa_iva, tasa_iva=g.tasa_iva,
            reembolsable=g.reembolsable, notas=g.notas, formula=g.formula,
        ))
    db.commit()
    db.refresh(imp)
    return _serialize(imp)


@router.put("/{imp_id}")
def actualizar(
    imp_id: int, payload: ImportacionIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    imp = db.get(Importacion, imp_id)
    if not imp or imp.empresa_id != empresa_id:
        raise HTTPException(404, "Importacion no existe")

    imp.folio = payload.folio.strip() or imp.folio
    imp.proveedor = payload.proveedor
    imp.agente_aduanal = payload.agente_aduanal
    imp.referencia_pedimento = payload.referencia_pedimento
    imp.contenedor = payload.contenedor
    imp.puerto_llegada = payload.puerto_llegada
    if payload.fecha:
        imp.fecha = payload.fecha
    imp.fecha_arribo = payload.fecha_arribo
    imp.moneda_mercancia = payload.moneda_mercancia
    imp.tipo_cambio = payload.tipo_cambio
    imp.estatus = payload.estatus
    imp.notas = payload.notas

    # Sincronizar renglones (delete-insert simple)
    for r in imp.renglones:
        db.delete(r)
    db.flush()
    for r in payload.renglones:
        db.add(ImportacionRenglon(
            importacion_id=imp.id, orden=r.orden, descripcion=r.descripcion,
            piezas=r.piezas, precio_unit_mercancia=r.precio_unit_mercancia,
            kg_pieza=r.kg_pieza, variante_id=r.variante_id,
            margen_sugerido_pct=r.margen_sugerido_pct,
            arancel_pct=r.arancel_pct,
        ))

    # Sincronizar gastos
    for g in imp.gastos:
        db.delete(g)
    db.flush()
    for g in payload.gastos:
        db.add(ImportacionGasto(
            importacion_id=imp.id, orden=g.orden, concepto=g.concepto,
            categoria=g.categoria, monto=g.monto, moneda=g.moneda,
            causa_iva=g.causa_iva, tasa_iva=g.tasa_iva,
            reembolsable=g.reembolsable, notas=g.notas, formula=g.formula,
        ))
    db.commit()
    db.refresh(imp)
    return _serialize(imp)


@router.delete("/{imp_id}")
def borrar(
    imp_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    imp = db.get(Importacion, imp_id)
    if not imp or imp.empresa_id != empresa_id:
        raise HTTPException(404, "Importacion no existe")
    db.delete(imp)
    db.commit()
    return {"ok": True}


class AplicarCostosIn(BaseModel):
    """Cuales renglones aplicar (por id) y opcion de sobreescribir stock."""
    renglon_ids: list[int]
    sumar_stock: bool = True  # true = sumar al stock actual; false = solo actualizar costo


@router.post("/{imp_id}/aplicar-al-catalogo")
def aplicar_al_catalogo(
    imp_id: int, payload: AplicarCostosIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Aplica los costos unitarios calculados a las variantes ligadas.
    Requiere que cada renglon tenga variante_id."""
    imp = db.get(Importacion, imp_id)
    if not imp or imp.empresa_id != empresa_id:
        raise HTTPException(404, "Importacion no existe")

    calc = _calcular(imp)
    calc_by_id = {r["id"]: r for r in calc["renglones"]}

    aplicados = []
    saltados = []
    for r in imp.renglones:
        if r.id not in payload.renglon_ids:
            continue
        if not r.variante_id:
            saltados.append({"renglon_id": r.id, "razon": "sin variante ligada"})
            continue
        var = db.get(VarianteProducto, r.variante_id)
        if not var:
            saltados.append({"renglon_id": r.id, "razon": "variante inexistente"})
            continue
        c = calc_by_id.get(r.id, {})
        # Actualizar costo promedio ponderado si sumamos stock
        nuevo_costo = c.get("costo_unit_final_mxn", 0)
        piezas = float(r.piezas)
        if payload.sumar_stock and piezas > 0:
            stock_actual = float(var.stock_actual or 0)
            costo_actual = float(var.costo_promedio or 0)
            if stock_actual + piezas > 0:
                nuevo_costo = round(
                    (stock_actual * costo_actual + piezas * nuevo_costo)
                    / (stock_actual + piezas), 4
                )
            var.stock_actual = stock_actual + piezas
        var.costo_promedio = nuevo_costo
        # Cache en el renglon
        r.costo_unit_final_mxn = c.get("costo_unit_final_mxn", 0)
        r.precio_venta_sugerido_mxn = c.get("precio_venta_sugerido_mxn", 0)
        aplicados.append({
            "renglon_id": r.id, "variante_id": var.id,
            "nuevo_costo_promedio": float(var.costo_promedio),
            "nuevo_stock": float(var.stock_actual),
        })

    if imp.estatus == "borrador":
        imp.estatus = "recibida"
    db.commit()
    return {"aplicados": aplicados, "saltados": saltados}


@router.get("/{imp_id}/calcular")
def calcular(
    imp_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    imp = db.get(Importacion, imp_id)
    if not imp or imp.empresa_id != empresa_id:
        raise HTTPException(404, "Importacion no existe")
    return _calcular(imp)
