"""Proveedores filtrados por empresa."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Proveedor
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.get("")
def listar_proveedores(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = db.query(Proveedor).filter(
        Proveedor.empresa_id == empresa_id, Proveedor.activo == True
    ).all()
    return [{"id": p.id, "nombre": p.nombre, "rfc": p.rfc} for p in rows]
