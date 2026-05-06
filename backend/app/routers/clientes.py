"""Clientes - CRUD completo con datos fiscales."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Cliente, CuentaPorCobrar
from app.schemas.cliente import ClienteIn, ClienteUpdate

router = APIRouter()


@router.get("")
def listar_clientes(
    q: str | None = Query(None),
    activo: bool = True,
    db: Session = Depends(get_db),
):
    query = db.query(Cliente)
    if activo:
        query = query.filter(Cliente.activo == True)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Cliente.nombre.ilike(like),
            Cliente.rfc.ilike(like),
            Cliente.razon_social.ilike(like),
            Cliente.whatsapp.ilike(like),
        ))
    rows = query.order_by(Cliente.nombre).all()
    return [
        {
            "id": c.id, "nombre": c.nombre, "rfc": c.rfc, "razon_social": c.razon_social,
            "regimen_fiscal": c.regimen_fiscal, "codigo_postal": c.codigo_postal,
            "whatsapp": c.whatsapp, "correo": c.correo, "telefono": c.telefono,
            "dias_credito": c.dias_credito,
            "limite_credito": float(c.limite_credito) if c.limite_credito else None,
            "activo": c.activo,
        }
        for c in rows
    ]


@router.get("/{cliente_id}")
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(404, "Cliente no existe")
    saldo = (
        db.query(CuentaPorCobrar)
        .filter(CuentaPorCobrar.cliente_id == cliente_id, CuentaPorCobrar.pagado == False)
        .all()
    )
    return {
        "id": c.id, "nombre": c.nombre, "rfc": c.rfc, "razon_social": c.razon_social,
        "regimen_fiscal": c.regimen_fiscal, "codigo_postal": c.codigo_postal,
        "uso_cfdi_default": c.uso_cfdi_default,
        "correo": c.correo, "telefono": c.telefono, "whatsapp": c.whatsapp,
        "direccion": c.direccion, "notas": c.notas,
        "dias_credito": c.dias_credito,
        "limite_credito": float(c.limite_credito) if c.limite_credito else None,
        "activo": c.activo,
        "saldo_total": sum(float(s.saldo) for s in saldo),
        "documentos_pendientes": len(saldo),
    }


@router.post("")
def crear_cliente(payload: ClienteIn, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not data.get("nombre"):
        data["nombre"] = data.get("razon_social") or "Cliente sin nombre"
    if data.get("rfc"):
        existe = db.query(Cliente).filter(Cliente.rfc == data["rfc"]).first()
        if existe:
            raise HTTPException(400, f"Ya existe cliente con RFC {data['rfc']}")
    c = Cliente(**data, creado_en=datetime.utcnow())
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "nombre": c.nombre, "rfc": c.rfc}


@router.patch("/{cliente_id}")
def actualizar_cliente(cliente_id: int, payload: ClienteUpdate, db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(404, "Cliente no existe")
    data = payload.model_dump(exclude_unset=True)
    if "razon_social" in data and "nombre" not in data:
        data["nombre"] = data["razon_social"] or c.nombre
    for k, v in data.items():
        setattr(c, k, v)
    db.commit()
    return {"ok": True, "id": c.id}


@router.delete("/{cliente_id}")
def desactivar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(404, "Cliente no existe")
    c.activo = False
    db.commit()
    return {"ok": True}
