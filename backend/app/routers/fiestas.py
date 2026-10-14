"""Fiestas / eventos de cumpleaños - CRUD."""
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Fiesta, Usuario
from app.services.security import get_active_empresa_id, get_current_user

router = APIRouter(prefix="/fiestas", tags=["fiestas"])

ESTATUS_VALIDOS = {"PENDIENTE", "CONFIRMADA", "REALIZADA", "CANCELADA"}


class FiestaIn(BaseModel):
    fecha: date
    nombre: str
    telefono: str | None = None
    incluye_padel: bool = False
    incluye_futbol: bool = False
    incluye_comida: bool = False
    n_platillos: int = 0
    costo_platillo: float = 80
    monto: float = 0
    anticipo: float = 0
    estatus: str = "PENDIENTE"
    notas: str | None = None


def _serialize(f: Fiesta) -> dict:
    dias_sem = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]
    n_pl = int(getattr(f, "n_platillos", 0) or 0)
    costo_pl = float(getattr(f, "costo_platillo", 80) or 80)
    return {
        "id": f.id,
        "fecha": f.fecha.isoformat() if f.fecha else None,
        "dia_semana": dias_sem[f.fecha.weekday()] if f.fecha else None,
        "nombre": f.nombre,
        "telefono": f.telefono,
        "incluye_padel": bool(f.incluye_padel),
        "incluye_futbol": bool(f.incluye_futbol),
        "incluye_comida": bool(f.incluye_comida),
        "n_platillos": n_pl,
        "costo_platillo": costo_pl,
        "costo_comida_total": round(n_pl * costo_pl, 2) if f.incluye_comida else 0,
        "monto": float(f.monto or 0),
        "anticipo": float(f.anticipo or 0),
        "saldo": float(f.monto or 0) - float(f.anticipo or 0),
        "estatus": f.estatus,
        "notas": f.notas,
        "creado_en": f.creado_en.isoformat() if f.creado_en else None,
    }


@router.get("")
def listar(
    estatus: str | None = Query(None),
    deporte: str | None = Query(None, description="padel | futbol"),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    q = db.query(Fiesta).filter(Fiesta.empresa_id == empresa_id)
    if estatus:
        q = q.filter(Fiesta.estatus == estatus.upper())
    if desde:
        q = q.filter(Fiesta.fecha >= desde)
    if hasta:
        q = q.filter(Fiesta.fecha <= hasta)
    if deporte == "padel":
        q = q.filter(Fiesta.incluye_padel == True)
    elif deporte == "futbol":
        q = q.filter(Fiesta.incluye_futbol == True)
    rows = q.order_by(Fiesta.fecha).all()
    return [_serialize(f) for f in rows]


@router.post("")
def crear(
    payload: FiestaIn,
    empresa_id: int = Depends(get_active_empresa_id),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (payload.incluye_padel or payload.incluye_futbol):
        raise HTTPException(400, "Debe incluir al menos un deporte (padel y/o futbol)")
    if payload.estatus.upper() not in ESTATUS_VALIDOS:
        raise HTTPException(400, f"Estatus invalido. Validos: {ESTATUS_VALIDOS}")
    f = Fiesta(
        empresa_id=empresa_id,
        fecha=payload.fecha,
        nombre=payload.nombre.strip(),
        telefono=(payload.telefono or "").strip() or None,
        incluye_padel=payload.incluye_padel,
        incluye_futbol=payload.incluye_futbol,
        incluye_comida=payload.incluye_comida,
        n_platillos=max(0, int(payload.n_platillos or 0)),
        costo_platillo=float(payload.costo_platillo or 80),
        monto=payload.monto or 0,
        anticipo=payload.anticipo or 0,
        estatus=payload.estatus.upper(),
        notas=(payload.notas or "").strip() or None,
        creado_por=usuario.id,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return _serialize(f)


@router.patch("/{fiesta_id}")
def actualizar(
    fiesta_id: int,
    payload: FiestaIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    f = db.get(Fiesta, fiesta_id)
    if not f or f.empresa_id != empresa_id:
        raise HTTPException(404, "Fiesta no existe")
    if payload.estatus.upper() not in ESTATUS_VALIDOS:
        raise HTTPException(400, f"Estatus invalido. Validos: {ESTATUS_VALIDOS}")
    f.fecha = payload.fecha
    f.nombre = payload.nombre.strip()
    f.telefono = (payload.telefono or "").strip() or None
    f.incluye_padel = payload.incluye_padel
    f.incluye_futbol = payload.incluye_futbol
    f.incluye_comida = payload.incluye_comida
    f.n_platillos = max(0, int(payload.n_platillos or 0))
    f.costo_platillo = float(payload.costo_platillo or 80)
    f.monto = payload.monto or 0
    f.anticipo = payload.anticipo or 0
    f.estatus = payload.estatus.upper()
    f.notas = (payload.notas or "").strip() or None
    db.commit()
    return _serialize(f)


@router.delete("/{fiesta_id}")
def borrar(
    fiesta_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    f = db.get(Fiesta, fiesta_id)
    if not f or f.empresa_id != empresa_id:
        raise HTTPException(404, "Fiesta no existe")
    db.delete(f)
    db.commit()
    return {"ok": True}
