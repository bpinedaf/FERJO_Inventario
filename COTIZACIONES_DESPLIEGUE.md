# FERJO — Módulo Cotizaciones (rama de desarrollo)

## Estado
Implementación en `feature/cotizaciones`, disponible en Deploy Preview y Apps Script TEST independiente. Backend: 30 comprobaciones satisfactorias, 7 comprobaciones adicionales de protección y 6 consultas de regresión. Flujo principal de Cotizaciones validado desde el preview con Google Identity real. **No publicada en producción**; `main` permanece intacta. Ver `COTIZACIONES_TEST_RESULTADOS.md` para alcance, limitaciones y siguientes pasos.

### Funcionalidad disponible en el código
- Pestaña Cotizaciones con permisos `admin,ventas,inventario`
- Búsqueda de productos por código/nombre; sin exponer costos
- Cantidades y precios editables, descuento global y totales en Q
- Guardar, reabrir, actualizar, duplicar y consultar historial
- Generar PDF FERJO (Google Docs temporal → PDF en Drive)
- Marcar cotizaciones emitidas como ACEPTADA o RECHAZADA
- Auditoría de guardar/emitir/cambiar estado
- **Sin movimientos de inventario, ventas ni cobros**

## Archivos frontend
- `index.html`: pestaña y sección; cargas de JS/CSS.
- `cotizaciones.js`: interacción y endpoints.
- `cotizaciones.css`: estilos independientes.
- `cotizaciones-panel.html`: copia de referencia del fragmento HTML del panel; la versión utilizada está incluida en `index.html`.

## Backend Apps Script (REQUERIDO antes de probar)
1. Respaldar el proyecto Apps Script actual.
2. Crear **un proyecto TEST** con una copia de la hoja de cálculo, no usar los registros operativos durante las pruebas.
3. Añadir `apps-script/Cotizaciones.gs` como archivo al proyecto Apps Script TEST.
4. En el archivo del backend existente, **sin reemplazar las demás rutas**, agregar en `doGet(e)`, antes del `Not found`:

```javascript
  if (path === 'quotation_products') return quotationProducts_(e);
  if (path === 'quotation_list')     return quotationList_(e);
  if (path === 'quotation_get')      return quotationGet_(e);
```

5. Agregar en `doPost(e)`, antes del `Not found`:

```javascript
  if (path === 'quotation_save')     return quotationSave_(e);
  if (path === 'quotation_pdf')      return quotationPdf_(e);
  if (path === 'quotation_status')   return quotationStatus_(e);
```

6. Ajustar **solo en el proyecto TEST** `CFG.SHEET_ID` para apuntar a la copia de Google Sheets.
7. Configurar **Script Properties** opcionales:
   - `FERJO_COTIZACIONES_FOLDER_ID`: carpeta de Drive destino para PDF. Sin ella, se utiliza CFG.DRIVE_RECEIPTS_FOLDER_ID, la carpeta de comprobantes de ventas. El ejecutor debe tener permiso para crear archivos allí; se heredan sus permisos existentes. No hay guardado alternativo en raíz.
   - `FERJO_LOGO_FILE_ID`: ID de imagen del logotipo FERJO subida a Drive y accesible al ejecutor. Si falta, PDF con cabecera textual.
8. Crear un despliegue TEST de Apps Script; probar primero los endpoints con un token de usuario autorizado.
9. Utilizar un deploy preview / sitio de pruebas que apunte a la API TEST. No alterar la configuración productiva `FERJO_API_BASE` de los usuarios.
10. Solo después de las pruebas, preparar despliegue del backend y merge del frontend a `main`.

**Nota sobre orden de despliegue:** la pestaña frontend usa endpoints nuevos; no fusionar la rama con `main` antes de que el backend compatible esté disponible.

## Hojas creadas automáticamente por el módulo
- `cotizaciones`: id_cotizacion, fecha, cliente_nombre, cliente_telefono, cliente_email, cliente_nit, vigencia_dias, fecha_vencimiento, forma_pago, entrega, descuento_porcentaje, subtotal, descuento_monto, total_neto, estado, usuario, notas, doc_url, version, created_at, updated_at.
- `cotizaciones_detalle`: id_cotizacion, linea, id_del_articulo, nombre, cantidad, precio_sugerido, precio_unitario, descuento_unitario, subtotal, created_at.

No cambiar el orden de los encabezados; el módulo valida su esquema.

## Pruebas obligatorias
1. Iniciar sesión como usuario de ventas, consultar artículos y crear cotización con varias líneas.
2. Comparar descuentos y redondeos contra cálculo manual.
3. Cotizar un artículo sin existencias: debe advertir pero permitir guardar.
4. Consultar historial, reabrir cotización y actualizar; abrir una copia en otra pestaña y verificar bloqueo por versión.
5. Duplicar una cotización y confirmar que obtiene nuevo ID.
6. Generar PDF, revisar logo (si configurado), teléfono y dirección, artículos, total, vigencia, notas.
7. Marcar EMITIDA como ACEPTADA o RECHAZADA, verificar auditoría.
8. Verificar que hojas de ventas, ventas_detalle, movimientos, cobros, cierres_caja y Base_Inventario no cambiaron.
9. Intentar acceder a endpoints sin token y con usuario sin roles: deben rechazar.
10. Comprobar que Ventas, Compras, Caja, Reportes e Inventario siguen funcionando.

## Alcance no incluido aún
- Conversión automática de cotización a venta.
- Reservas de stock.
- Envío directo por WhatsApp/correo.
- Reportería de conversión comercial.
- Caducidad automática del estado VENCIDA (la fecha de vencimiento sí se almacena).

## Consideraciones para producción
El guardado del detalle y encabezado usa `LockService` y control de versión. Google Sheets no ofrece transacciones atómicas de múltiples hojas: validar respaldo y recuperación ante un fallo intermedio antes de producción.

La generación de PDF depende de permisos de Google Drive/Docs. El documento temporal se elimina tras generar el archivo PDF. Verificar configuración de permisos de la carpeta resultante antes de compartir con clientes.

**Se recomienda aislar los datos de prueba y validar la implantación con Fernando antes de activar este módulo en la base de producción.**


## Entorno TEST ya creado (11 nov 2026)

- Copia privada de la base FERJO: https://docs.google.com/spreadsheets/d/1IpMHS_4jtmOSFr_J-TCUxuc_86snAdOB3gq4oXSphwo/edit
- Copia separada de la base operativa: `1IpMHS_4jtmOSFr_J-TCUxuc_86snAdOB3gq4oXSphwo`.
- Hojas `cotizaciones` y `cotizaciones_detalle`: creadas, con encabezados correctos y primera fila congelada.
- Es una copia que incluye información real histórica de FERJO. Mantener privada; usar exclusivamente usuarios autorizados y no compartir el enlace con terceros.
- Proyecto y despliegue Apps Script TEST creados mediante navegador integrado. Proyecto: `1BctTZNDIhV_Js7IbbQEu-5v7g5sxBC0dYRROkNCpGZYgq9btMOZqTAzr`. Versión 3 desplegada con acceso Anyone autorizado por el propietario y rutas heredadas protegidas exclusivamente en TEST. Detalles y resultados: `COTIZACIONES_TEST_RESULTADOS.md`.
- Al crear el proyecto TEST, establecer exactamente:
  `CFG.SHEET_ID = '1IpMHS_4jtmOSFr_J-TCUxuc_86snAdOB3gq4oXSphwo'`
- No reutilizar el despliegue productivo que referencia `1A3bawnMDwPcx2aeUkP7gACL5ddvBmCX3MutSR-UL7BU`.
- En la interfaz del Deploy Preview de Netlify, establecer manualmente la URL del Apps Script TEST en el campo `API URL`. Es **persistente en localStorage por origen**; no usar el origen productivo para pruebas.
- El preview `https://deploy-preview-1--ferjo-system.netlify.app` requiere estar autorizado por Google Identity Services como origen JavaScript o emplear un cliente OAuth distinto de pruebas.
- **Secuencia de publicación**: primero backend compatible en Apps Script productivo, después merge del Pull Request de GitHub a `main`.

## Revisión técnica previa a producción
- Los descuentos globales y por línea son conceptos distintos: `precio_unitario` ya refleja cambios por línea, y el porcentaje global se aplica después. No duplicar descuentos.
- Para proteger cotizaciones emitidas, solo se pueden actualizar documentos en estado BORRADOR. Una EMITIDA puede duplicarse y guardarse como nueva.
- Los estados ACEPTADA y RECHAZADA no permiten reemitir PDF.
- No utilizar `quotation_save` desde entornos de prueba apuntados a la base productiva.

## Secuencia concreta preparada para producción (12 nov 2026)

**No ejecutada.** Conservar PR #1 en borrador hasta revisión final.

1. Resolver alcance de acceso de vendedores a PDF (actualmente privados del ejecutor), confirmar encabezado comercial y logo opcional; revisar respaldo/recuperación de escrituras multitabla.
2. Respaldar archivos actuales del proyecto productivo y anotar versión/ID del despliegue activo para reversión. No copiar código de pruebas.
3. Añadir exclusivamente apps-script/Cotizaciones.gs corregido al proyecto productivo existente. Conservar CFG.SHEET_ID y configuración productiva.
4. En doGet integrar quotation_products, quotation_list, quotation_get; en doPost quotation_save, quotation_pdf, quotation_status. Mantener las rutas actuales.
5. Configurar carpeta privada de PDF y logo opcional, con accesos expresamente aprobados. Autorizar permisos Docs/Drive necesarios.
6. Manage deployments → Edit → New version sobre el despliegue **existente** productivo; conservar su URL. No crear un nuevo despliegue productivo.
7. Verificar respuesta de rutas nuevas y acceso autorizado; después marcar PR listo y fusionar frontend a main. Verificar deploy Netlify y navegación existente.
8. Ante fallo: volver el despliegue Apps Script a la versión respaldada y revertir el commit frontend. Revisar y restaurar datos desde respaldo si el fallo alcanzó escrituras; revertir código no revierte hojas ni archivos PDF.

No copiar TestCotizaciones.gs, ferjoTestRouteGuard_, IDs TEST ni la configuración del preview a producción.

## Política de PDF aprobada (12 nov 2026)

Los nuevos PDF de cotizaciones se guardan por defecto en CFG.DRIVE_RECEIPTS_FOLDER_ID (RECIBOS, igual que ventas) y el módulo aplica ANYONE_WITH_LINK + VIEW. Aprobado expresamente por el propietario y verificado en TEST v5 mediante el diálogo de permisos de un PDF generado desde preview. No modificar la compartición de toda la carpeta. Ya no está pendiente decidir la política de acceso de vendedores/clientes: pueden abrir los PDF con el enlace. Producción aún no publicada.
