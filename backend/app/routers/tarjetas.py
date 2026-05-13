"""CRUD de conceptos de tarjetas de credito. Solo admin."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ConceptoTarjeta, Usuario
from app.services.security import get_active_empresa_id, require_admin

router = APIRouter()

SECCIONES = {"amex_negocios", "amex_reembolsos", "banorte_padel", "banorte_aceromax"}


@router.get("")
def listar(
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ConceptoTarjeta)
        .filter(ConceptoTarjeta.empresa_id == empresa_id)
        .order_by(ConceptoTarjeta.seccion, ConceptoTarjeta.orden, ConceptoTarjeta.id)
        .all()
    )
    return [
        {
            "id": c.id, "seccion": c.seccion,
            "concepto": c.concepto, "monto": float(c.monto or 0),
            "orden": c.orden,
        }
        for c in rows
    ]


@router.post("")
def crear(
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    seccion = (payload.get("seccion") or "").strip().lower()
    if seccion not in SECCIONES:
        raise HTTPException(400, f"Seccion invalida. Usa: {sorted(SECCIONES)}")
    concepto = (payload.get("concepto") or "").strip()
    if not concepto:
        raise HTTPException(400, "Concepto requerido")
    try:
        monto = float(payload.get("monto") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto invalido")
    siguiente = (
        db.query(ConceptoTarjeta)
        .filter(ConceptoTarjeta.empresa_id == empresa_id, ConceptoTarjeta.seccion == seccion)
        .count()
    ) + 1
    c = ConceptoTarjeta(
        empresa_id=empresa_id, seccion=seccion,
        concepto=concepto, monto=monto, orden=siguiente,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "seccion": c.seccion, "concepto": c.concepto, "monto": float(c.monto), "orden": c.orden}


@router.patch("/{cid}")
def actualizar(
    cid: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.get(ConceptoTarjeta, cid)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Concepto no existe")
    if "concepto" in payload:
        nuevo = (payload["concepto"] or "").strip()
        if nuevo:
            c.concepto = nuevo
    if "monto" in payload:
        try:
            c.monto = float(payload["monto"])
        except (TypeError, ValueError):
            raise HTTPException(400, "Monto invalido")
    if "seccion" in payload:
        s = (payload["seccion"] or "").strip().lower()
        if s in SECCIONES:
            c.seccion = s
    db.commit()
    return {"ok": True, "id": c.id}


@router.delete("/{cid}")
def borrar(
    cid: int,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.get(ConceptoTarjeta, cid)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Concepto no existe")
    db.delete(c)
    db.commit()
    return {"ok": True}
