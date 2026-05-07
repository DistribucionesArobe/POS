"""Generacion de folios consecutivos por tipo de documento y empresa."""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import DocumentoVenta


PREFIJOS = {
    "TICKET": "T",
    "REMISION": "R",
    "FACTURA": "F",
    "NOTA_CREDITO": "NC",
}


def siguiente_folio(db: Session, tipo: str, empresa_id: int) -> str:
    """Folios consecutivos POR EMPRESA para que cada empresa tenga su propia serie.

    Ejemplo: Aceromax-T-000001, Arobe-T-000001 (mismo prefijo, distintos prefijos
    de empresa concatenados). Aqui usamos un prefijo de empresa numerico simple.
    """
    prefijo = PREFIJOS.get(tipo, "X")
    n = (
        db.query(func.count(DocumentoVenta.id))
        .filter(DocumentoVenta.tipo == tipo)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .scalar()
    ) or 0
    return f"E{empresa_id}-{prefijo}-{n + 1:06d}"
