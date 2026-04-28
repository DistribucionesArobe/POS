# Aceromax POS

Sistema POS, facturacion CFDI 4.0 y asistente Claude para Aceromax (Distribuciones Arobe).

## Que es esto

Backend (FastAPI + Postgres) y frontend (React + Vite PWA) para reemplazar el sistema actual con un POS que cubre:

- Inventario con variantes (entera / mitad)
- Ventas: ticket, remision (credito sin facturar), factura CFDI 4.0
- Modelo B de facturacion: consolidar N remisiones en una factura global
- Cuentas por cobrar y por pagar
- Compras a proveedores y kardex con costo promedio
- CFDI 4.0 via Facturama (timbrado, cancelacion, notas de credito, complementos de pago)
- Integracion con CotizaExpress (clawdbot-server) compartiendo la misma DB
- Asistente Claude: cobranza automatica, conciliacion de pagos por foto/PDF, reportes en lenguaje natural
- Dos numeros de WhatsApp: ventas y cobranza

## Stack

- Backend: FastAPI 0.115, SQLAlchemy 2, Alembic, Postgres 16
- Frontend: React 18 + Vite + TypeScript + PWA
- IA: Anthropic Claude (sonnet)
- WhatsApp: Twilio
- CFDI: Facturama (PAC)
- Despliegue: Render.com (`render.yaml` listo)

## Estructura

```
aceromax-pos/
  backend/
    app/
      main.py              # Entrada FastAPI
      config.py            # Settings (env vars)
      db.py                # SQLAlchemy session
      models/              # ORM
      routers/             # Endpoints REST
      services/            # Logica de negocio
      schemas/             # Pydantic in/out
      integrations/        # Facturama, Twilio, Claude
      utils/               # Helpers (folios, etc.)
    alembic/               # Migraciones
    tests/                 # Pytest
    Dockerfile
    requirements.txt
    .env.example
  frontend/
    src/
      pages/               # Login, Dashboard, VentaNueva, Cartera
      api/                 # Cliente axios
    package.json
    vite.config.ts
  docs/
    architecture.md        # Decisiones de diseno
    roadmap.md             # Fases de entrega
    cfdi-notes.md          # Notas SAT y Facturama
  render.yaml              # Despliegue
  README.md                # (este archivo)
```

## Setup local

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                # editar con tus credenciales
# Levantar Postgres local (Docker)
docker run -d --name aceromax-db -e POSTGRES_USER=aceromax \
  -e POSTGRES_PASSWORD=aceromax -e POSTGRES_DB=aceromax \
  -p 5432:5432 postgres:16
# Crear migracion inicial
alembic revision --autogenerate -m "initial"
alembic upgrade head
# Correr
uvicorn app.main:app --reload --port 8000
```

Visita `http://localhost:8000/docs` para Swagger.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Abre `http://localhost:5173`.

## Subir a GitHub

```bash
cd aceromax-pos
git init
git add .
git commit -m "Initial: esqueleto Aceromax POS"
git branch -M main
git remote add origin git@github.com:DistribucionesArobe/aceromax-pos.git
git push -u origin main
```

## Despliegue en Render

1. Crear cuenta / proyecto en https://render.com
2. Conectar el repo de GitHub
3. Render detecta `render.yaml` y crea: backend (Docker), frontend (static), Postgres
4. Llenar variables marcadas `sync: false` en el dashboard de Render
5. La primera vez correra `alembic upgrade head` automaticamente

## Decisiones de diseno

Ver `docs/architecture.md`. Resumen:

- **DB compartida con CotizaExpress** (clawdbot-server). El POS es dueno del schema.
- **Variantes de SKU** para entera/mitad. Transformaciones registradas como movimientos.
- **Documentos polimorficos**: ticket, remision, factura, nota de credito en una sola tabla.
- **Modelo B de facturacion**: remisiones se consolidan en factura global cuando el cliente la pide.
- **Inventario unica fuente de verdad**: solo `services/inventario_service.py` muta `stock_actual`, todo pasa por kardex.
- **Sin limite de credito** por decision de Aceromax (campo informativo).
- **Dos numeros WhatsApp**: ventas (entrante, comprobantes) y cobranza (saliente, mensajes del lunes).

## Roadmap

Ver `docs/roadmap.md`. Resumen:

- Fase 1 (semanas 1-4): MVP operativo - vender con tickets y remisiones
- Fase 2 (5-8): Facturacion CFDI completa via Facturama
- Fase 3 (9-12): Compras y CxP
- Fase 4 (13-16): Asistente Claude (cobranza, conciliacion, reportes WA)

## Estado actual

Esqueleto inicial - estructura, modelos, routers stub. Ver TODOs en cada archivo.

Lo que SI funciona ahora mismo si lo levantas:
- `/health`
- `/api/auth/login` (necesitas crear usuario manual en DB)
- `GET /api/productos`, `/api/clientes`, `/api/ventas`, `/api/cxc/cartera`

Lo que falta para Fase 1:
- Migracion inicial generada
- Servicios completos: ajustes de inventario, transformacion entera->mitades
- PDFs de ticket y remision (reportlab)
- Auth roles (admin/dueno/cajero)
- Frontend: catalogo de productos, gestion de clientes, modulo de cobranza

## Licencia

Privado - Aceromax / Distribuciones Arobe.
