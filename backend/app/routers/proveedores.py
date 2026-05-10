"""Proveedores - CRUD por empresa."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Proveedor
from app.schemas.proveedor import ProveedorIn, ProveedorUpdate
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.get("")
def listar_proveedores(
    q: str | None = Query(None),
    activo: bool = True,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    query = db.query(Proveedor).filter(Proveedor.empresa_id == empresa_id)
    if activo:
        query = query.filter(Proveedor.activo == True)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Proveedor.nombre.ilike(like),
            Proveedor.rfc.ilike(like),
            Proveedor.razon_social.ilike(like),
        ))
    return [
        {
            "id": p.id, "nombre": p.nombre, "rfc": p.rfc,
            "razon_social": p.razon_social, "correo": p.correo,
            "telefono": p.telefono, "dias_credito": p.dias_credito,
            "activo": p.activo,
        }
        for p in query.order_by(Proveedor.nombre).all()
    ]


@router.get("/{proveedor_id}")
def obtener_proveedor(
    proveedor_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    p = db.get(Proveedor, proveedor_id)
    if not p or p.empresa_id != empresa_id:
        raise HTTPException(404, "Proveedor no existe")
    return {
        "id": p.id, "nombre": p.nombre, "rfc": p.rfc,
        "razon_social": p.razon_social, "correo": p.correo,
        "telefono": p.telefono, "direccion": p.direccion,
        "dias_credito": p.dias_credito, "activo": p.activo,
    }


@router.post("")
def crear_proveedor(
    payload: ProveedorIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    p = Proveedor(
        empresa_id=empresa_id,
        creado_en=datetime.utcnow(),
        **payload.model_dump(),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "nombre": p.nombre}


@router.patch("/{proveedor_id}")
def actualizar_proveedor(
    proveedor_id: int, payload: ProveedorUpdate,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    p = db.get(Proveedor, proveedor_id)
    if not p or p.empresa_id != empresa_id:
        raise HTTPException(404, "Proveedor no existe")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    return {"ok": True, "id": p.id}


@router.delete("/{proveedor_id}")
def desactivar_proveedor(
    proveedor_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    p = db.get(Proveedor, proveedor_id)
    if not p or p.empresa_id != empresa_id:
        raise HTTPException(404, "Proveedor no existe")
    p.activo = False
    db.commit()
    return {"ok": True}
