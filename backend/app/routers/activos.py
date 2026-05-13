"""CRUD de Activos (vehiculos, gasolina, comapa). Solo admin."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Activo, Usuario
from app.services.security import get_active_empresa_id, require_admin

router = APIRouter()


CATEGORIAS_VALIDAS = {"vehiculo", "gasolina", "comapa"}


@router.get("")
def listar(
    categoria: str | None = Query(None),
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Lista activos. Si pasas categoria, filtra."""
    q = db.query(Activo).filter(Activo.empresa_id == empresa_id)
    if categoria:
        q = q.filter(Activo.categoria == categoria)
    rows = q.order_by(Activo.categoria, Activo.orden, Activo.id).all()
    return [
        {
            "id": a.id, "categoria": a.categoria,
            "col1": a.col1, "col2": a.col2, "col3": a.col3,
            "orden": a.orden,
        }
        for a in rows
    ]


@router.post("")
def crear(
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    categoria = (payload.get("categoria") or "").strip().lower()
    if categoria not in CATEGORIAS_VALIDAS:
        raise HTTPException(400, f"Categoria invalida. Usa una de: {sorted(CATEGORIAS_VALIDAS)}")
    siguiente_orden = (
        db.query(Activo)
        .filter(Activo.empresa_id == empresa_id, Activo.categoria == categoria)
        .count()
    ) + 1
    a = Activo(
        empresa_id=empresa_id,
        categoria=categoria,
        col1=(payload.get("col1") or None),
        col2=(payload.get("col2") or None),
        col3=(payload.get("col3") or None),
        orden=int(payload.get("orden") or siguiente_orden),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return {
        "id": a.id, "categoria": a.categoria,
        "col1": a.col1, "col2": a.col2, "col3": a.col3, "orden": a.orden,
    }


@router.patch("/{activo_id}")
def actualizar(
    activo_id: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    a = db.get(Activo, activo_id)
    if not a or a.empresa_id != empresa_id:
        raise HTTPException(404, "Activo no existe")
    for campo in ("col1", "col2", "col3"):
        if campo in payload:
            v = payload[campo]
            a.__setattr__(campo, (v.strip() if isinstance(v, str) else v) or None)
    if "orden" in payload:
        try:
            a.orden = int(payload["orden"])
        except (TypeError, ValueError):
            pass
    db.commit()
    return {"ok": True, "id": a.id}


@router.delete("/{activo_id}")
def borrar(
    activo_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    a = db.get(Activo, activo_id)
    if not a or a.empresa_id != empresa_id:
        raise HTTPException(404, "Activo no existe")
    db.delete(a)
    db.commit()
    return {"ok": True}
