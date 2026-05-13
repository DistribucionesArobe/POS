"""CRUD de conceptos de tarjetas de credito. Solo admin."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    ConceptoTarjeta, TarjetaTotal, TarjetaSubcuenta, Usuario,
    GastoPersonal, IngresoPersonal,
)
from app.services.security import get_active_empresa_id, require_admin

router = APIRouter()

# 4 secciones: cada tarjeta (AMEX, Banorte) tiene dos negocios (Padel, Aceromax)
SECCIONES = {"amex_padel", "amex_aceromax", "banorte_padel", "banorte_aceromax"}
TARJETAS = {"amex", "banorte"}


@router.get("")
def listar(
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ConceptoTarjeta)
        .filter(ConceptoTarjeta.empresa_id == empresa_id)
        .order_by(ConceptoTarjeta.seccion, ConceptoTarjeta.orden, ConceptoTarjeta.id)
        .all()
    )
    return [
        {
            "id": c.id, "seccion": c.seccion,
            "concepto": c.concepto, "monto": float(c.monto or 0),
            "orden": c.orden,
        }
        for c in rows
    ]


@router.post("")
def crear(
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    seccion = (payload.get("seccion") or "").strip().lower()
    if seccion not in SECCIONES:
        raise HTTPException(400, f"Seccion invalida. Usa: {sorted(SECCIONES)}")
    concepto = (payload.get("concepto") or "").strip()
    if not concepto:
        raise HTTPException(400, "Concepto requerido")
    try:
        monto = float(payload.get("monto") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto invalido")
    siguiente = (
        db.query(ConceptoTarjeta)
        .filter(ConceptoTarjeta.empresa_id == empresa_id, ConceptoTarjeta.seccion == seccion)
        .count()
    ) + 1
    c = ConceptoTarjeta(
        empresa_id=empresa_id, seccion=seccion,
        concepto=concepto, monto=monto, orden=siguiente,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "seccion": c.seccion, "concepto": c.concepto, "monto": float(c.monto), "orden": c.orden}


@router.patch("/{cid}")
def actualizar(
    cid: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.get(ConceptoTarjeta, cid)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Concepto no existe")
    if "concepto" in payload:
        nuevo = (payload["concepto"] or "").strip()
        if nuevo:
            c.concepto = nuevo
    if "monto" in payload:
        try:
            c.monto = float(payload["monto"])
        except (TypeError, ValueError):
            raise HTTPException(400, "Monto invalido")
    if "seccion" in payload:
        s = (payload["seccion"] or "").strip().lower()
        if s in SECCIONES:
            c.seccion = s
    db.commit()
    return {"ok": True, "id": c.id}


@router.delete("/{cid}")
def borrar(
    cid: int,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.get(ConceptoTarjeta, cid)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Concepto no existe")
    db.delete(c)
    db.commit()
    return {"ok": True}


# ===== Totales de deuda por tarjeta (AMEX, Banorte) =====


@router.get("/totales")
def listar_totales(
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(TarjetaTotal)
        .filter(TarjetaTotal.empresa_id == empresa_id)
        .all()
    )
    # Devuelve dict tarjeta -> total. Si no hay registro, 0.
    out = {t: 0.0 for t in TARJETAS}
    for r in rows:
        if r.tarjeta in out:
            out[r.tarjeta] = float(r.total_deuda or 0)
    return out


@router.put("/totales/{tarjeta}")
def actualizar_total(
    tarjeta: str,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    tarjeta = (tarjeta or "").strip().lower()
    if tarjeta not in TARJETAS:
        raise HTTPException(400, f"Tarjeta invalida. Usa: {sorted(TARJETAS)}")
    try:
        total = float(payload.get("total") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Total invalido")
    row = (
        db.query(TarjetaTotal)
        .filter(TarjetaTotal.empresa_id == empresa_id, TarjetaTotal.tarjeta == tarjeta)
        .first()
    )
    if row:
        row.total_deuda = total
        row.actualizado_en = datetime.utcnow()
    else:
        row = TarjetaTotal(empresa_id=empresa_id, tarjeta=tarjeta, total_deuda=total)
        db.add(row)
    db.commit()
    return {"tarjeta": tarjeta, "total": total}


# ===== Sub-cuentas de tarjetas (Infinite, Platinum, etc.) =====
# La TOTAL DEUDA mostrada en el header es la suma de las subcuentas de cada tarjeta.


@router.get("/subcuentas")
def listar_subcuentas(
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(TarjetaSubcuenta)
        .filter(TarjetaSubcuenta.empresa_id == empresa_id)
        .order_by(TarjetaSubcuenta.tarjeta, TarjetaSubcuenta.orden, TarjetaSubcuenta.id)
        .all()
    )
    return [
        {
            "id": s.id, "tarjeta": s.tarjeta, "nombre": s.nombre,
            "monto": float(s.monto or 0), "orden": s.orden,
        }
        for s in rows
    ]


@router.post("/subcuentas")
def crear_subcuenta(
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    tarjeta = (payload.get("tarjeta") or "").strip().lower()
    if tarjeta not in TARJETAS:
        raise HTTPException(400, f"Tarjeta invalida. Usa: {sorted(TARJETAS)}")
    nombre = (payload.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(400, "Nombre requerido")
    try:
        monto = float(payload.get("monto") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto invalido")
    siguiente = (
        db.query(TarjetaSubcuenta)
        .filter(TarjetaSubcuenta.empresa_id == empresa_id, TarjetaSubcuenta.tarjeta == tarjeta)
        .count()
    ) + 1
    s = TarjetaSubcuenta(
        empresa_id=empresa_id, tarjeta=tarjeta, nombre=nombre, monto=monto, orden=siguiente,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "tarjeta": s.tarjeta, "nombre": s.nombre, "monto": float(s.monto), "orden": s.orden}


@router.patch("/subcuentas/{sid}")
def actualizar_subcuenta(
    sid: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    s = db.get(TarjetaSubcuenta, sid)
    if not s or s.empresa_id != empresa_id:
        raise HTTPException(404, "Subcuenta no existe")
    if "nombre" in payload:
        nuevo = (payload["nombre"] or "").strip()
        if nuevo:
            s.nombre = nuevo
    if "monto" in payload:
        try:
            s.monto = float(payload["monto"])
        except (TypeError, ValueError):
            raise HTTPException(400, "Monto invalido")
    db.commit()
    return {"ok": True, "id": s.id}


@router.delete("/subcuentas/{sid}")
def borrar_subcuenta(
    sid: int,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    s = db.get(TarjetaSubcuenta, sid)
    if not s or s.empresa_id != empresa_id:
        raise HTTPException(404, "Subcuenta no existe")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ===== Control de gastos personales (mensual) =====


@router.get("/personales")
def listar_personales(
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    gastos = (
        db.query(GastoPersonal)
        .filter(GastoPersonal.empresa_id == empresa_id)
        .order_by(GastoPersonal.orden, GastoPersonal.id)
        .all()
    )
    ingresos = (
        db.query(IngresoPersonal)
        .filter(IngresoPersonal.empresa_id == empresa_id)
        .order_by(IngresoPersonal.orden, IngresoPersonal.id)
        .all()
    )
    return {
        "gastos": [
            {"id": g.id, "dia": g.dia, "tipo": g.tipo, "concepto": g.concepto,
             "monto": float(g.monto or 0), "orden": g.orden}
            for g in gastos
        ],
        "ingresos": [
            {"id": i.id, "fuente": i.fuente, "monto": float(i.monto or 0), "orden": i.orden}
            for i in ingresos
        ],
    }


@router.post("/personales/gastos")
def crear_gasto(payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    siguiente = db.query(GastoPersonal).filter(GastoPersonal.empresa_id == empresa_id).count() + 1
    g = GastoPersonal(
        empresa_id=empresa_id,
        dia=payload.get("dia"),
        tipo=(payload.get("tipo") or None),
        concepto=(payload.get("concepto") or None),
        monto=float(payload.get("monto") or 0),
        orden=siguiente,
    )
    db.add(g); db.commit(); db.refresh(g)
    return {"id": g.id}


@router.patch("/personales/gastos/{gid}")
def actualizar_gasto(gid: int, payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    g = db.get(GastoPersonal, gid)
    if not g or g.empresa_id != empresa_id:
        raise HTTPException(404, "Gasto no existe")
    if "dia" in payload:
        try: g.dia = int(payload["dia"]) if payload["dia"] not in (None, "") else None
        except (TypeError, ValueError): raise HTTPException(400, "Dia invalido")
    if "tipo" in payload: g.tipo = (payload["tipo"] or None)
    if "concepto" in payload: g.concepto = (payload["concepto"] or None)
    if "monto" in payload:
        try: g.monto = float(payload["monto"])
        except (TypeError, ValueError): raise HTTPException(400, "Monto invalido")
    db.commit()
    return {"ok": True}


@router.delete("/personales/gastos/{gid}")
def borrar_gasto(gid: int,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    g = db.get(GastoPersonal, gid)
    if not g or g.empresa_id != empresa_id:
        raise HTTPException(404, "Gasto no existe")
    db.delete(g); db.commit()
    return {"ok": True}


@router.post("/personales/ingresos")
def crear_ingreso(payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    siguiente = db.query(IngresoPersonal).filter(IngresoPersonal.empresa_id == empresa_id).count() + 1
    i = IngresoPersonal(
        empresa_id=empresa_id,
        fuente=(payload.get("fuente") or "Ingreso").strip(),
        monto=float(payload.get("monto") or 0),
        orden=siguiente,
    )
    db.add(i); db.commit(); db.refresh(i)
    return {"id": i.id}


@router.patch("/personales/ingresos/{iid}")
def actualizar_ingreso(iid: int, payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    i = db.get(IngresoPersonal, iid)
    if not i or i.empresa_id != empresa_id:
        raise HTTPException(404, "Ingreso no existe")
    if "fuente" in payload:
        f = (payload["fuente"] or "").strip()
        if f: i.fuente = f
    if "monto" in payload:
        try: i.monto = float(payload["monto"])
        except (TypeError, ValueError): raise HTTPException(400, "Monto invalido")
    db.commit()
    return {"ok": True}


@router.delete("/personales/ingresos/{iid}")
def borrar_ingreso(iid: int,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    i = db.get(IngresoPersonal, iid)
    if not i or i.empresa_id != empresa_id:
        raise HTTPException(404, "Ingreso no existe")
    db.delete(i); db.commit()
    return {"ok": True}
