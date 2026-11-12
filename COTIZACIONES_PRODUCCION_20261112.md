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
