# Notas CFDI 4.0 y Facturama

## Regimen 612 (Personas Fisicas con Actividades Empresariales y Profesionales)

Aceromax factura bajo regimen 612. Implicaciones:
- Causa IVA al 16% en operaciones generales
- Puede emitir comprobantes a PF y PM
- Esta obligado a emitir factura electronica
- Declaraciones mensuales y anuales
- DIOT mensual

## Datos del emisor (Aceromax)

Configurar en `.env`:
- `FACTURAMA_RFC_EMISOR`: RFC de Aceromax
- `FACTURAMA_REGIMEN_FISCAL`: 612
- `FACTURAMA_LUGAR_EXPEDICION`: codigo postal del domicilio fiscal

Subir a Facturama (una sola vez en su panel):
- CSD del SAT (.cer y .key) + contrasena
- Logo

## Datos del receptor (cliente)

Para CFDI 4.0 son obligatorios:
- RFC
- Nombre o razon social TAL CUAL aparece en la constancia de situacion fiscal
- Regimen fiscal del receptor (catalogo c_RegimenFiscal)
- Codigo postal del domicilio fiscal
- Uso CFDI (G01, G03, P01, etc.)

Si alguno esta mal el SAT rechaza el timbrado. Aceromax debe pedir al cliente su Constancia de Situacion Fiscal la primera vez.

## Forma de pago vs metodo de pago

| Concepto | Codigo | Cuando usarlo |
|----------|--------|---------------|
| Forma pago: Efectivo | 01 | Cliente paga en caja con billetes |
| Forma pago: Cheque | 02 | |
| Forma pago: Transferencia | 03 | SPEI o similar |
| Forma pago: TC | 04 | |
| Forma pago: Por definir | 99 | Solo cuando metodo = PPD |
| Metodo: PUE | PUE | Pago en una sola exhibicion (mismo dia) |
| Metodo: PPD | PPD | A credito - obliga complemento de pago despues |

Regla: si vendes a credito (cliente se lleva sin pagar), DEBE ser `PPD` con forma `99`.

## Cancelacion CFDI 4.0

Motivos validos:
- 01: Comprobante emitido con errores con relacion (requiere `uuidReplacement`)
- 02: Comprobante emitido con errores sin relacion
- 03: No se llevo a cabo la operacion
- 04: Operacion nominativa relacionada en factura global

Reglas:
- Si pasaron mas de 24 horas o el monto es alto, el receptor debe **aceptar la cancelacion** en el portal del SAT
- Despues del ejercicio fiscal cerrado, ya no se puede cancelar - solo emitir nota de credito

## Nota de credito (CFDI Egreso)

Tipo de comprobante: **E** (Egreso). Se relaciona con la factura original via `CfdiRelacionados`.

Casos:
- Devolucion de mercancia: ajusta inventario (entrada al kardex) y reduce CxC
- Descuento o bonificacion: solo reduce CxC
- Correccion de error de monto: cancelar es preferible si esta dentro de plazo

## Complementos de pago (PPD)

Cada vez que se cobra un peso a una factura PPD, hay que emitir un CFDI tipo P (Pago) relacionado a la factura. Plazos:
- Antes del dia 5 del mes siguiente al cobro
- Si no se emite, hay multa SAT y la factura no se considera pagada

El POS dispara la emision automatica al registrar `AbonoCxC` con `emitir_complemento_pago=True`.

## Factura global

Para ventas al publico en general (sin RFC), Aceromax debe emitir mensualmente una **factura global** con receptor `XAXX010101000` que consolide todos los TICKETs no facturados individualmente. Esto NO aplica a remisiones (que tienen cliente identificado y se consolidan con su RFC real).

## Facturama - notas operativas

- API base: `https://api.facturama.mx` (produccion) | `https://apisandbox.facturama.com.mx` (pruebas)
- Auth: HTTP Basic con usuario/contrasena
- Cuesta por timbre (~$1-3 MXN cada uno) o paquetes mensuales
- Tarda 1-3 segundos timbrar - hacerlo asincrono si volumen alto
- Sandbox tiene RFCs de prueba: `EKU9003173C9` (PM), `URE180429TM6` (PF)
- Logos del emisor: subir en su panel, no via API
