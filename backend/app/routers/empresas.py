"""CRUD de empresas. Solo super_admin."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Empresa, Usuario
from app.schemas.empresa import EmpresaIn, EmpresaUpdate
from app.services.security import get_current_user

router = APIRouter()


def _require_super(user: Usuario):
    if not user.super_admin:
        raise HTTPException(403, "Solo super admin")


@router.get("/activa")
def empresa_activa(
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Datos fiscales completos de la empresa actualmente activa para el usuario."""
    if not user.empresa_id:
        raise HTTPException(400, "Usuario sin empresa activa")
    e = db.get(Empresa, user.empresa_id)
    if not e:
        raise HTTPException(404, "Empresa no existe")
    return {
        "id": e.id,
        "nombre": e.nombre,
        "razon_social": e.razon_social,
        "rfc": e.rfc,
        "regimen_fiscal": e.regimen_fiscal,
        "codigo_postal": e.codigo_postal,
    }


@router.get("")
def listar_empresas(
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.super_admin:
        rows = db.query(Empresa).order_by(Empresa.nombre).all()
    elif user.empresa_id:
        e = db.get(Empresa, user.empresa_id)
        rows = [e] if e else []
    else:
        rows = []
    return [
        {
            "id": e.id, "nombre": e.nombre, "rfc": e.rfc,
            "razon_social": e.razon_social, "regimen_fiscal": e.regimen_fiscal,
            "codigo_postal": e.codigo_postal,
            "facturama_user": e.facturama_user,
            "facturama_api_url": e.facturama_api_url,
            "activa": e.activa,
        }
        for e in rows
    ]


@router.post("")
def crear_empresa(
    payload: EmpresaIn,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super(user)
    if db.query(Empresa).filter(Empresa.rfc == payload.rfc).first():
        raise HTTPException(400, f"Ya existe empresa con RFC {payload.rfc}")
    e = Empresa(**payload.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"id": e.id, "nombre": e.nombre, "rfc": e.rfc}


@router.patch("/{empresa_id}")
def actualizar_empresa(
    empresa_id: int,
    payload: EmpresaUpdate,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super(user)
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(404, "Empresa no existe")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    return {"ok": True, "id": e.id}
