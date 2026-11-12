# Cotizaciones — publicación 12 noviembre 2026

Publicado en https://ferjo-system.netlify.app/.

- Apps Script productivo: versión 105, actualización del despliegue existente, URL conservada. Reversión del backend: versión 104.
- PR #1 fusionado; commit de merge `6346afe6db9bc4f0de21aff58b3680fc2d4a47e3`.
- Integración: Cotizaciones.gs y seis rutas; configuración productiva conservada; sin helpers ni protección especial TEST.
- Respaldo previo de los cinco archivos productivos: FERJO_AppsScript_Backup_PreCotizaciones_20261112.json, conservado por el propietario fuera del repositorio.

## Verificación en producción

Inicio de sesión real con cuenta autorizada y rol inventario. Pestaña Cotizaciones visible, consulta de productos e historial correctas. Guardado de `COT-20261112-083233-760`, cliente `VERIFICACION TECNICA — SIN VALIDEZ COMERCIAL`, un artículo POLLO C220 (código 1), total Q3.00. PDF generado y abierto correctamente; Drive muestra acceso para cualquiera con el enlace, sin inicio de sesión. Registro técnico marcado RECHAZADA y comprobado en historial.

PDF de evidencia: https://drive.google.com/file/d/1bViqX5tSD8Dna0ronQNisJuSEreSc-FO/view

La cotización técnica no corresponde a una venta. El módulo no invoca registro de ventas/cobros ni reserva inventario. No se ejecutaron transacciones comerciales de regresión en producción. La validación TEST detallada se documenta en COTIZACIONES_TEST_RESULTADOS.md.

## Reversión

Seleccionar versión 104 en el despliegue Apps Script existente y revertir el merge frontend en GitHub/Netlify. Conservar los registros de cotizaciones para trazabilidad.

## Actualización de diseño — versión 106

Publicado el 12 noviembre 2026, 08:52 Guatemala. Cotizaciones.gs reproduce la plantilla comercial: logo original JPEG incrustado, colores corporativos, cuadro de cliente/contacto/usuario que atiende, cabecera azul, filas alternadas, totales destacados, condiciones completas, agradecimiento y pie. Formato carta con tablas dentro de márgenes; fechas dd/mm/aaaa. Descuento explícitamente global, sin alterar cálculos. No se modificaron guardado, estados, autenticación, rutas ni frontend. Commit del generador: b7b4f530939ea0848f93622565bb0b357e096b09.

Validación real del render en Apps Script TEST: 3 artículos, subtotal Q143.00, descuento 10% Q14.30, total Q128.70, una página; 40 artículos con descripciones extensas y acentos, subtotal Q3,324.50, descuento Q332.45, total Q2,992.05, tres páginas. Encabezados repetidos y cierre completo verificados visualmente en Drive. TEST actualizado a versión 6, conservando su protección de rutas heredadas.

Prueba autenticada en producción: COT-20261112-085352-289, VERIFICACION DISENO — SIN VALIDEZ COMERCIAL, Q3.00. PDF nuevo generado y abierto con formato corporativo; Drive confirma acceso para cualquiera con enlace sin inicio de sesión. Registro técnico marcado RECHAZADA. PDF: https://drive.google.com/file/d/1fRd9yQgAKCcFk-L8sDtVIqqJRARFzNJ1/view

Muestra multipágina TEST: https://drive.google.com/file/d/16zqdRNt8hxHeKCw2M0iu1cQGVlhXAY2o/view

La versión 105 permite revertir únicamente este ajuste de presentación. La URL productiva se conserva. Los PDF existentes no se sustituyen automáticamente; el formato nuevo se aplica al generarlos.
