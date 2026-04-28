# Arquitectura - Aceromax POS

## Vision general

```
                                    +-------------------+
   Cajero (PWA web) <-----HTTPS---> |                   |
                                    |   FastAPI POS     | <-----> Postgres 16
   CotizaExpress    <--lee/escribe->|   (Render Docker) |
   (clawdbot-server)                |                   |
                                    +---------+---------+
                                              |
            +------------------+--------------+----------+-----------------+
            |                  |                         |                 |
       +----v----+      +------v------+           +------v------+    +----v----+
       | Twilio  |      |  Anthropic  |           |  Facturama  |    | Storage |
       | WhatsApp|      |   Claude    |           |    (PAC)    |    | XML/PDF |
       | (2 nums)|      |             |           |             |    |         |
       +---------+      +-------------+           +-------------+    +---------+
```

## Decisiones clave

### 1. Una sola DB para POS y CotizaExpress

Para no duplicar productos/precios/clientes, ambos servicios apuntan a la misma DB Postgres.

- POS es **dueno del schema**. Las migraciones (alembic) viven aqui.
- CotizaExpress tiene **rol de Postgres con permisos limitados**: lectura sobre productos/clientes/stock, escritura sobre `cotizaciones` y borradores en `documentos_venta`.
- La tabla `cotizaciones` es el contrato de integracion: CotizaExpress crea filas; el POS las puede convertir en `documentos_venta` confirmados.

### 2. Documento de venta polimorfico

Cuatro tipos en una sola tabla `documentos_venta`:

| Tipo | Descuenta inventario | Genera CxC | Emite CFDI |
|------|----------------------|------------|------------|
| TICKET | si | no | no |
| REMISION | si | si (sin CFDI) | no |
| FACTURA (PUE) | si | no | si |
| FACTURA (PPD) | si | si | si + complementos |
| NOTA_CREDITO | devuelve si aplica | ajusta saldo | si (egreso) |

### 3. Modelo B - factura global

Una remision = un documento interno con folio R-000123 que descuenta inventario. Cuando el cliente pide factura del mes, se llama:

```
POST /api/ventas/consolidar-factura
{
  "cliente_id": 42,
  "remision_ids": [101, 105, 112, 118]
}
```

Esto crea una `FACTURA` que copia los conceptos (sin re-aplicar al kardex), marca cada remision como `FACTURADO` con `factura_padre_id`, y dispara el timbrado en Facturama.

### 4. Variantes para entera y mitad

Una varilla 3/8 entera y una varilla 3/8 mitad son dos `VarianteProducto` con SKUs distintos y stock independiente. Cuando se cortan piezas:

```
POST /api/inventario/transformacion
{ "variante_entera_id": 5, "cantidad": 1 }
```

Genera dos movimientos atomicos: `TRANSFORMACION_OUT (-1)` en la entera, `TRANSFORMACION_IN (+factor)` en la derivada (la mitad).

### 5. Inventario - unica fuente de verdad

`services/inventario_service.py::aplicar_movimiento` es la **unica funcion** que muta `VarianteProducto.stock_actual`. Cualquier modificacion debe pasar por aqui. Esto garantiza que el kardex siempre cuadra con el stock visible.

Validacion: no se permite stock negativo. Si una venta intenta dejar el stock en negativo, se aborta la transaccion.

### 6. CFDI 4.0 via Facturama

- Cliente HTTP en `integrations/facturama.py`
- Servicio en `services/cfdi_service.py` orquesta: timbrar, cancelar, notas de credito, complementos de pago
- Cancelacion CFDI 4.0 requiere motivo (01-04). Si motivo=01, `uuid_sustituye` obligatorio.
- Complementos de pago: por cada abono a una factura PPD, se emite un CFDI tipo P relacionado.
- Factura global al publico en general (RFC `XAXX010101000`) para remisiones que nunca se facturaron individualmente - se corre como tarea mensual.

### 7. Asistente Claude

Usado para tres casos en operacion (ademas de generar codigo):

1. **Cobranza:** cron lunes -> `whatsapp_service.generar_tanda_cobro()` arma mensajes via `ClaudeClient.redactar_mensaje_cobro()`. Bandeja de aprobacion en frontend. El dueno aprueba y se mandan via Twilio.
2. **Conciliacion de pagos:** webhook recibe imagen -> `ClaudeClient.parsear_comprobante_pago()` (vision) extrae JSON -> backend cruza con cartera y propone aplicacion -> cajero confirma.
3. **Reportes en LN:** futuro. Tools Claude expuestas via SDK para que el dueno pregunte por WhatsApp ("cuanto me deben hoy?", "ventas de la semana?").

### 8. Dos numeros de WhatsApp

| Linea | Direccion | Uso |
|-------|-----------|-----|
| Ventas | entrada principal | cotizaciones (CotizaExpress), pedidos, comprobantes de pago, dudas |
| Cobranza | salida principal | mensajes de cobro del lunes, recordatorios. Si responden, se acepta pero se sugiere usar la linea de ventas |

Ambas configuradas en Twilio con webhooks separados a `/api/whatsapp/ventas` y `/api/whatsapp/cobranza`.
