"""Productos y variantes - filtrado por empresa."""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Producto, VarianteProducto
from app.schemas.producto import ProductoIn, ProductoSimpleIn, VarianteIn, PrecioUpdate
from app.services import import_service, cotizacion_parser
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


@router.post("/matchear-lineas-cotizacion")
def matchear_lineas_cotizacion(
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Recibe lista de lineas ya parseadas {descripcion, cantidad, precio, monto}
    y las matchea contra el catalogo. Sin parser de archivo - usado por copy/paste."""
    lineas_in = payload.get("lineas") or []
    if not isinstance(lineas_in, list) or not lineas_in:
        raise HTTPException(400, "Falta lista 'lineas'")
    lineas = []
    for raw in lineas_in:
        desc = (raw.get("descripcion") or "").strip()
        if not desc:
            continue
        try:
            cantidad = float(raw.get("cantidad") or 0)
        except (TypeError, ValueError):
            cantidad = 0
        if cantidad <= 0:
            continue
        try:
            precio = float(raw.get("precio") or 0)
        except (TypeError, ValueError):
            precio = 0
        try:
            monto = float(raw.get("monto") or 0)
        except (TypeError, ValueError):
            monto = 0
        lineas.append({
            "descripcion": desc,
            "unidad": (raw.get("unidad") or "").strip(),
            "cantidad": cantidad,
            "precio": precio,
            "monto": monto or cantidad * precio,
        })
    if not lineas:
        return {"lineas": [], "total_lineas": 0, "total_monto": 0.0}
    enriquecidas = cotizacion_parser.matchear_lineas(db, empresa_id, lineas)
    total_monto = sum((l.get("monto") or 0) for l in enriquecidas)
    return {
        "lineas": enriquecidas,
        "total_lineas": len(enriquecidas),
        "matched": sum(1 for l in enriquecidas if l.get("match_variante_id")),
        "no_matched": sum(1 for l in enriquecidas if not l.get("match_variante_id")),
        "total_monto": round(total_monto, 2),
    }


@router.post("/parsear-cotizacion")
async def parsear_cotizacion(
    file: UploadFile = File(...),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Recibe XLSX o imagen/PDF, extrae lineas y las matchea contra el catalogo."""
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(400, "Archivo vacio")

    try:
        if filename.endswith((".xlsx", ".xlsm")):
            lineas = cotizacion_parser.parsear_xlsx(file_bytes)
        elif filename.endswith((".png", ".jpg", ".jpeg", ".webp")) or content_type.startswith("image/"):
            mime = content_type if content_type.startswith("image/") else (
                "image/png" if filename.endswith(".png") else
                "image/webp" if filename.endswith(".webp") else "image/jpeg"
            )
            lineas = cotizacion_parser.parsear_imagen(file_bytes, mime)
        elif filename.endswith(".pdf") or content_type == "application/pdf":
            # Claude soporta PDFs nativamente, no requiere conversion local
            lineas = cotizacion_parser.parsear_imagen(file_bytes, "application/pdf")
        else:
            raise HTTPException(400, f"Tipo de archivo no soportado: {filename}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"No pude leer el archivo: {e}")

    if not lineas:
        return {"lineas": [], "total_lineas": 0, "total_monto": 0.0}

    enriquecidas = cotizacion_parser.matchear_lineas(db, empresa_id, lineas)
    total_monto = sum((l.get("monto") or 0) for l in enriquecidas)
    return {
        "lineas": enriquecidas,
        "total_lineas": len(enriquecidas),
        "matched": sum(1 for l in enriquecidas if l.get("match_variante_id")),
        "no_matched": sum(1 for l in enriquecidas if not l.get("match_variante_id")),
        "total_monto": round(total_monto, 2),
    }


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
                    "favorito_caja": v.favorito_caja,
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
    """Busqueda con ranking por prefijo.

    Prioridad:
      0. SKU empieza con q
      1. Nombre del producto empieza con q (caso 'tab' -> 'Tablaroca')
      2. Una palabra del nombre empieza con q (caso 'tab' -> 'Lamina Tablaroca')
      3. Match en cualquier parte (caso 'tab' -> 'Pija para tablaroca')
    """
    like_any = f"%{q}%"
    like_prefix = f"{q}%"
    like_word_prefix = f"% {q}%"

    rows = (
        db.query(VarianteProducto)
        .join(Producto)
        .filter(Producto.empresa_id == empresa_id)
        .filter(VarianteProducto.activo == True)
        .filter(or_(VarianteProducto.sku.ilike(like_any), Producto.nombre.ilike(like_any)))
        .limit(80)
        .all()
    )

    def rank(v) -> int:
        nombre = (v.producto.nombre or "").lower()
        sku = (v.sku or "").lower()
        ql = q.lower()
        if sku.startswith(ql):
            return 0
        if nombre.startswith(ql):
            return 1
        if any(w.startswith(ql) for w in nombre.split()):
            return 2
        return 3

    rows.sort(key=lambda v: (rank(v), v.producto.nombre.lower(), v.presentacion.lower()))
    rows = rows[:20]

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
    import logging
    logger = logging.getLogger(__name__)
    try:
        sku_limpio = (payload.sku or "").strip()
        if not sku_limpio:
            raise HTTPException(400, "SKU vacio")
        # Trunca a 64 chars que es lo que aguanta la columna
        sku_limpio = sku_limpio[:64]
        if db.query(VarianteProducto).filter(VarianteProducto.sku == sku_limpio).first():
            raise HTTPException(400, f"SKU '{sku_limpio}' ya existe")
        # Limpia y trunca clave SAT a 8 chars
        clave_sat = (payload.clave_prod_serv_sat or "").strip()[:8] or None
        clave_unidad = (payload.clave_unidad_sat or "H87").strip()[:3]
        p = Producto(
            empresa_id=empresa_id,
            nombre=(payload.nombre or "").strip()[:255],
            categoria=(payload.categoria or None),
            marca=(payload.marca or None),
            clave_prod_serv_sat=clave_sat,
        )
        db.add(p)
        db.flush()
        v = VarianteProducto(
            producto_id=p.id, sku=sku_limpio,
            presentacion=(payload.presentacion or "Default")[:64],
            unidad=(payload.unidad or "PZA")[:32],
            clave_unidad_sat=clave_unidad,
            precio_publico=float(payload.precio_publico or 0),
            costo_promedio=float(payload.costo_promedio or 0),
            stock_minimo=float(payload.stock_minimo or 0),
        )
        db.add(v)
        db.commit()
        return {"producto_id": p.id, "variante_id": v.id, "sku": v.sku}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("ERROR CREAR PRODUCTO SIMPLE. Payload: %s | Error: %s",
                     payload.model_dump() if hasattr(payload, "model_dump") else str(payload), e)
        raise HTTPException(500, f"No se pudo crear producto: {type(e).__name__}: {e}")


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


@router.get("/favoritos-caja")
def listar_favoritos_caja(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Lista las variantes marcadas como favoritas para mostrar en Caja."""
    rows = (
        db.query(VarianteProducto, Producto)
        .join(Producto, Producto.id == VarianteProducto.producto_id)
        .filter(Producto.empresa_id == empresa_id)
        .filter(VarianteProducto.favorito_caja == True)
        .filter(VarianteProducto.activo == True)
        .order_by(Producto.nombre)
        .all()
    )
    return [
        {
            "id": v.id, "sku": v.sku,
            "nombre": f"{p.nombre} - {v.presentacion}",
            "precio": float(v.precio_publico),
            "stock": float(v.stock_actual),
        }
        for v, p in rows
    ]


@router.patch("/variantes/{variante_id}/favorito")
def toggle_favorito(
    variante_id: int,
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Marca o desmarca una variante como favorita en Caja."""
    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    producto = db.get(Producto, v.producto_id)
    if producto.empresa_id != empresa_id:
        raise HTTPException(403, "Variante de otra empresa")
    v.favorito_caja = bool(payload.get("favorito", False))
    db.commit()
    return {"ok": True, "favorito": v.favorito_caja}


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


class CostoUpdate(BaseModel):
    costo_promedio: float = Field(ge=0)


class AjusteMasivoIn(BaseModel):
    """Ajuste masivo de precio/costo por % a una lista de variantes."""
    variante_ids: list[int]
    # Aplicar a precio_publico y/o costo_promedio
    aplicar_precio: bool = False
    aplicar_costo: bool = False
    # Porcentaje: positivo = aumento, negativo = descuento. Ej. 10 = +10%, -5 = -5%
    porcentaje: float = 0
    # Redondear a peso entero (0 centavos)
    redondear_a_entero: bool = False


@router.post("/variantes/ajuste-masivo")
def ajuste_masivo_variantes(
    payload: AjusteMasivoIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Aplica un % de aumento/descuento a precio y/o costo de varias variantes.
    Opcionalmente redondea a peso entero (centavos = 0)."""
    if not payload.variante_ids:
        raise HTTPException(400, "Selecciona al menos una variante")
    if not payload.aplicar_precio and not payload.aplicar_costo:
        raise HTTPException(400, "Marca aplicar_precio y/o aplicar_costo")
    factor = 1 + (float(payload.porcentaje) / 100.0)
    if factor <= 0:
        raise HTTPException(400, "El porcentaje resulta en un valor negativo o cero")
    variantes = (
        db.query(VarianteProducto)
        .filter(VarianteProducto.id.in_(payload.variante_ids))
        .all()
    )
    aplicados = 0
    for v in variantes:
        producto = db.get(Producto, v.producto_id)
        if not producto or producto.empresa_id != empresa_id:
            continue  # ignora silenciosamente las de otras empresas
        if payload.aplicar_precio:
            nuevo = float(v.precio_publico or 0) * factor
            if payload.redondear_a_entero:
                nuevo = round(nuevo)
            else:
                nuevo = round(nuevo, 2)
            v.precio_publico = nuevo
        if payload.aplicar_costo:
            nuevo = float(v.costo_promedio or 0) * factor
            if payload.redondear_a_entero:
                nuevo = round(nuevo)
            else:
                nuevo = round(nuevo, 2)
            v.costo_promedio = nuevo
        aplicados += 1
    db.commit()
    return {
        "ok": True,
        "variantes_actualizadas": aplicados,
        "porcentaje": payload.porcentaje,
        "aplicado_a": (
            ("precio " if payload.aplicar_precio else "")
            + ("costo" if payload.aplicar_costo else "")
        ).strip(),
        "redondeado": payload.redondear_a_entero,
    }


@router.patch("/variantes/{variante_id}/costo")
def actualizar_costo(
    variante_id: int, payload: CostoUpdate,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Permite editar manualmente el costo promedio de una variante.
    El costo se sobreescribe (no se promedia con compras anteriores)."""
    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    producto = db.get(Producto, v.producto_id)
    if producto.empresa_id != empresa_id:
        raise HTTPException(403, "Variante de otra empresa")
    v.costo_promedio = payload.costo_promedio
    db.commit()
    return {"ok": True, "costo_promedio": float(v.costo_promedio)}


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
