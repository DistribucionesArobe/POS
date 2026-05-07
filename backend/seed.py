"""Seed inicial multi-empresa.

Crea:
  - Empresa 1: Arobe (Distribuciones Arobe SA - PM RESICO)
  - Empresa 2: Aceromax (Edgar Alejandro Robledo Beltran - PF 612)
  - Usuario admin super_admin con acceso a ambas
  - Productos demo + clientes demo en cada empresa

Si ya existe la DB con data previa monolitica, este script asume que esa data
ya fue migrada a la empresa #1. Detecta si hay empresas existentes y no las recrea.
"""
from passlib.context import CryptContext
from app.db import SessionLocal
from app.models import Empresa, Usuario, Cliente, Producto, VarianteProducto
from app.services import inventario_service

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
db = SessionLocal()

print("Iniciando seed multi-empresa...")

# --- Empresas ---
empresa_arobe = db.query(Empresa).filter(Empresa.rfc == "DAR220709MC3").first()
if not empresa_arobe:
    empresa_arobe = Empresa(
        nombre="Arobe",
        rfc="DAR220709MC3",
        razon_social="DISTRIBUCIONES AROBE",
        regimen_fiscal="626",
        codigo_postal="87020",
        facturama_api_url="https://apisandbox.facturama.com.mx",
    )
    db.add(empresa_arobe)
    db.flush()
    print(f"Empresa Arobe creada (id={empresa_arobe.id})")
else:
    print(f"Empresa Arobe ya existe (id={empresa_arobe.id})")

empresa_aceromax = db.query(Empresa).filter(Empresa.rfc == "ROBE920216AT2").first()
if not empresa_aceromax:
    empresa_aceromax = Empresa(
        nombre="Aceromax",
        rfc="ROBE920216AT2",
        razon_social="EDGAR ALEJANDRO ROBLEDO BELTRAN",
        regimen_fiscal="612",
        codigo_postal="87020",
        facturama_api_url="https://apisandbox.facturama.com.mx",
    )
    db.add(empresa_aceromax)
    db.flush()
    print(f"Empresa Aceromax creada (id={empresa_aceromax.id})")
else:
    print(f"Empresa Aceromax ya existe (id={empresa_aceromax.id})")

db.commit()

# --- Admin super_admin ---
admin = db.query(Usuario).filter(Usuario.email == "admin@aceromax.mx").first()
if not admin:
    admin = Usuario(
        email="admin@aceromax.mx",
        nombre="Admin Aceromax",
        password_hash=pwd_context.hash("admin123"),
        rol="admin",
        empresa_id=empresa_aceromax.id,
        super_admin=True,
    )
    db.add(admin)
    db.commit()
    print("Admin creado: admin@aceromax.mx / admin123 (super_admin)")
else:
    if not admin.super_admin:
        admin.super_admin = True
        admin.empresa_id = empresa_aceromax.id
        db.commit()
        print("Admin existente actualizado a super_admin")
    else:
        print("Admin ya existe")

# --- Datos demo en Aceromax si esta vacia ---
if db.query(Producto).filter(Producto.empresa_id == empresa_aceromax.id).count() == 0:
    print("Cargando demo en Aceromax...")
    publico = Cliente(
        empresa_id=empresa_aceromax.id,
        nombre="Publico en general",
        rfc="XAXX010101000",
        razon_social="PUBLICO EN GENERAL",
        regimen_fiscal="616",
        codigo_postal="87020",
    )
    db.add(publico)

    varilla = Producto(
        empresa_id=empresa_aceromax.id,
        nombre="Varilla corrugada 3/8",
        categoria="Aceros",
        clave_prod_serv_sat="30102404",
    )
    cemento = Producto(
        empresa_id=empresa_aceromax.id,
        nombre="Cemento gris CPC 30R",
        categoria="Cementos",
        clave_prod_serv_sat="30111601",
    )
    db.add_all([varilla, cemento])
    db.flush()

    v_entera = VarianteProducto(
        producto_id=varilla.id, sku="ACX-VAR-3-8-12M", presentacion="Entera 12m",
        unidad="PZA", clave_unidad_sat="H87",
        precio_publico=180, costo_promedio=140, factor_division=2,
    )
    v_mitad = VarianteProducto(
        producto_id=varilla.id, sku="ACX-VAR-3-8-6M", presentacion="Mitad 6m",
        unidad="PZA", clave_unidad_sat="H87",
        precio_publico=95, costo_promedio=70,
    )
    v_cemento = VarianteProducto(
        producto_id=cemento.id, sku="ACX-CEM-CPC30R-50", presentacion="Bulto 50kg",
        unidad="BULTO", clave_unidad_sat="XBG",
        precio_publico=290, costo_promedio=240,
    )
    db.add_all([v_entera, v_mitad, v_cemento])
    db.flush()
    v_entera.derivada_id = v_mitad.id
    db.commit()

    for variante_id, cantidad, costo in [
        (v_entera.id, 50, 140),
        (v_mitad.id, 80, 70),
        (v_cemento.id, 200, 240),
    ]:
        inventario_service.aplicar_movimiento(
            db, variante_id, "ENTRADA_COMPRA", cantidad,
            empresa_id=empresa_aceromax.id,
            costo_unitario=costo, notas="Carga inicial",
        )
    db.commit()
    print("Demo Aceromax cargado: 3 productos con stock")

# --- Demo en Arobe si esta vacia ---
if db.query(Producto).filter(Producto.empresa_id == empresa_arobe.id).count() == 0:
    print("Cargando demo en Arobe...")
    cliente_gob = Cliente(
        empresa_id=empresa_arobe.id,
        nombre="Gobierno del Estado",
        rfc="GES850101AB1",
        razon_social="GOBIERNO DEL ESTADO DE TAMAULIPAS",
        regimen_fiscal="603",
        codigo_postal="87000",
        dias_credito=60,
    )
    db.add(cliente_gob)
    db.commit()
    print("Demo Arobe cargado: cliente Gobierno (sin productos por ahora)")

print("=== SEED OK ===")
print(f"Empresas: {db.query(Empresa).count()}")
print(f"Productos Aceromax: {db.query(Producto).filter(Producto.empresa_id == empresa_aceromax.id).count()}")
print(f"Productos Arobe: {db.query(Producto).filter(Producto.empresa_id == empresa_arobe.id).count()}")
print("Login: admin@aceromax.mx / admin123 (super_admin con acceso a ambas)")
