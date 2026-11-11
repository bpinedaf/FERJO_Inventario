# Cotizaciones — resultados TEST (11 noviembre 2026)

## Estado

Backend integrado y probado en proyecto TEST independiente. Producción sin modificar. PR #1 debe continuar en borrador: la validación integral desde frontend y las regresiones de los módulos existentes siguen pendientes.

- Proyecto TEST: https://script.google.com/u/0/home/projects/1BctTZNDIhV_Js7IbbQEu-5v7g5sxBC0dYRROkNCpGZYgq9btMOZqTAzr/edit
- CFG.SHEET_ID TEST: `1IpMHS_4jtmOSFr_J-TCUxuc_86snAdOB3gq4oXSphwo`.
- API TEST: https://script.google.com/macros/s/AKfycbwECUbeMHLRBjpeiSyuuAstiCjLOTsjJOMCZ77z90rpmfiRRqpzGIfYvd-ng9qTk20S4w/exec
- Acceso del despliegue: **Only myself**, ejecuta como propietario. No se ha abierto a acceso público.
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

## Bloqueos de validación integral

1. Google Identity rechaza el preview con `origin_mismatch`. Registrar exactamente `https://deploy-preview-1--ferjo-system.netlify.app` como Authorized JavaScript origin del cliente `852782550488-5k5d6gj1fn7q7sbqdn7l532r7pgo5r2t.apps.googleusercontent.com`, o usar cliente OAuth TEST independiente y actualizar únicamente TEST. Cloud Console devolvió Site Unavailable en el navegador integrado; no se pudo hacer el cambio.
2. El despliegue TEST está limitado a Only myself. Antes de habilitar llamadas CORS del frontend mediante acceso Anyone, revisar y restringir en TEST las rutas públicas heredadas que podrían exponer la copia de datos reales. No abrir el backend completo sin esta revisión y autorización.
3. Pendiente autenticación real de usuario autorizado, CRUD/PDF desde preview, comprobación visual del frontend y regresión funcional de Ventas, Compras, Caja, Reportes e Inventario.
4. Pendiente logo y confirmación de datos comerciales del encabezado del PDF.

## Preparación de producción

Solo después de completar lo pendiente: respaldo del código y versión desplegada actual; añadir Cotizaciones.gs corregido; integrar únicamente seis rutas; conservar CFG.SHEET_ID productivo; revisar permisos Drive/Docs y carpeta privada de PDF; actualizar el despliegue productivo existente con New version (conservar URL); verificar endpoints; finalmente fusionar PR frontend y comprobar Netlify. No copiar TestCotizaciones.gs ni configuración TEST. Reversión: seleccionar versión previa del despliegue y revertir commit frontend si procede.
