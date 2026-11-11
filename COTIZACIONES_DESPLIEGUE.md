# FERJO — Módulo Cotizaciones (rama de desarrollo)

## Estado
Implementación inicial en \`feature/cotizaciones\`. **NO publicada en Netlify ni en Apps Script**. La rama \`main\` permanece intacta.

### Funcionalidad disponible en el código
- Pestaña Cotizaciones con permisos \`admin,ventas,inventario\`
- Búsqueda de productos por código/nombre; sin exponer costos
- Cantidades y precios editables, descuento global y totales en Q
- Guardar, reabrir, actualizar, duplicar y consultar historial
- Generar PDF FERJO (Google Docs temporal → PDF en Drive)
- Marcar cotizaciones emitidas como ACEPTADA o RECHAZADA
- Auditoría de guardar/emitir/cambiar estado
- **Sin movimientos de inventario, ventas ni cobros**

## Archivos frontend
- \`index.html\`: pestaña y sección; cargas de JS/CSS.
- \`cotizaciones.js\`: interacción y endpoints.
- \`cotizaciones.css\`: estilos independientes.
- \`cotizaciones-panel.html\`: copia de referencia del fragmento HTML del panel; la versión utilizada está incluida en \`index.html\`.

## Backend Apps Script (REQUERIDO antes de probar)
1. Respaldar el proyecto Apps Script actual.
2. Crear **un proyecto TEST** con una copia de la hoja de cálculo, no usar los registros operativos durante las pruebas.
3. Añadir \`apps-script/Cotizaciones.gs\` como archivo al proyecto Apps Script TEST.
4. En el archivo del backend existente, **sin reemplazar las demás rutas**, agregar en \`doGet(e)\`, antes del \`Not found\`:

\`\`\`javascript
  if (path === 'quotation_products') return quotationProducts_(e);
  if (path === 'quotation_list')     return quotationList_(e);
  if (path === 'quotation_get')      return quotationGet_(e);
\`\`\`

5. Agregar en \`doPost(e)\`, antes del \`Not found\`:

\`\`\`javascript
  if (path === 'quotation_save')     return quotationSave_(e);
  if (path === 'quotation_pdf')      return quotationPdf_(e);
  if (path === 'quotation_status')   return quotationStatus_(e);
\`\`\`

6. Ajustar **solo en el proyecto TEST** \`CFG.SHEET_ID\` para apuntar a la copia de Google Sheets.
7. Configurar **Script Properties** opcionales:
   - \`FERJO_COTIZACIONES_FOLDER_ID\`: carpeta de Drive destino para PDF. Sin ella, se guardan en la carpeta raíz del propietario del script.
   - \`FERJO_LOGO_FILE_ID\`: ID de imagen del logotipo FERJO subida a Drive y accesible al ejecutor. Si falta, PDF con cabecera textual.
8. Crear un despliegue TEST de Apps Script; probar primero los endpoints con un token de usuario autorizado.
9. Utilizar un deploy preview / sitio de pruebas que apunte a la API TEST. No alterar la configuración productiva \`FERJO_API_BASE\` de los usuarios.
10. Solo después de las pruebas, preparar despliegue del backend y merge del frontend a \`main\`.

**Nota sobre orden de despliegue:** la pestaña frontend usa endpoints nuevos; no fusionar la rama con \`main\` antes de que el backend compatible esté disponible.

## Hojas creadas automáticamente por el módulo
- \`cotizaciones\`: id_cotizacion, fecha, cliente_nombre, cliente_telefono, cliente_email, cliente_nit, vigencia_dias, fecha_vencimiento, forma_pago, entrega, descuento_porcentaje, subtotal, descuento_monto, total_neto, estado, usuario, notas, doc_url, version, created_at, updated_at.
- \`cotizaciones_detalle\`: id_cotizacion, linea, id_del_articulo, nombre, cantidad, precio_sugerido, precio_unitario, descuento_unitario, subtotal, created_at.

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
El guardado del detalle y encabezado usa \`LockService\` y control de versión. Google Sheets no ofrece transacciones atómicas de múltiples hojas: validar respaldo y recuperación ante un fallo intermedio antes de producción.

La generación de PDF depende de permisos de Google Drive/Docs. El documento temporal se elimina tras generar el archivo PDF. Verificar configuración de permisos de la carpeta resultante antes de compartir con clientes.

**Se recomienda aislar los datos de prueba y validar la implantación con Fernando antes de activar este módulo en la base de producción.**
