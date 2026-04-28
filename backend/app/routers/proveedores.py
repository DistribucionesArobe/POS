"""Proveedores."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Proveedor

router = APIRouter()


@router.get("")
def listar_proveedores(db: Session = Depends(get_db)):
    rows = db.query(Proveedor).filter(Proveedor.activo == True).all()
    return [{"id": p.id, "nombre": p.nombre, "rfc": p.rfc} for p in rows]


# TODO: CRUD completo
