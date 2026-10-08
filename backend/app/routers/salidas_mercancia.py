"""Entregas Pendientes: salidas de mercancia parciales contra factura madre."""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    SalidaMercancia, SalidaMercanciaItem,
    DocumentoVenta, VarianteProducto, Producto, MovimientoInventario,
    Usuario, Cliente,
)
from app.services.security import get_active_empresa_id, get_current_user

router = APIRouter(prefix="/entregas-pendientes", tags=["entregas-pendientes"])


class ItemSalidaIn(BaseModel):
    variante_id: int
    cantidad: float
    precio_unitario: float
    descripcion: str | None = None
    notas: str | None = None


class SalidaIn(BaseModel):
    documento_venta_id: int
    items: list[ItemSalidaIn]
    notas: str | None = None


# ============ LISTA DE FACTURAS CON ENTREGAS PENDIENTES ============

@router.get("")
def listar_pendientes(
    incluir_completas: bool = False,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    q = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.tiene_entregas_pendientes == True)
        .filter(DocumentoVenta.estatus != "CANCELADO")
    )
    if not incluir_completas:
        # Facturas donde todavia hay saldo pendiente
        q = q.filter(DocumentoVenta.valor_entregado < DocumentoVenta.total)
    rows = q.order_by(DocumentoVenta.fecha.desc()).all()

    resultado = []
    for d in rows:
        cli = db.get(Cliente, d.cliente_id) if d.cliente_id else None
        saldo = float(d.total) - float(d.valor_entregado or 0)
        resultado.append({
            "id": d.id,
            "folio": d.folio,
            "fecha": d.fecha.isoformat() if d.fecha else None,
            "cliente": cli.nombre if cli else "Sin cliente",
            "cliente_rfc": cli.rfc if cli else None,
            "total": float(d.total),
            "valor_entregado": float(d.valor_entregado or 0),
            "saldo_pendiente": round(saldo, 2),
            "pct_entregado": round(float(d.valor_entregado or 0) / float(d.total) * 100, 1) if d.total else 0,
            "completa": saldo < 0.01,
        })
    return resultado


# ============ DETALLE DE UNA FACTURA + SALIDAS PREVIAS ============

@router.get("/{doc_id}")
def obtener_detalle(
    doc_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    d = db.get(DocumentoVenta, doc_id)
    if not d or d.empresa_id != empresa_id:
        raise HTTPException(404, "Factura no existe")

    salidas = (
        db.query(SalidaMercancia)
        .filter(SalidaMercancia.documento_venta_id == doc_id)
        .order_by(SalidaMercancia.fecha.desc())
        .all()
    )
    salidas_resp = []
    for s in salidas:
        items = []
        for it in s.items:
            var = db.get(VarianteProducto, it.variante_id)
            prod = db.get(Producto, var.producto_id) if var else None
            items.append({
                "id": it.id,
                "variante_id": it.variante_id,
                "producto_nombre": prod.nombre if prod else (it.descripcion or "?"),
                "descripcion": it.descripcion,
                "cantidad": float(it.cantidad),
                "precio_unitario": float(it.precio_unitario),
                "importe": float(it.importe),
            })
        salidas_resp.append({
            "id": s.id, "fecha": s.fecha.isoformat(),
            "valor_total": float(s.valor_total),
            "notas": s.notas, "items": items,
        })

    cli = db.get(Cliente, d.cliente_id) if d.cliente_id else None
    return {
        "id": d.id, "folio": d.folio,
        "fecha": d.fecha.isoformat() if d.fecha else None,
        "cliente_id": d.cliente_id,
        "cliente_nombre": cli.nombre if cli else "Sin cliente",
        "total": float(d.total),
        "valor_entregado": float(d.valor_entregado or 0),
        "saldo_pendiente": round(float(d.total) - float(d.valor_entregado or 0), 2),
        "salidas": salidas_resp,
        "tiene_entregas_pendientes": d.tiene_entregas_pendientes,
    }


# ============ CREAR SALIDA ============

@router.post("/salida")
def crear_salida(
    payload: SalidaIn,
    empresa_id: int = Depends(get_active_empresa_id),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.get(DocumentoVenta, payload.documento_venta_id)
    if not doc or doc.empresa_id != empresa_id:
        raise HTTPException(404, "Factura no existe")
    if not doc.tiene_entregas_pendientes:
        raise HTTPException(400, "Esta factura no esta marcada con entregas pendientes")

    saldo = float(doc.total) - float(doc.valor_entregado or 0)
    if saldo <= 0:
        raise HTTPException(400, "Esta factura ya se entrego completa")

    if not payload.items:
        raise HTTPException(400, "La salida debe tener al menos 1 producto")

    valor_salida = sum(it.cantidad * it.precio_unitario for it in payload.items)
    valor_salida = round(valor_salida, 2)

    if valor_salida > saldo + 0.01:
        raise HTTPException(400,
            f"El valor de la salida ({valor_salida}) excede el saldo pendiente ({saldo})")

    # Crear salida
    salida = SalidaMercancia(
        documento_venta_id=doc.id,
        empresa_id=empresa_id,
        fecha=datetime.utcnow(),
        valor_total=valor_salida,
        notas=payload.notas,
        usuario_id=usuario.id,
    )
    db.add(salida)
    db.flush()

    # Items + descuentos de inventario
    for it in payload.items:
        var = db.get(VarianteProducto, it.variante_id)
        if not var:
            raise HTTPException(400, f"Variante {it.variante_id} no existe")
        prod = db.get(Producto, var.producto_id)
        if not prod or prod.empresa_id != empresa_id:
            raise HTTPException(400, f"Variante {it.variante_id} de otra empresa")

        importe = round(it.cantidad * it.precio_unitario, 2)
        item = SalidaMercanciaItem(
            salida_id=salida.id,
            variante_id=it.variante_id,
            descripcion=it.descripcion or prod.nombre,
            cantidad=it.cantidad,
            precio_unitario=it.precio_unitario,
            importe=importe,
            notas=it.notas,
        )
        db.add(item)

        # Descontar inventario
        var.stock_actual = float(var.stock_actual or 0) - it.cantidad
        db.add(MovimientoInventario(
            variante_id=var.id,
            tipo="SALIDA",
            cantidad=it.cantidad,
            referencia=f"Entrega parcial factura {doc.folio} (salida #{salida.id})",
            fecha=datetime.utcnow(),
        ))

    # Actualizar valor_entregado en la factura
    doc.valor_entregado = float(doc.valor_entregado or 0) + valor_salida
    db.commit()
    db.refresh(salida)

    return {
        "ok": True, "salida_id": salida.id,
        "valor_entregado_nuevo": float(doc.valor_entregado),
        "saldo_pendiente": round(float(doc.total) - float(doc.valor_entregado), 2),
    }


@router.delete("/salida/{salida_id}")
def cancelar_salida(
    salida_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Revierte una salida: devuelve inventario y resta del valor_entregado."""
    s = db.get(SalidaMercancia, salida_id)
    if not s or s.empresa_id != empresa_id:
        raise HTTPException(404, "Salida no existe")

    doc = db.get(DocumentoVenta, s.documento_venta_id)
    for it in s.items:
        var = db.get(VarianteProducto, it.variante_id)
        if var:
            var.stock_actual = float(var.stock_actual or 0) + float(it.cantidad)
            db.add(MovimientoInventario(
                variante_id=var.id,
                tipo="ENTRADA",
                cantidad=float(it.cantidad),
                referencia=f"Reverso salida #{s.id} de factura {doc.folio}",
                fecha=datetime.utcnow(),
            ))

    if doc:
        doc.valor_entregado = max(0, float(doc.valor_entregado or 0) - float(s.valor_total))

    db.delete(s)
    db.commit()
    return {"ok": True}


# ============ MARCAR UNA FACTURA COMO "CON ENTREGAS PENDIENTES" ============

class ToggleEntregasIn(BaseModel):
    tiene_entregas_pendientes: bool


@router.patch("/factura/{doc_id}/toggle")
def toggle_entregas(
    doc_id: int, payload: ToggleEntregasIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Marca o desmarca una factura como 'con entregas pendientes'."""
    doc = db.get(DocumentoVenta, doc_id)
    if not doc or doc.empresa_id != empresa_id:
        raise HTTPException(404, "Factura no existe")
    doc.tiene_entregas_pendientes = payload.tiene_entregas_pendientes
    db.commit()
    return {"ok": True, "tiene_entregas_pendientes": doc.tiene_entregas_pendientes}
