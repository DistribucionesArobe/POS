# Roadmap - Aceromax POS

Estimacion: ~16 semanas con Claude (codigo) como motor principal de desarrollo, validacion humana semanal.

## Fase 1 - Operacion basica (semanas 1-4)

**Meta:** Aceromax puede vender con el sistema. Las facturas siguen saliendo del sistema viejo.

Entregables:
- Migracion inicial alembic con todas las tablas
- CRUD productos y variantes (entera/mitad)
- CRUD clientes (sin datos fiscales obligatorios)
- POST /ventas funcionando para TICKET y REMISION
- Descuento de inventario transaccional
- Generacion de CxC para REMISION
- PDF de ticket y remision (reportlab)
- Frontend: login, dashboard, nueva venta, cartera
- Auth con roles (admin, dueno, cajero, cobranza)
- Despliegue en Render staging

Criterio de listo:
- Cajero puede crear 100 tickets/dia sin problemas
- Stock se descuenta correctamente
- CxC refleja saldos por cliente

## Fase 2 - Facturacion CFDI (semanas 5-8)

**Meta:** Reemplazar el sistema viejo. Toda la facturacion sale del nuevo POS.

Entregables:
- Cliente Facturama completo: timbrado, descarga XML/PDF
- POST /ventas tipo FACTURA con timbrado opcional inmediato
- Consolidacion de remisiones en factura global (modelo B)
- Cancelacion CFDI con motivo y sustitucion
- Notas de credito (CFDI Egreso) con devolucion de inventario opcional
- Complementos de pago automaticos para PPD
- Factura global al publico en general (CFDI mensual XAXX010101000)
- Catalogos SAT actualizados (clave producto/servicio, unidades)
- Validacion RFC en alta de cliente
- Envio automatico de XML+PDF al cliente por WhatsApp/correo

Criterio de listo:
- Aceromax emite todas sus facturas desde el POS
- Cancelaciones funcionan con receptor
- IVA causado vs cobrado balanceado para PPD

## Fase 3 - Compras y CxP (semanas 9-12)

**Meta:** Cerrar el ciclo financiero. Kardex valorizado, utilidad por venta.

Entregables:
- CRUD proveedores
- POST /compras: recepcion de mercancia con conceptos y costos
- Importacion de XML del CFDI del proveedor (parseo automatico)
- Actualizacion de costo promedio ponderado por entrada
- Generacion de CxP
- POST /abono-cxp y programacion de pagos
- Reporte: kardex valorizado, utilidad por producto/venta
- Reporte: antiguedad de CxP

Criterio de listo:
- Toda compra se registra y refleja en costo promedio
- Reporte de utilidad mensual cuadra con contabilidad

## Fase 4 - Asistente Claude (semanas 13-16)

**Meta:** Capacidades que ningun competidor tiene cerca.

Entregables:
- Integracion CotizaExpress: cambiar su DB pointer al POS, validar end-to-end
- Tabla `mensajes_cobro_propuestos` y bandeja de aprobacion en frontend
- Cron lunes 9am genera tanda de cobranza
- Conciliacion de pagos: webhook ventas -> vision -> propuesta -> confirmacion
- Tools Claude para reportes por WhatsApp (asistente del dueno)
- Numero de WhatsApp del dueno con autenticacion (no cualquier numero accede)
- Avisos proactivos nocturnos: "se cerro con $X, alerta de stock bajo en Y"

Criterio de listo:
- Cobranza semanal automatizada al menos 80%
- 50%+ de comprobantes WhatsApp se concilian automaticamente

## Post-MVP (despues de fase 4)

Ideas para fases 5+:
- Multisucursal (si Aceromax abre otra)
- App movil para vendedores en ruta
- Integracion con bancos (descarga estado de cuenta automatica)
- Catalogo de precios diferenciados por tipo de cliente
- Lealtad / puntos
- Apartados / pre-ventas
- Dashboard publico de productos para clientes
