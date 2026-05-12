"""Productos y variantes - filtrado por empresa."""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Producto, VarianteProducto
from app.schemas.producto import ProductoIn, ProductoSimpleIn, VarianteIn, PrecioUpdate
from app.services import import_service
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.post("/sugerir-clave-sat")
def sugerir_clave_sat(
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
):
    """RAG: busca candidatos en catalogo SAT, Claude elige el mejor."""
    from app.integrations.anthropic_client import ClaudeClient
    from app.services import sat_catalog_service
    nombre = payload.get("nombre", "")
    categoria = payload.get("categoria")
    candidatos = sat_catalog_service.buscar_candidatos(nombre, categoria, limit=12)
    try:
        client = ClaudeClient()
        result = client.sugerir_clave_sat(
            nombre=nombre, categoria=categoria,
            marca=payload.get("marca"),
            candidatos=candidatos,
        )
        result["candidatos_evaluados"] = len(candidatos)
        return result
    except Exception as e:
        raise HTTPException(500, f"Error con IA: {e}")


@router.get("/sat-stats")
def sat_stats():
    """Reporta cuantas claves SAT estan disponibles para sugerencias."""
    from app.services import sat_catalog_service
    return sat_catalog_service.estadisticas()


@router.post("/asignar-claves-sat-bulk")
def asignar_claves_sat_bulk(
    aplicar: bool = Query(False, description="Si False solo regresa propuestas, si True las guarda"),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """RAG bulk: para cada producto sin clave, busca candidatos y Claude elige."""
    from app.integrations.anthropic_client import ClaudeClient
    from app.services import sat_catalog_service

    sin_clave = (
        db.query(Producto)
        .filter(Producto.empresa_id == empresa_id, Producto.activo == True)
        .filter(or_(Producto.clave_prod_serv_sat.is_(None), Producto.clave_prod_serv_sat == ""))
        .all()
    )
    if not sin_clave:
        return {"propuestas": [], "mensaje": "Todos los productos ya tienen clave SAT"}

    productos_input = []
    candidatos_por_id: dict[int, list[dict]] = {}
    for p in sin_clave:
        cands = sat_catalog_service.buscar_candidatos(p.nombre, p.categoria, limit=8)
        productos_input.append({"id": p.id, "nombre": p.nombre, "categoria": p.categoria})
        candidatos_por_id[p.id] = cands

    try:
        client = ClaudeClient()
        propuestas = []
        for i in range(0, len(productos_input), 20):
            lote = productos_input[i:i + 20]
            cands_lote = {p["id"]: candidatos_por_id[p["id"]] for p in lote}
            sugerencias = client.sugerir_claves_sat_lote(lote, cands_lote)
            for s in sugerencias:
                p = next((x for x in sin_clave if x.id == s.get("id")), None)
                if not p:
                    continue
                propuestas.append({
                    "producto_id": p.id,
                    "nombre": p.nombre,
                    "categoria": p.categoria,
                    "clave_sugerida": s.get("clave"),
                    "descripcion_sat": s.get("descripcion"),
                    "confianza": s.get("confianza"),
                    "candidatos_evaluados": len(candidatos_por_id[p.id]),
                })
    except Exception as e:
        raise HTTPException(500, f"Error con IA: {e}")

    if aplicar:
        for prop in propuestas:
            p = db.get(Producto, prop["producto_id"])
            if p and prop["clave_sugerida"]:
                p.clave_prod_serv_sat = prop["clave_sugerida"]
        db.commit()

    return {"propuestas": propuestas, "aplicado": aplicar}


@router.get("/import/plantilla")
def descargar_plantilla():
    """Devuelve XLSX con headers para importacion masiva."""
    xlsx = import_service.generar_plantilla()
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=plantilla_productos.xlsx"},
    )


@router.post("/import")
async def importar_excel(
    file: UploadFile = File(...),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Sube un archivo .xlsx")
    file_bytes = await file.read()
    try:
        return import_service.importar_productos(db, file_bytes, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("")
def listar_productos(
    q: str | None = Query(None),
    activo: bool = True,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    query = db.query(Producto).filter(Producto.empresa_id == empresa_id).options(joinedload(Producto.variantes))
    if activo:
        query = query.filter(Producto.activo == True)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Producto.nombre.ilike(like), Producto.categoria.ilike(like)))
    return [
        {
            "id": p.id, "nombre": p.nombre, "categoria": p.categoria, "marca": p.marca,
            "descripcion": p.descripcion, "clave_prod_serv_sat": p.clave_prod_serv_sat,
            "variantes": [
                {
                    "id": v.id, "sku": v.sku, "presentacion": v.presentacion,
                    "unidad": v.unidad, "clave_unidad_sat": v.clave_unidad_sat,
                    "precio_publico": float(v.precio_publico),
                    "precio_mayoreo": float(v.precio_mayoreo) if v.precio_mayoreo else None,
                    "cantidad_mayoreo": v.cantidad_mayoreo,
                    "costo_promedio": float(v.costo_promedio),
                    "stock_actual": float(v.stock_actual),
                    "stock_minimo": float(v.stock_minimo),
                    "activo": v.activo,
                }
                for v in p.variantes
            ],
        }
        for p in query.order_by(Producto.nombre).all()
    ]


@router.get("/buscar-variante")
def buscar_variante(
    q: str = Query(..., min_length=2),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    like = f"%{q}%"
    rows = (
        db.query(VarianteProducto)
        .join(Producto)
        .filter(Producto.empresa_id == empresa_id)
        .filter(VarianteProducto.activo == True)
        .filter(or_(VarianteProducto.sku.ilike(like), Producto.nombre.ilike(like)))
        .limit(20)
        .all()
    )
    return [
        {
            "id": v.id, "sku": v.sku,
            "nombre": f"{v.producto.nombre} - {v.presentacion}",
            "precio": float(v.precio_publico),
            "stock": float(v.stock_actual),
            "unidad": v.unidad,
        }
        for v in rows
    ]


@router.get("/sku/{sku}")
def obtener_por_sku(
    sku: str,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Lookup exacto por SKU - para scanner de barcode en caja."""
    v = (
        db.query(VarianteProducto)
        .join(Producto)
        .filter(Producto.empresa_id == empresa_id)
        .filter(VarianteProducto.sku == sku)
        .filter(VarianteProducto.activo == True)
        .first()
    )
    if not v:
        raise HTTPException(404, "SKU no encontrado")
    return {
        "id": v.id, "sku": v.sku,
        "nombre": f"{v.producto.nombre} - {v.presentacion}",
        "precio": float(v.precio_publico),
        "stock": float(v.stock_actual),
        "unidad": v.unidad,
    }


@router.post("/simple")
def crear_producto_simple(
    payload: ProductoSimpleIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    if db.query(VarianteProducto).filter(VarianteProducto.sku == payload.sku).first():
        raise HTTPException(400, f"SKU '{payload.sku}' ya existe")
    p = Producto(
        empresa_id=empresa_id,
        nombre=payload.nombre, categoria=payload.categoria, marca=payload.marca,
        clave_prod_serv_sat=payload.clave_prod_serv_sat,
    )
    db.add(p)
    db.flush()
    v = VarianteProducto(
        producto_id=p.id, sku=payload.sku, presentacion=payload.presentacion,
        unidad=payload.unidad, clave_unidad_sat=payload.clave_unidad_sat,
        precio_publico=payload.precio_publico, costo_promedio=payload.costo_promedio,
        stock_minimo=payload.stock_minimo,
    )
    db.add(v)
    db.commit()
    return {"producto_id": p.id, "variante_id": v.id, "sku": v.sku}


@router.post("")
def crear_producto(
    payload: ProductoIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    p = Producto(empresa_id=empresa_id, **payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "nombre": p.nombre}


@router.post("/variantes")
def crear_variante(
    payload: VarianteIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    producto = db.get(Producto, payload.producto_id)
    if not producto:
        raise HTTPException(404, "Producto no existe")
    if producto.empresa_id != empresa_id:
        raise HTTPException(403, "Producto pertenece a otra empresa")
    if db.query(VarianteProducto).filter(VarianteProducto.sku == payload.sku).first():
        raise HTTPException(400, f"SKU '{payload.sku}' ya existe")
    v = VarianteProducto(**payload.model_dump())
    db.add(v)
    db.commit()
    return {"id": v.id, "sku": v.sku}


@router.patch("/{producto_id}/clave-sat")
def actualizar_clave_sat(
    producto_id: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    p = db.get(Producto, producto_id)
    if not p or p.empresa_id != empresa_id:
        raise HTTPException(404, "Producto no existe")
    p.clave_prod_serv_sat = payload.get("clave")
    db.commit()
    return {"ok": True}


@router.patch("/variantes/{variante_id}/precio")
def actualizar_precio(
    variante_id: int, payload: PrecioUpdate,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    producto = db.get(Producto, v.producto_id)
    if producto.empresa_id != empresa_id:
        raise HTTPException(403, "Variante de otra empresa")
    v.precio_publico = payload.precio_publico
    v.precio_mayoreo = payload.precio_mayoreo
    db.commit()
    return {"ok": True, "precio_publico": float(v.precio_publico)}


@router.patch("/{producto_id}")
def actualizar_producto(
    producto_id: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Edita campos del producto: nombre, categoria, marca, clave_prod_serv_sat."""
    p = db.get(Producto, producto_id)
    if not p or p.empresa_id != empresa_id:
        raise HTTPException(404, "Producto no existe")
    campos_editables = {"nombre", "categoria", "marca", "clave_prod_serv_sat"}
    for k, val in payload.items():
        if k in campos_editables:
            setattr(p, k, val if val != "" else None)
    if not p.nombre:
        raise HTTPException(400, "El nombre es obligatorio")
    db.commit()
    return {"ok": True, "id": p.id}


@router.patch("/variantes/{variante_id}")
def actualizar_variante(
    variante_id: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Edita variante: sku, presentacion, unidad, clave_unidad_sat,
    precio_publico, precio_mayoreo, costo_promedio, stock_minimo, activo."""
    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    producto = db.get(Producto, v.producto_id)
    if producto.empresa_id != empresa_id:
        raise HTTPException(403, "Variante de otra empresa")

    campos_str = {"sku", "presentacion", "unidad", "clave_unidad_sat"}
    campos_num = {"precio_publico", "precio_mayoreo", "costo_promedio", "stock_minimo"}
    campos_bool = {"activo"}

    for k, val in payload.items():
        if k in campos_str:
            if val == "" and k != "sku":
                val = None
            setattr(v, k, val)
        elif k in campos_num:
            if val is None or val == "":
                continue
            setattr(v, k, float(val))
        elif k in campos_bool:
            setattr(v, k, bool(val))

    if not v.sku:
        raise HTTPException(400, "El SKU es obligatorio")

    # Si cambio el SKU, verificar que no exista otra variante con ese SKU en la empresa
    if "sku" in payload:
        dup = (
            db.query(VarianteProducto)
            .join(Producto, Producto.id == VarianteProducto.producto_id)
            .filter(Producto.empresa_id == empresa_id)
            .filter(VarianteProducto.sku == v.sku)
            .filter(VarianteProducto.id != v.id)
            .first()
        )
        if dup:
            raise HTTPException(400, f"Ya existe otra variante con SKU '{v.sku}'")

    db.commit()
    return {"ok": True, "id": v.id}


@router.delete("/variantes/{variante_id}")
def desactivar_variante(
    variante_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    producto = db.get(Producto, v.producto_id)
    if producto.empresa_id != empresa_id:
        raise HTTPException(403, "Variante de otra empresa")
    v.activo = False
    db.commit()
    return {"ok": True}


@router.delete("/variantes/{variante_id}/permanente")
def borrar_variante_permanente(
    variante_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Borra la variante del DB. Solo permitido si NO tiene historial."""
    from app.models import ConceptoVenta, ConceptoCompra, MovimientoInventario

    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    producto = db.get(Producto, v.producto_id)
    if producto.empresa_id != empresa_id:
        raise HTTPException(403, "Variante de otra empresa")

    ventas = db.query(ConceptoVenta).filter(ConceptoVenta.variante_id == variante_id).count()
    compras = db.query(ConceptoCompra).filter(ConceptoCompra.variante_id == variante_id).count()
    movs = db.query(MovimientoInventario).filter(MovimientoInventario.variante_id == variante_id).count()
    if ventas + compras + movs > 0:
        raise HTTPException(
            400,
            f"No se puede borrar: tiene historial ({ventas} venta(s), {compras} compra(s), "
            f"{movs} movimiento(s) de inventario). Solo se puede desactivar.",
        )

    # Si esta apuntada como derivada por otra variante, romper esa relacion
    derivadas = db.query(VarianteProducto).filter(VarianteProducto.derivada_id == variante_id).all()
    for d in derivadas:
        d.derivada_id = None

    producto_id = v.producto_id
    db.delete(v)
    db.flush()

    # Si el producto no tiene mas variantes, borrarlo tambien
    remaining = db.query(VarianteProducto).filter(VarianteProducto.producto_id == producto_id).count()
    if remaining == 0:
        prod = db.get(Producto, producto_id)
        if prod:
            db.delete(prod)
    db.commit()
    return {"ok": True, "producto_borrado_tambien": remaining == 0}


@router.delete("/{producto_id}/permanente")
def borrar_producto_permanente(
    producto_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Borra producto y todas sus variantes. Solo si ninguna tiene historial."""
    from app.models import ConceptoVenta, ConceptoCompra, MovimientoInventario

    p = db.get(Producto, producto_id)
    if not p or p.empresa_id != empresa_id:
        raise HTTPException(404, "Producto no existe")

    variantes = db.query(VarianteProducto).filter(VarianteProducto.producto_id == producto_id).all()
    for v in variantes:
        ventas = db.query(ConceptoVenta).filter(ConceptoVenta.variante_id == v.id).count()
        compras = db.query(ConceptoCompra).filter(ConceptoCompra.variante_id == v.id).count()
        movs = db.query(MovimientoInventario).filter(MovimientoInventario.variante_id == v.id).count()
        if ventas + compras + movs > 0:
            raise HTTPException(
                400,
                f"No se puede borrar: la variante {v.sku} tiene historial. Desactiva el producto en su lugar.",
            )

    for v in variantes:
        db.delete(v)
    db.delete(p)
    db.commit()
    return {"ok": True}
