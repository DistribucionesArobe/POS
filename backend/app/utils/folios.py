"""Generacion de folios consecutivos por tipo de documento."""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import DocumentoVenta


PREFIJOS = {
    "TICKET": "T",
    "REMISION": "R",
    "FACTURA": "F",
    "NOTA_CREDITO": "NC",
}


def siguiente_folio(db: Session, tipo: str) -> str:
    prefijo = PREFIJOS.get(tipo, "X")
    n = db.query(func.count(DocumentoVenta.id)).filter(DocumentoVenta.tipo == tipo).scalar() or 0
    return f"{prefijo}-{n + 1:06d}"
