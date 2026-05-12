"""Reportes - filtrados por empresa."""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    DocumentoVenta, ConceptoVenta, CuentaPorCobrar, VarianteProducto, Cliente, Producto,
)
from app.models.venta import EstatusDocumento, TipoDocumento
from app.services.security import get_active_empresa_id

router = APIRouter()


def _rango(periodo: str) -> tuple[datetime, datetime]:
    """Devuelve (inicio, fin) UTC para el periodo dado."""
    today = datetime.utcnow().date()
    if periodo == "hoy":
        inicio = datetime.combine(today, datetime.min.time())
        return inicio, inicio + timedelta(days=1)
    if periodo == "semana":
        lunes = today - timedelta(days=today.weekday())
        inicio = datetime.combine(lunes, datetime.min.time())
        return inicio, inicio + timedelta(days=7)
    if periodo == "mes":
        primero = today.replace(day=1)
        inicio = datetime.combine(primero, datetime.min.time())
        # primer dia del mes siguiente
        if primero.month == 12:
            sig = primero.replace(year=primero.year + 1, month=1)
        else:
            sig = primero.replace(month=primero.month + 1)
        return inicio, datetime.combine(sig, datetime.min.time())
    # default: hoy
    inicio = datetime.combine(today, datetime.min.time())
    return inicio, inicio + timedelta(days=1)


@router.get("/dashboard")
def dashboard(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """KPIs + ventas por periodo + top productos + comparativa vs periodo anterior."""

    def _resumen(ini: datetime, fin: datetime) -> dict:
        q = db.query(
            func.coalesce(func.sum(DocumentoVenta.total), 0).label("total"),
            func.count().label("n"),
            func.coalesce(func.avg(DocumentoVenta.total), 0).label("avg"),
        ).filter(
            DocumentoVenta.empresa_id == empresa_id,
            DocumentoVenta.fecha >= ini,
            DocumentoVenta.fecha < fin,
            DocumentoVenta.tipo.in_([
                TipoDocumento.TICKET.value, TipoDocumento.FACTURA.value,
                TipoDocumento.REMISION.value,
            ]),
            DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value,
        ).one()
        return {"total": float(q.total or 0), "n": q.n, "ticket_promedio": float(q.avg or 0)}

    periodos: dict[str, dict] = {}
    for p in ("hoy", "semana", "mes"):
        ini, fin = _rango(p)
        actual = _resumen(ini, fin)
        # Periodo anterior del mismo largo
        delta = fin - ini
        prev = _resumen(ini - delta, ini)
        if prev["total"] > 0:
            cambio_pct = (actual["total"] - prev["total"]) / prev["total"] * 100
        else:
            cambio_pct = None
        periodos[p] = {**actual, "vs_anterior": prev, "cambio_pct": cambio_pct}

    # Top productos del mes por monto
    ini_mes, fin_mes = _rango("mes")
    top = (
        db.query(
            ConceptoVenta.descripcion,
            func.sum(ConceptoVenta.cantidad).label("cant"),
            func.sum(ConceptoVenta.importe).label("monto"),
        )
        .join(DocumentoVenta, DocumentoVenta.id == ConceptoVenta.documento_id)
        .filter(
            DocumentoVenta.empresa_id == empresa_id,
            DocumentoVenta.fecha >= ini_mes,
            DocumentoVenta.fecha < fin_mes,
            DocumentoVenta.tipo.in_([
                TipoDocumento.TICKET.value, TipoDocumento.FACTURA.value,
                TipoDocumento.REMISION.value,
            ]),
            DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value,
        )
        .group_by(ConceptoVenta.descripcion)
        .order_by(func.sum(ConceptoVenta.importe).desc())
        .limit(10)
        .all()
    )

    # Clientes nuevos del mes
    nuevos = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id,
        Cliente.creado_en >= ini_mes,
        Cliente.creado_en < fin_mes,
    ).count()

    # Cartera total pendiente
    cartera = (
        db.query(func.coalesce(func.sum(CuentaPorCobrar.saldo), 0))
        .join(DocumentoVenta, DocumentoVenta.id == CuentaPorCobrar.documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(CuentaPorCobrar.pagado == False)
        .scalar()
    )

    return {
        "periodos": periodos,
        "top_productos": [
            {"descripcion": d, "cantidad": float(c or 0), "monto": float(m or 0)}
            for d, c, m in top
        ],
        "clientes_nuevos_mes": nuevos,
        "cartera_total": float(cartera or 0),
    }



@router.get("/kpis")
def kpis(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    today = datetime.utcnow().date()
    inicio = datetime.combine(today, datetime.min.time())
    fin = inicio + timedelta(days=1)

    productos_stock = (
        db.query(VarianteProducto)
        .join(Producto)
        .filter(Producto.empresa_id == empresa_id)
        .filter(VarianteProducto.activo == True, VarianteProducto.stock_actual > 0)
        .count()
    )

    ventas_hoy = db.query(
        func.coalesce(func.sum(DocumentoVenta.total), 0)
    ).filter(
        DocumentoVenta.empresa_id == empresa_id,
        DocumentoVenta.fecha >= inicio,
        DocumentoVenta.fecha < fin,
        DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value,
    ).scalar()

    docs_hoy = db.query(DocumentoVenta).filter(
        DocumentoVenta.empresa_id == empresa_id,
        DocumentoVenta.fecha >= inicio,
        DocumentoVenta.fecha < fin,
        DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value,
    ).count()

    cartera = (
        db.query(func.coalesce(func.sum(CuentaPorCobrar.saldo), 0))
        .join(DocumentoVenta, DocumentoVenta.id == CuentaPorCobrar.documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(CuentaPorCobrar.pagado == False)
        .scalar()
    )

    docs_pendientes = (
        db.query(CuentaPorCobrar)
        .join(DocumentoVenta, DocumentoVenta.id == CuentaPorCobrar.documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(CuentaPorCobrar.pagado == False)
        .count()
    )

    clientes_activos = db.query(Cliente).filter(
        Cliente.empresa_id == empresa_id, Cliente.activo == True
    ).count()

    return {
        "productos_stock": productos_stock,
        "ventas_hoy": float(ventas_hoy or 0),
        "documentos_hoy": docs_hoy,
        "cartera_total": float(cartera or 0),
        "documentos_pendientes": docs_pendientes,
        "clientes_activos": clientes_activos,
    }


@router.get("/corte-caja")
def corte_caja(
    fecha: date | None = None,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    f = fecha or datetime.utcnow().date()
    inicio = datetime.combine(f, datetime.min.time())
    fin = inicio + timedelta(days=1)
    rows = (
        db.query(
            DocumentoVenta.tipo,
            func.count().label("n"),
            func.sum(DocumentoVenta.total).label("total"),
        )
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.fecha >= inicio, DocumentoVenta.fecha < fin)
        .filter(DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value)
        .group_by(DocumentoVenta.tipo)
        .all()
    )
    return {
        "fecha": f.isoformat(),
        "por_tipo": [
            {"tipo": t, "n": n, "total": float(total or 0)}
            for t, n, total in rows
        ],
    }


@router.get("/antiguedad-cartera")
def antiguedad_cartera(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    today = datetime.utcnow().date()
    buckets = {"0-15": 0.0, "16-30": 0.0, "31-60": 0.0, "61-90": 0.0, "91+": 0.0}
    rows = (
        db.query(CuentaPorCobrar)
        .join(DocumentoVenta, DocumentoVenta.id == CuentaPorCobrar.documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(CuentaPorCobrar.pagado == False)
        .all()
    )
    for cxc in rows:
        d = (today - cxc.fecha_emision.date()).days
        saldo = float(cxc.saldo)
        if d <= 15: buckets["0-15"] += saldo
        elif d <= 30: buckets["16-30"] += saldo
        elif d <= 60: buckets["31-60"] += saldo
        elif d <= 90: buckets["61-90"] += saldo
        else: buckets["91+"] += saldo
    return buckets
