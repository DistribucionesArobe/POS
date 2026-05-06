"""Seed inicial - admin + clientes + productos con stock."""
from passlib.context import CryptContext
from app.db import SessionLocal
from app.models import Usuario, Cliente, Producto, VarianteProducto
from app.services import inventario_service

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
db = SessionLocal()

print("Iniciando seed...")

admin = Usuario(
    email="admin@aceromax.mx",
    nombre="Admin Aceromax",
    password_hash=pwd_context.hash("admin123"),
    rol="admin",
)
db.add(admin)
print("Admin creado")

publico = Cliente(
    nombre="Publico en general",
    rfc="XAXX010101000",
    razon_social="PUBLICO EN GENERAL",
    regimen_fiscal="616",
    codigo_postal="00000",
)
constructor = Cliente(
    nombre="Construcciones Perez SA",
    rfc="CPE850101AB1",
    razon_social="CONSTRUCCIONES PEREZ SA DE CV",
    regimen_fiscal="601",
    codigo_postal="06000",
    whatsapp="+5215555551234",
    dias_credito=30,
)
db.add_all([publico, constructor])
print("Clientes creados")

varilla = Producto(
    nombre="Varilla corrugada 3/8",
    categoria="Aceros",
    clave_prod_serv_sat="30102404",
)
cemento = Producto(
    nombre="Cemento gris CPC 30R",
    categoria="Cementos",
    clave_prod_serv_sat="30111601",
)
db.add_all([varilla, cemento])
db.flush()
print(f"Productos creados: varilla.id={varilla.id}, cemento.id={cemento.id}")

v_entera = VarianteProducto(
    producto_id=varilla.id, sku="VAR-3-8-12M", presentacion="Entera 12m",
    unidad="PZA", clave_unidad_sat="H87",
    precio_publico=180, costo_promedio=140, factor_division=2,
)
v_mitad = VarianteProducto(
    producto_id=varilla.id, sku="VAR-3-8-6M", presentacion="Mitad 6m",
    unidad="PZA", clave_unidad_sat="H87",
    precio_publico=95, costo_promedio=70,
)
v_cemento = VarianteProducto(
    producto_id=cemento.id, sku="CEM-CPC30R-50", presentacion="Bulto 50kg",
    unidad="BULTO", clave_unidad_sat="XBG",
    precio_publico=290, costo_promedio=240,
)
db.add_all([v_entera, v_mitad, v_cemento])
db.flush()
v_entera.derivada_id = v_mitad.id
db.commit()
print("Variantes creadas y commit hecho")

for variante_id, cantidad, costo in [
    (v_entera.id, 50, 140),
    (v_mitad.id, 80, 70),
    (v_cemento.id, 200, 240),
]:
    inventario_service.aplicar_movimiento(
        db, variante_id, "ENTRADA_COMPRA", cantidad,
        costo_unitario=costo, notas="Carga inicial",
    )
db.commit()
print("Inventario inicial cargado")

print("=== SEED OK ===")
print("Usuario: admin@aceromax.mx / admin123")
print(f"Clientes: {db.query(Cliente).count()}")
print(f"Productos: {db.query(Producto).count()}")
print(f"Variantes: {db.query(VarianteProducto).count()}")
