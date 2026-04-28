"""Clientes."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Cliente

router = APIRouter()


@router.get("")
def listar_clientes(
    q: str | None = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Cliente).filter(Cliente.activo == True)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Cliente.nombre.ilike(like),
            Cliente.rfc.ilike(like),
            Cliente.whatsapp.ilike(like),
        ))
    return [
        {
            "id": c.id, "nombre": c.nombre, "rfc": c.rfc,
            "whatsapp": c.whatsapp, "dias_credito": c.dias_credito,
        }
        for c in query.limit(100).all()
    ]


# TODO: POST /clientes, GET /{id}, PUT /{id}, GET /{id}/saldo, GET /{id}/cartera
