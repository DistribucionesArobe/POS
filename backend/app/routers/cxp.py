"""Compras y cuentas por pagar - filtrado por empresa."""
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import (
    CuentaPorPagar, Compra, Proveedor, PanelCxP, AbonoCxP,
    DocumentoVenta, CuentaPorCobrar,
)
from app.models.venta import EstatusDocumento, TipoDocumento
from app.schemas.compra import CompraIn, AbonoCxPIn
from app.services import compra_service
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.get("/cartera")
def cartera_proveedores(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
    incluir_pagadas: bool = False,
    anio: int | None = None,
    mes: int | None = None,
    arrastrar_vencidas: bool = True,  # CxP vencidas de meses anteriores tambien aparecen
):
    """Lista CxP. Incluye tanto las ligadas a una Compra como las manuales.

    Comportamiento del filtro por mes:
    - CxP que vencen EN ese mes (default)
    - + CxP vencidas en meses anteriores que aun no se pagan (arrastrar_vencidas=True)
    - + CxP sin fecha de vencimiento que llegaron en ese mes

    Esto replica el flujo Excel de 'copy/paste de pendientes al mes siguiente'
    pero automatico: las facturas no pagadas te siguen mes a mes hasta saldarlas.
    """
    q = (
        db.query(CuentaPorPagar, Proveedor)
        .join(Proveedor, Proveedor.id == CuentaPorPagar.proveedor_id)
        .outerjoin(Compra, Compra.id == CuentaPorPagar.compra_id)
        .filter(or_(
            CuentaPorPagar.empresa_id == empresa_id,
            Compra.empresa_id == empresa_id,
        ))
    )
    if not incluir_pagadas:
        q = q.filter(CuentaPorPagar.pagado == False)
    if anio and mes:
        from sqlalchemy import and_
        ini = datetime(anio, mes, 1)
        fin = datetime(anio + 1, 1, 1) if mes == 12 else datetime(anio, mes + 1, 1)
        filtros_mes = [
            # Vencen EN el mes
            CuentaPorPagar.fecha_vencimiento.between(ini, fin),
            # Sin fecha de vencimiento pero recibida en el mes
            and_(
                CuentaPorPagar.fecha_vencimiento.is_(None),
                CuentaPorPagar.fecha_recepcion.between(ini, fin),
            ),
        ]
        if arrastrar_vencidas:
            # CxP vencidas antes del mes y aun no pagadas (se arrastran)
            filtros_mes.append(and_(
                CuentaPorPagar.fecha_vencimiento < ini,
                CuentaPorPagar.pagado == False,
            ))
        q = q.filter(or_(*filtros_mes))

    rows = q.all()
    out = []
    for cxp, prov in rows:
        compra = db.get(Compra, cxp.compra_id) if cxp.compra_id else None
        out.append({
            "cxp_id": cxp.id, "proveedor_id": prov.id, "proveedor": prov.nombre,
            "compra_id": cxp.compra_id,
            "compra_folio": compra.folio_interno if compra else None,
            "folio_factura": cxp.folio_factura,
            "fecha_recepcion": cxp.fecha_recepcion.isoformat() if cxp.fecha_recepcion else None,
            "observaciones": cxp.observaciones,
            "monto_original": float(cxp.monto_original),
            "saldo": float(cxp.saldo),
            "saldado": float(cxp.monto_original) - float(cxp.saldo),
            "fecha_vencimiento": cxp.fecha_vencimiento.isoformat() if cxp.fecha_vencimiento else None,
            "pagado": cxp.pagado,
            "manual": cxp.compra_id is None,
        })
    # Orden por fecha vencimiento
    out.sort(key=lambda x: x.get("fecha_vencimiento") or x.get("fecha_recepcion") or "")
    return out


# ===== CxP manual (estilo Excel) =====

class CxPManualIn(BaseModel):
    proveedor_id: int | None = None
    proveedor_nombre: str | None = None  # si no existe, lo creamos
    folio_factura: str | None = None
    fecha_recepcion: date | None = None
    fecha_vencimiento: date | None = None
    monto_original: float = Field(gt=0)
    saldado: float = Field(default=0, ge=0)
    observaciones: str | None = None


@router.post("/manual")
def crear_cxp_manual(
    payload: CxPManualIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Crea una CxP sin compra ligada (captura rapida estilo Excel)."""
    # Resolver proveedor
    if payload.proveedor_id:
        prov = db.get(Proveedor, payload.proveedor_id)
        if not prov or prov.empresa_id != empresa_id:
            raise HTTPException(400, "Proveedor no existe o de otra empresa")
    elif payload.proveedor_nombre:
        # Buscar por nombre, si no existe crear
        prov = (
            db.query(Proveedor)
            .filter(Proveedor.empresa_id == empresa_id)
            .filter(Proveedor.nombre.ilike(payload.proveedor_nombre.strip()))
            .first()
        )
        if not prov:
            prov = Proveedor(
                empresa_id=empresa_id,
                nombre=payload.proveedor_nombre.strip(),
            )
            db.add(prov)
            db.flush()
    else:
        raise HTTPException(400, "Captura proveedor_id o proveedor_nombre")

    if payload.saldado > payload.monto_original:
        raise HTTPException(400, "Saldado no puede exceder el monto original")

    saldo = round(payload.monto_original - payload.saldado, 2)
    cxp = CuentaPorPagar(
        empresa_id=empresa_id,
        proveedor_id=prov.id,
        compra_id=None,
        folio_factura=payload.folio_factura,
        fecha_recepcion=datetime.combine(payload.fecha_recepcion, datetime.min.time()) if payload.fecha_recepcion else datetime.utcnow(),
        fecha_vencimiento=datetime.combine(payload.fecha_vencimiento, datetime.min.time()) if payload.fecha_vencimiento else None,
        observaciones=payload.observaciones,
        monto_original=payload.monto_original,
        saldo=saldo,
        pagado=saldo <= 0.01,
    )
    db.add(cxp)
    db.commit()
    db.refresh(cxp)
    return {"id": cxp.id, "proveedor": prov.nombre, "saldo": float(cxp.saldo)}


@router.patch("/manual/{cxp_id}")
def actualizar_cxp_manual(
    cxp_id: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Editar campos de una CxP (folio_factura, observaciones, fechas, saldado)."""
    cxp = db.get(CuentaPorPagar, cxp_id)
    if not cxp:
        raise HTTPException(404, "CxP no existe")
    # Validar empresa (via compra o empresa_id directo)
    if cxp.empresa_id and cxp.empresa_id != empresa_id:
        raise HTTPException(403, "CxP de otra empresa")
    if cxp.compra_id:
        compra = db.get(Compra, cxp.compra_id)
        if compra and compra.empresa_id != empresa_id:
            raise HTTPException(403, "CxP de otra empresa")

    if "folio_factura" in payload:
        cxp.folio_factura = payload["folio_factura"] or None
    if "observaciones" in payload:
        cxp.observaciones = payload["observaciones"] or None
    if "fecha_vencimiento" in payload and payload["fecha_vencimiento"]:
        cxp.fecha_vencimiento = datetime.fromisoformat(payload["fecha_vencimiento"])
    if "fecha_recepcion" in payload and payload["fecha_recepcion"]:
        cxp.fecha_recepcion = datetime.fromisoformat(payload["fecha_recepcion"])
    if "saldado" in payload:
        saldado = float(payload["saldado"])
        if saldado > float(cxp.monto_original):
            raise HTTPException(400, "Saldado no puede exceder el monto original")
        cxp.saldo = round(float(cxp.monto_original) - saldado, 2)
        cxp.pagado = cxp.saldo <= 0.01
    db.commit()
    return {"ok": True}


@router.delete("/manual/{cxp_id}")
def borrar_cxp_manual(
    cxp_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Solo se pueden borrar CxP manuales (las ligadas a Compra hay que cancelar la compra)."""
    cxp = db.get(CuentaPorPagar, cxp_id)
    if not cxp:
        raise HTTPException(404, "CxP no existe")
    if cxp.compra_id is not None:
        raise HTTPException(400, "Esta CxP esta ligada a una Compra; no se puede borrar suelta")
    if cxp.empresa_id and cxp.empresa_id != empresa_id:
        raise HTTPException(403, "CxP de otra empresa")
    db.delete(cxp)
    db.commit()
    return {"ok": True}


# ===== Panel mensual (tablero estilo Excel) =====

class PanelIn(BaseModel):
    anio: int
    mes: int
    venta_objetivo_mes: float = 0
    saldo_banco: float = 0
    usd_mxn: float = 0
    notas: str | None = None


@router.get("/tablero")
def tablero_cxp(
    anio: int = Query(...),
    mes: int = Query(..., ge=1, le=12),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Devuelve panel + KPIs calculados + lista de CxP del mes."""
    # Panel (upsert pasivo - lo trae aunque no exista)
    panel = (
        db.query(PanelCxP)
        .filter(PanelCxP.empresa_id == empresa_id)
        .filter(PanelCxP.anio == anio, PanelCxP.mes == mes)
        .first()
    )
    if not panel:
        panel_dict = {
            "anio": anio, "mes": mes,
            "venta_objetivo_mes": 0, "saldo_banco": 0, "usd_mxn": 0, "notas": None,
        }
    else:
        panel_dict = {
            "id": panel.id, "anio": panel.anio, "mes": panel.mes,
            "venta_objetivo_mes": float(panel.venta_objetivo_mes),
            "saldo_banco": float(panel.saldo_banco),
            "usd_mxn": float(panel.usd_mxn),
            "notas": panel.notas,
            "actualizado_en": panel.actualizado_en.isoformat(),
        }

    # KPIs auto-calculados del POS
    ini_mes = datetime(anio, mes, 1)
    fin_mes = datetime(anio + 1, 1, 1) if mes == 12 else datetime(anio, mes + 1, 1)
    hoy = datetime.utcnow().date()
    dias_mes = (fin_mes - ini_mes).days
    if ini_mes.date() <= hoy < fin_mes.date():
        dia_actual = (hoy - ini_mes.date()).days + 1
    else:
        dia_actual = dias_mes

    # Ventas del mes
    venta_mes = (
        db.query(func.coalesce(func.sum(DocumentoVenta.total), 0))
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.fecha >= ini_mes, DocumentoVenta.fecha < fin_mes)
        .filter(DocumentoVenta.tipo.in_([
            TipoDocumento.TICKET.value, TipoDocumento.FACTURA.value, TipoDocumento.REMISION.value,
        ]))
        .filter(DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value)
        .scalar()
    )
    venta_mes = float(venta_mes or 0)

    # Total CxP abiertas (todas, no solo del mes)
    cxp_total = (
        db.query(func.coalesce(func.sum(CuentaPorPagar.saldo), 0))
        .outerjoin(Compra, Compra.id == CuentaPorPagar.compra_id)
        .filter(or_(
            CuentaPorPagar.empresa_id == empresa_id,
            Compra.empresa_id == empresa_id,
        ))
        .filter(CuentaPorPagar.pagado == False)
        .scalar()
    )
    cxp_total = float(cxp_total or 0)

    # CxP vencen este mes
    cxp_del_mes = (
        db.query(func.coalesce(func.sum(CuentaPorPagar.saldo), 0))
        .outerjoin(Compra, Compra.id == CuentaPorPagar.compra_id)
        .filter(or_(
            CuentaPorPagar.empresa_id == empresa_id,
            Compra.empresa_id == empresa_id,
        ))
        .filter(CuentaPorPagar.pagado == False)
        .filter(CuentaPorPagar.fecha_vencimiento.between(ini_mes, fin_mes))
        .scalar()
    )
    cxp_del_mes = float(cxp_del_mes or 0)

    # Total CxC abierta
    cxc_total = (
        db.query(func.coalesce(func.sum(CuentaPorCobrar.saldo), 0))
        .join(DocumentoVenta, DocumentoVenta.id == CuentaPorCobrar.documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(CuentaPorCobrar.pagado == False)
        .scalar()
    )
    cxc_total = float(cxc_total or 0)

    # Cálculos del Excel
    venta_objetivo = panel_dict["venta_objetivo_mes"]
    restante_meta = max(0, venta_objetivo - venta_mes)
    dias_restantes = max(1, dias_mes - dia_actual + 1)
    venta_promedio_dia = (venta_mes / dia_actual) if dia_actual else 0
    venta_estimada_mes = venta_promedio_dia * dias_mes
    a_vender_por_dia = restante_meta / dias_restantes
    diferencia = (cxc_total + venta_estimada_mes) - cxp_total

    return {
        "panel": panel_dict,
        "kpis": {
            "dia_actual": dia_actual,
            "dias_mes": dias_mes,
            "dias_restantes": dias_restantes,
            "venta_mes": round(venta_mes, 2),
            "venta_promedio_dia": round(venta_promedio_dia, 2),
            "venta_estimada_mes": round(venta_estimada_mes, 2),
            "restante_meta": round(restante_meta, 2),
            "a_vender_por_dia": round(a_vender_por_dia, 2),
            "cxp_total": round(cxp_total, 2),
            "cxp_del_mes": round(cxp_del_mes, 2),
            "cxc_total": round(cxc_total, 2),
            "diferencia": round(diferencia, 2),
        },
    }


@router.post("/panel")
def upsert_panel(
    payload: PanelIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Crea o actualiza el panel mensual del usuario."""
    panel = (
        db.query(PanelCxP)
        .filter(PanelCxP.empresa_id == empresa_id)
        .filter(PanelCxP.anio == payload.anio, PanelCxP.mes == payload.mes)
        .first()
    )
    if not panel:
        panel = PanelCxP(empresa_id=empresa_id, anio=payload.anio, mes=payload.mes)
        db.add(panel)
    panel.venta_objetivo_mes = payload.venta_objetivo_mes
    panel.saldo_banco = payload.saldo_banco
    panel.usd_mxn = payload.usd_mxn
    panel.notas = payload.notas
    panel.actualizado_en = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/compras")
def listar_compras(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Compra)
        .filter(Compra.empresa_id == empresa_id)
        .order_by(Compra.fecha_recepcion.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": c.id, "folio": c.folio_interno, "proveedor_id": c.proveedor_id,
            "uuid_cfdi": c.uuid_cfdi,
            "folio_factura_proveedor": c.folio_factura_proveedor,
            "subtotal": float(c.subtotal), "iva": float(c.iva), "total": float(c.total),
            "estatus": c.estatus,
            "fecha_recepcion": c.fecha_recepcion.isoformat(),
        }
        for c in rows
    ]


@router.get("/compras/{compra_id}")
def obtener_compra(
    compra_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    compra = (
        db.query(Compra)
        .options(joinedload(Compra.conceptos))
        .filter(Compra.id == compra_id, Compra.empresa_id == empresa_id)
        .first()
    )
    if not compra:
        raise HTTPException(404, "Compra no existe")
    return {
        "id": compra.id, "folio": compra.folio_interno,
        "proveedor_id": compra.proveedor_id,
        "uuid_cfdi": compra.uuid_cfdi,
        "folio_factura_proveedor": compra.folio_factura_proveedor,
        "fecha_recepcion": compra.fecha_recepcion.isoformat(),
        "subtotal": float(compra.subtotal), "iva": float(compra.iva), "total": float(compra.total),
        "estatus": compra.estatus,
        "notas": compra.notas,
        "conceptos": [
            {
                "id": c.id, "variante_id": c.variante_id,
                "descripcion": c.descripcion,
                "cantidad": float(c.cantidad),
                "costo_unitario": float(c.costo_unitario),
                "importe": float(c.importe),
            }
            for c in compra.conceptos
        ],
    }


@router.post("/compras")
def crear_compra(
    payload: CompraIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        compra = compra_service.crear_compra(db, payload, empresa_id)
        return {"id": compra.id, "folio": compra.folio_interno, "total": float(compra.total)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/abono")
def registrar_abono(
    payload: AbonoCxPIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        a = compra_service.aplicar_abono_cxp(db, payload, empresa_id)
        return {"id": a.id, "monto": float(a.monto)}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ===== Export XLSX del tablero CxP =====

@router.get("/cartera-xlsx")
def export_cartera_proveedores_xlsx(
    anio: int | None = None,
    mes: int | None = None,
    incluir_pagadas: bool = False,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Export imprimible para entregar a familia/equipo: a quien debemos, cuanto, cuando vence."""
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from fastapi.responses import Response

    q = (
        db.query(CuentaPorPagar, Proveedor)
        .join(Proveedor, Proveedor.id == CuentaPorPagar.proveedor_id)
        .outerjoin(Compra, Compra.id == CuentaPorPagar.compra_id)
        .filter(or_(
            CuentaPorPagar.empresa_id == empresa_id,
            Compra.empresa_id == empresa_id,
        ))
    )
    if not incluir_pagadas:
        q = q.filter(CuentaPorPagar.pagado == False)
    if anio and mes:
        ini = datetime(anio, mes, 1)
        fin = datetime(anio + 1, 1, 1) if mes == 12 else datetime(anio, mes + 1, 1)
        q = q.filter(or_(
            CuentaPorPagar.fecha_vencimiento.between(ini, fin),
            CuentaPorPagar.fecha_recepcion.between(ini, fin),
        ))

    filas = q.all()
    # Ordenar por fecha vencimiento
    filas.sort(key=lambda r: (
        r[0].fecha_vencimiento or r[0].fecha_recepcion or datetime.max
    ))

    wb = Workbook()
    ws = wb.active
    ws.title = "CxP"

    titulo = "Cuentas por Pagar"
    if anio and mes:
        meses = ["", "Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
        titulo += f" — {meses[mes]} {anio}"

    ws["A1"] = titulo
    ws["A1"].font = Font(bold=True, size=14)
    ws.merge_cells("A1:H1")
    ws["A2"] = f"Generado: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}"
    ws["A2"].font = Font(italic=True, size=10, color="6B7280")
    ws.merge_cells("A2:H2")

    headers = ["Folio factura", "Llegada", "Vence", "Proveedor",
               "Observaciones", "Monto", "Saldado", "Saldo"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=4, column=col, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F2937")
        c.alignment = Alignment(horizontal="center")

    row = 5
    total_monto = 0.0
    total_saldado = 0.0
    total_saldo = 0.0
    for cxp, prov in filas:
        compra = db.get(Compra, cxp.compra_id) if cxp.compra_id else None
        folio = cxp.folio_factura or (compra.folio_interno if compra else "")
        ws.cell(row=row, column=1, value=folio)
        ws.cell(row=row, column=2, value=cxp.fecha_recepcion.strftime("%d/%m/%Y") if cxp.fecha_recepcion else "")
        ws.cell(row=row, column=3, value=cxp.fecha_vencimiento.strftime("%d/%m/%Y") if cxp.fecha_vencimiento else "")
        ws.cell(row=row, column=4, value=prov.nombre)
        ws.cell(row=row, column=5, value=cxp.observaciones or "")
        m = float(cxp.monto_original)
        s = float(cxp.saldo)
        ws.cell(row=row, column=6, value=m).number_format = '"$"#,##0.00'
        ws.cell(row=row, column=7, value=m - s).number_format = '"$"#,##0.00'
        ws.cell(row=row, column=8, value=s).number_format = '"$"#,##0.00'
        total_monto += m
        total_saldado += (m - s)
        total_saldo += s
        # Resaltar si esta vencida
        if cxp.fecha_vencimiento and cxp.fecha_vencimiento.date() < datetime.utcnow().date() and not cxp.pagado:
            for col in range(1, 9):
                ws.cell(row=row, column=col).fill = PatternFill("solid", fgColor="FEE2E2")
        row += 1

    # Totales
    row += 1
    ws.cell(row=row, column=5, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=6, value=total_monto).number_format = '"$"#,##0.00'
    ws.cell(row=row, column=6).font = Font(bold=True)
    ws.cell(row=row, column=7, value=total_saldado).number_format = '"$"#,##0.00'
    ws.cell(row=row, column=7).font = Font(bold=True)
    ws.cell(row=row, column=8, value=total_saldo).number_format = '"$"#,##0.00'
    ws.cell(row=row, column=8).font = Font(bold=True)
    ws.cell(row=row, column=8).fill = PatternFill("solid", fgColor="DBEAFE")

    for col, w in zip("ABCDEFGH", [14, 12, 12, 26, 30, 14, 14, 14]):
        ws.column_dimensions[col].width = w

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    suffix = f"{anio}-{mes:02d}" if anio and mes else "todas"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="cxp_{suffix}.xlsx"'},
    )
