# Cotizaciones — resultados TEST (11–12 noviembre 2026)

## Estado

Backend integrado y probado en proyecto TEST independiente. Flujo principal validado desde Deploy Preview con autenticación Google real de usuario con rol inventario. Producción sin modificar. Mantener PR #1 en borrador hasta revisión final de publicación; no se ha fusionado.

- Proyecto TEST: https://script.google.com/u/0/home/projects/1BctTZNDIhV_Js7IbbQEu-5v7g5sxBC0dYRROkNCpGZYgq9btMOZqTAzr/edit
- CFG.SHEET_ID TEST: `1IpMHS_4jtmOSFr_J-TCUxuc_86snAdOB3gq4oXSphwo`.
- API TEST: https://script.google.com/macros/s/AKfycbwECUbeMHLRBjpeiSyuuAstiCjLOTsjJOMCZ77z90rpmfiRRqpzGIfYvd-ng9qTk20S4w/exec
- Despliegue TEST **versión 3**, publicado el 12 noviembre 2026, 07:04 (Guatemala), con acceso **Anyone**, autorizado expresamente por Billy. Ejecuta como propietario y conserva su URL.
- Solo en TEST se añadió ferjoTestRouteGuard_: Cotizaciones y me conservan sus controles originales; las demás rutas requieren token válido y rol admin. Así las antiguas rutas públicas no exponen la copia histórica. **No copiar esta protección específica de TEST a producción.**
- Preview configurado mediante su campo API URL para usar TEST, separado de la configuración productiva.

## Integración realizada

Se reutilizó el proyecto vinculado a la copia de Sheets, se renombró a FERJO TEST Cotizaciones API y se sustituyó exclusivamente su CFG.SHEET_ID. Se añadió Cotizaciones.gs y las tres rutas GET y tres rutas POST sin eliminar rutas existentes. Se verificó por lectura completa del editor que Code.gs guardado coincide con el contenido preparado y no conserva el ID de la hoja productiva.

La revisión visual del primer PDF detectó fechas de Sheets serializadas como texto con hora y zona. Corregido en cotHeader_: fecha/fecha_vencimiento se normalizan a yyyy-MM-dd y los demás Date a ISO. Corrección incluida en commit dc7291e6ee5e895d194aed38c226d7fcf9d08c73.

## Alcance real de las pruebas

30 comprobaciones satisfactorias ejecutadas desde el editor Apps Script contra Sheets/Drive/Docs reales de TEST. La suite TestCotizaciones.gs tiene guardas de ID de proyecto y de hoja. Primero prueba los routers con la autenticación real sin token. Para las pruebas de negocio sustituye requireAuth_ temporalmente durante esa ejecución por un contexto sintético de ventas y lo restaura en finally. Esto **no acredita autenticación Google Identity exitosa ni permisos de usuarios reales**. La suite nunca debe copiarse a producción.

Comprobado:

- Los seis endpoints rechazan solicitudes sin token; contexto sin roles rechazado.
- Catálogo disponible, búsqueda por código y respuesta sin costos.
- Guardar dos líneas: 3 × Q19.80 + 2 × Q7.35 = Q74.10; descuento 10% = Q7.41; total Q66.69.
- Leer encabezado/detalle, fechas ISO e historial.
- Actualizar y eliminar una línea: Q59.40 menos Q5.94 = Q53.46; versión incrementada.
- Rechazar versión obsoleta, producto repetido y descuento mayor de 100%.
- Guardar artículo sin stock y duplicar con nuevo ID.
- Generar PDF real y comprobar visualmente fechas, cantidades, descuento y total. Sin logo configurado: cabecera textual.
- EMITIDA bloquea edición; transición a ACEPTADA o RECHAZADA; rechazo de transición inválida, versión obsoleta y reemisión tras cierre.
- Auditoría registrada.
- Comparación SHA256 antes/después de todos los valores de Base_Inventario, ventas, ventas_detalle, movimientos, cobros, cierres_caja, compras y compras_detalle: iguales.
- Prueba HTTP del despliegue quotation_list sin token: {"ok":false,"error":"No token"}.

PDF de segunda ejecución: https://drive.google.com/file/d/11LcrJA8FKMzlBciZEmFZafNZCnDWo5Eb/view

## Validación frontend real — 12 noviembre

- Origen OAuth del preview corregido por el propietario. Ya no aparece origin_mismatch.
- Google Identity autentica bpinedaf.apps@gmail.com; backend devuelve sus roles productos, fotos, inventario y reportes. El permiso inventario habilita Cotizaciones sin añadir roles.
- El preview conserva API TEST mediante su campo API URL y localStorage del origen de pruebas.
- Catálogo e historial cargados desde TEST; advertencia al agregar artículo sin stock.
- Guardar dos líneas: subtotal Q74.10, descuento Q7.41, total Q66.69; ID COT-20261112-070726-324.
- Reabrir: recupera cliente, cantidades, precios y descuento. Eliminar segunda línea y guardar: total Q53.46.
- Emitir PDF y marcar primera cotización ACEPTADA.
- Duplicar la anterior, cambiar cliente y guardar: nuevo ID COT-20261112-071025-738, total Q53.46.
- Emitir PDF del duplicado; enlace Abrir PDF abre Drive correctamente. Documento privado, una página, fechas 2026-11-12/2026-11-27, tres unidades a Q19.80, subtotal Q59.40, descuento Q5.94, total Q53.46.
- Marcar duplicado RECHAZADA: historial y cabecera muestran el mismo estado. Intentar guardar después del cierre: rechazo esperado «Solo se pueden editar BORRADORES».
- Reload del preview restaura sesión y mantiene API TEST.

PDF de prueba de interfaz: https://drive.google.com/file/d/1Bc3TIlWU3YZqsDb64Rz2_W3eIYpmnH84/view?pli=1

### Correcciones encontradas durante prueba de interfaz

- 8ba0f39acea6431ea7696e3806509ca8016e755e: reemplazar window.open después de await por enlace visible Abrir PDF, evitando dependencia de popup asíncrono.
- fbfcbcbc8a41b580e7d084643b26844782a2520d: sincronizar estado en cabecera al aceptar/rechazar; texto apropiado al reabrir cotizaciones cerradas.
- Ambas correcciones verificadas en el preview actualizado.

## Comprobaciones adicionales de protección y regresión

- Siete comprobaciones de guardas TEST satisfactorias: bloqueo sin token de products, sales_summary, quotation_list, requests, catalog_cart y quotation_save; rol ventas no accede al reporte legado reservado a admin en TEST.
- Pruebas HTTP de versión 3: products y quotation_list sin token devuelven ok:false, error:No token.
- Seis consultas de regresión ejecutadas desde editor sobre copia real TEST: inventory_list, sales_summary, sales_report, purchases_report, daily_cash_report y cxc_list devuelven ok:true. Comparación SHA256 de las ocho hojas operativas: sin cambios.
- **Alcance de regresión**: contexto admin sintético durante esa ejecución, restaurado en finally. No es una prueba de autenticación real de administrador ni una regresión de registro/cancelación de ventas, compras, pagos o cierre de caja. No se crearon operaciones comerciales.

## Pendientes antes de activar producción

- Revisar con el propietario la presentación final y los datos comerciales impresos: FERJO S.A., 19 Calle Zona 1, teléfono 2251 6251. Logo opcional todavía sin configurar; cabecera textual verificada.
- Comprobar usuario real de ventas y alcance de acceso a PDF para vendedores: los PDF creados son privados del ejecutor; el propietario sí pudo abrirlos. No se ha ampliado compartición de Drive. Definir carpeta/equipo autorizado antes de activar vendedores que necesiten abrir o entregar los documentos.
- Google Sheets no ofrece transacción multitabla: no se ha hecho prueba destructiva de fallo intermedio y recuperación del guardado. Usar respaldo y revisión del procedimiento de reversión antes de publicación.
- Si se exige regresión completa de operaciones comerciales, ejecutarla con datos sintéticos TEST y usuario administrador autorizado. Las pruebas actuales cubren consultas y el flujo real de Cotizaciones con rol inventario.

## Preparación de producción

Solo después de completar lo pendiente: respaldo del código y versión desplegada actual; añadir Cotizaciones.gs corregido; integrar únicamente seis rutas; conservar CFG.SHEET_ID productivo; revisar permisos Drive/Docs y carpeta privada de PDF; actualizar el despliegue productivo existente con New version (conservar URL); verificar endpoints; finalmente fusionar PR frontend y comprobar Netlify. No copiar TestCotizaciones.gs ni configuración TEST. Reversión: seleccionar versión previa del despliegue y revertir commit frontend si procede.
