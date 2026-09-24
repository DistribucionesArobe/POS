"""Academia deportiva - CRUD de pagos de alumnos."""
from datetime import date, datetime
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AcademiaPago, Usuario
from app.services.security import get_active_empresa_id, get_current_user

router = APIRouter(prefix="/academia", tags=["academia"])


def _sumar_mes(d: date) -> date:
    m = d.month + 1
    y = d.year
    if m > 12:
        m = 1; y += 1
    ultimo = monthrange(y, m)[1]
    return date(y, m, min(d.day, ultimo))


class PagoIn(BaseModel):
    fecha_pago: date | None = None
    alumno_nombre: str
    padres_nombre: str | None = None
    telefono: str | None = None
    monto_pagado: float = 0
    fecha_proximo_pago: date | None = None  # opcional; si no viene se calcula +1 mes
    deporte: str = "futbol"
    notas: str | None = None


def _serialize(p: AcademiaPago) -> dict:
    return {
        "id": p.id,
        "fecha_pago": p.fecha_pago.isoformat() if p.fecha_pago else None,
        "alumno_nombre": p.alumno_nombre,
        "padres_nombre": p.padres_nombre,
        "telefono": p.telefono,
        "monto_pagado": float(p.monto_pagado or 0),
        "fecha_proximo_pago": p.fecha_proximo_pago.isoformat() if p.fecha_proximo_pago else None,
        "deporte": p.deporte,
        "notas": p.notas,
        "creado_en": p.creado_en.isoformat() if p.creado_en else None,
    }


@router.get("")
def listar(
    deporte: str | None = None,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    q = db.query(AcademiaPago).filter(AcademiaPago.empresa_id == empresa_id)
    if deporte:
        q = q.filter(AcademiaPago.deporte == deporte)
    rows = q.order_by(AcademiaPago.fecha_pago.desc(), AcademiaPago.id.desc()).all()
    return [_serialize(p) for p in rows]


@router.post("")
def crear(
    payload: PagoIn,
    empresa_id: int = Depends(get_active_empresa_id),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fecha = payload.fecha_pago or date.today()
    prox = payload.fecha_proximo_pago or _sumar_mes(fecha)
    p = AcademiaPago(
        empresa_id=empresa_id,
        fecha_pago=fecha,
        alumno_nombre=payload.alumno_nombre.strip(),
        padres_nombre=(payload.padres_nombre or "").strip() or None,
        telefono=(payload.telefono or "").strip() or None,
        monto_pagado=payload.monto_pagado or 0,
        fecha_proximo_pago=prox,
        deporte=(payload.deporte or "futbol").strip().lower(),
        notas=(payload.notas or "").strip() or None,
        creado_por=usuario.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.patch("/{pago_id}")
def actualizar(
    pago_id: int, payload: PagoIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    p = db.get(AcademiaPago, pago_id)
    if not p or p.empresa_id != empresa_id:
        raise HTTPException(404, "Pago no existe")

    # Si cambio la fecha de pago y no vino proximo explicito, recalcular
    nueva_fecha = payload.fecha_pago or p.fecha_pago
    if payload.fecha_pago and payload.fecha_pago != p.fecha_pago and not payload.fecha_proximo_pago:
        p.fecha_proximo_pago = _sumar_mes(nueva_fecha)
    elif payload.fecha_proximo_pago:
        p.fecha_proximo_pago = payload.fecha_proximo_pago

    p.fecha_pago = nueva_fecha
    p.alumno_nombre = payload.alumno_nombre.strip()
    p.padres_nombre = (payload.padres_nombre or "").strip() or None
    p.telefono = (payload.telefono or "").strip() or None
    p.monto_pagado = payload.monto_pagado or 0
    p.deporte = (payload.deporte or "futbol").strip().lower()
    p.notas = (payload.notas or "").strip() or None
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.delete("/{pago_id}")
def borrar(
    pago_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    p = db.get(AcademiaPago, pago_id)
    if not p or p.empresa_id != empresa_id:
        raise HTTPException(404, "Pago no existe")
    db.delete(p)
    db.commit()
    return {"ok": True}
