// admin.js
// FERJO — Admin Inventarios
// Maneja: configuración API, pestañas, productos, fotos, ventas, compras,
// movimientos y reportes básicos.
// -------------------------------------------------------------------

'use strict';

/* ======================================================
   1) API BASE & UTILIDADES COMUNES
   ====================================================== */

// MISMA lógica que el catálogo:
function apiBase() {
  const saved = localStorage.getItem('FERJO_API_BASE') || (window.CONFIG && window.CONFIG.API) || '';
  return (saved || '').replace(/\/+$/, ''); // quita slashes finales
}

// Guarda la base en localStorage y devuelve la versión "limpia"
function setApiBase(url) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (!clean) {
    localStorage.removeItem('FERJO_API_BASE');
  } else {
    localStorage.setItem('FERJO_API_BASE', clean);
  }
  return clean;
}

// Construye la URL final: BASE + (? o &) + path=...&t=...
function buildApiUrl(path, extraParams = {}) {
  const BASE = apiBase();
  if (!BASE) {
    throw new Error(
      'No hay API configurada. En el Admin, define la URL en la caja "API URL" y presiona Guardar.'
    );
  }

  const params = new URLSearchParams({
    path,
    t: Date.now().toString(),
    ...extraParams
  });

  const join = BASE.includes('?') ? '&' : '?';
  return `${BASE}${join}${params.toString()}`;
}

// Parse seguro de respuesta JSON (Apps Script a veces manda text/plain)
async function parseJsonResponse(res) {
  const ct = res.headers.get('content-type') || '';
  const txt = await res.text();
  try {
    if (ct.includes('application/json')) {
      return JSON.parse(txt);
    }
    return JSON.parse(txt);
  } catch (e) {
    return { ok: false, error: 'Respuesta no es JSON válido', raw: txt };
  }
}

// Formatear moneda (igual que el catálogo)
function formatMoneyGTQ(n) {
  try {
    return new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: 'GTQ'
    }).format(Number(n || 0));
  } catch {
    return 'Q ' + Number(n || 0).toFixed(2);
  }
}

/* ============================
   2) CONFIGURACIÓN DE API URL
   ============================ */

function hydrateApiConfig() {
  const input = document.getElementById('apiUrl');
  const status = document.getElementById('apiStatus');
  if (!input) return;

  const base = apiBase();
  if (base) {
    input.value = base;
    if (status) {
      status.textContent = '✓ Configurada';
      status.style.color = '#4caf50';
    }
  } else {
    if (status) {
      status.textContent = 'Sin configurar';
      status.style.color = '#f44336';
    }
  }
}

async function testApiBase(url) {
  try {
    const testUrl = buildApiUrl('ping'); // Puedes cambiar a otro path de prueba si tu backend usa otro
    const res = await fetch(testUrl, { method: 'GET', mode: 'cors' });
    const data = await parseJsonResponse(res);
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'HTTP ' + res.status);
    }
    return true;
  } catch (e) {
    console.warn('Error testeando API:', e);
    return false;
  }
}

async function onClickSaveApi() {
  const input = document.getElementById('apiUrl');
  const status = document.getElementById('apiStatus');
  if (!input) return;
  const raw = input.value;

  const clean = setApiBase(raw);
  if (!clean) {
    if (status) {
      status.textContent = 'URL borrada. Debes configurar una URL válida.';
      status.style.color = '#f44336';
    }
    return;
  }

  if (status) {
    status.textContent = 'Probando...';
    status.style.color = '#ffa000';
  }

  const ok = await testApiBase(clean);
  if (status) {
    if (ok) {
      status.textContent = '✓ Conexión OK';
      status.style.color = '#4caf50';
    } else {
      status.textContent = '⚠ Guardada, pero no respondió el "ping".';
      status.style.color = '#f44336';
    }
  }
}

/* ============================
   3) NAVEGACIÓN POR TABS
   ============================ */

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll('.tabs .tab'));
  const panels = Array.from(document.querySelectorAll('main .panel'));

  if (!tabs.length || !panels.length) return;

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (!tabId) return;

      tabs.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => {
        p.classList.toggle('active', p.id === tabId);
      });

      btn.classList.add('active');
    });
  });
}

/* ======================================================
   4) PRODUCTOS (product_fetch / product_upsert)
   ====================================================== */

// productFetch: lo dejamos global porque se reutiliza en Ventas y Compras
async function productFetch(params = {}) {
  const url = buildApiUrl('product_fetch', params);
  const res = await fetch(url, { method: 'GET', mode: 'cors' });
  const data = await parseJsonResponse(res);

  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'No se pudo obtener el producto');
  }

  // Acepta varias formas de respuesta
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.products)) return data.products;
  if (data.product) return [data.product];
  return [];
}

// Rellena formulario de productos
function fillProductoFormFromObject(p) {
  const form = document.getElementById('formProducto');
  if (!form || !p) return;

  form.elements.id_del_articulo.value = p.id_del_articulo || '';
  form.elements.nombre.value = p.nombre || '';
  form.elements.categoria.value = p.categoria || '';
  form.elements.precio_de_venta.value = p.precio_de_venta != null ? p.precio_de_venta : '';
  form.elements.cantidad.value = p.cantidad != null ? p.cantidad : '';
  form.elements.moneda.value = p.moneda || 'GTQ';
  form.elements.status.value = p.status || '';
  form.elements.image_url.value = p.image_url || '';
  form.elements.descripcion.value = p.descripcion || '';
}

// Mostrar JSON en <pre> bonito
function printJsonPre(id, obj) {
  const pre = document.getElementById(id);
  if (!pre) return;
  pre.textContent = JSON.stringify(obj, null, 2);
}

// Submit: guardar producto (product_upsert)
async function onSubmitProducto(ev) {
  ev.preventDefault();
  const form = ev.target;
  const preId = 'respProducto';

  try {
    const fd = new FormData(form);

    const id_del_articulo = (fd.get('id_del_articulo') || '').toString().trim();
    const nombre = (fd.get('nombre') || '').toString().trim();
    if (!id_del_articulo) {
      throw new Error('El campo "Id del artículo" es obligatorio.');
    }
    if (!nombre) {
      throw new Error('El campo "Nombre" es obligatorio.');
    }

    const payload = {
      id_del_articulo,
      nombre,
      categoria: (fd.get('categoria') || '').toString().trim(),
      precio_de_venta: Number(fd.get('precio_de_venta') || 0),
      cantidad: fd.get('cantidad') !== null && fd.get('cantidad') !== ''
        ? Number(fd.get('cantidad'))
        : null,
      moneda: (fd.get('moneda') || 'GTQ').toString().trim() || 'GTQ',
      status: (fd.get('status') || '').toString().trim(),
      image_url: (fd.get('image_url') || '').toString().trim(),
      descripcion: (fd.get('descripcion') || '').toString().trim()
    };

    printJsonPre(preId, { sending: payload });

    const url = buildApiUrl('product_upsert');
    const btn = document.getElementById('btnGuardarProducto');
    if (btn) btn.disabled = true;

    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const data = await parseJsonResponse(res);
    printJsonPre(preId, data);

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'No se pudo guardar el producto');
    }

    alert('Producto guardado correctamente.');
  } catch (err) {
    console.error(err);
    printJsonPre('respProducto', { error: err.message });
    alert('Error guardando producto: ' + err.message);
  } finally {
    const btn = document.getElementById('btnGuardarProducto');
    if (btn) btn.disabled = false;
  }
}

// Botón "Cargar por ID"
async function onClickCargarProducto() {
  const form = document.getElementById('formProducto');
  const preId = 'respProducto';
  if (!form) return;

  const idDelArticulo = form.elements.id_del_articulo.value.trim();
  if (!idDelArticulo) {
    alert('Ingresa un Id del artículo para buscar.');
    return;
  }

  try {
    printJsonPre(preId, { info: 'Buscando producto...' });

    const productos = await productFetch({ id_del_articulo: idDelArticulo });
    if (!productos.length) {
      throw new Error('No se encontró ningún producto con ese Id.');
    }

    const p = productos[0];
    fillProductoFormFromObject(p);
    printJsonPre(preId, { found: p });
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al cargar producto: ' + err.message);
  }
}

/* ======================================================
   5) FOTOS (upload)
   ====================================================== */

async function onSubmitFoto(ev) {
  ev.preventDefault();
  const form = ev.target;
  const preId = 'respFoto';

  try {
    const fd = new FormData(form);
    const idDelArt = (fd.get('id_del_articulo') || '').toString().trim();
    if (!idDelArt) {
      throw new Error('El Id del artículo es obligatorio para subir fotos.');
    }

    const url = buildApiUrl('upload', { id_del_articulo: idDelArt });
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      body: fd
    });

    const data = await parseJsonResponse(res);
    printJsonPre(preId, data);

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'Error subiendo archivo');
    }

    alert('Foto(s) subida(s) correctamente.');
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al subir foto: ' + err.message);
  }
}

/* ======================================================
   6) VENTAS (sale_register + product_fetch reutilizado)
   ====================================================== */

let VENTA_ITEMS = [];
let LAST_SALE_ID = null;

function renderVentaItems() {
  const tbody = document.getElementById('ventaItemsBody');
  const totalBrutoEl = document.getElementById('ventaTotalBruto');
  const totalDescuentoEl = document.getElementById('ventaTotalDescuento');
  const totalNetoEl = document.getElementById('ventaTotalNeto');

  if (!tbody) return;

  if (!VENTA_ITEMS.length) {
    tbody.innerHTML = `
      <tr><td colspan="6" style="text-align:center;opacity:.7;">
        Sin productos en la venta.
      </td></tr>`;
    if (totalBrutoEl) totalBrutoEl.textContent = '0.00';
    if (totalDescuentoEl) totalDescuentoEl.textContent = '0.00';
    if (totalNetoEl) totalNetoEl.textContent = '0.00';
    return;
  }

  tbody.innerHTML = '';
  let totalBruto = 0;
  let totalNeto = 0;

  VENTA_ITEMS.forEach((it, idx) => {
    const tr = document.createElement('tr');

    const subtotalSugerido = it.precio_sugerido * it.cantidad;
    const subtotalNeto = it.precio_unitario * it.cantidad;
    totalBruto += subtotalSugerido;
    totalNeto += subtotalNeto;

    tr.innerHTML = `
      <td>${it.id_del_articulo}</td>
      <td>${it.nombre}</td>
      <td style="text-align:right;">${it.cantidad}</td>
      <td style="text-align:right;">${formatMoneyGTQ(it.precio_unitario)}</td>
      <td style="text-align:right;">${formatMoneyGTQ(subtotalNeto)}</td>
      <td style="text-align:center;">
        <button type="button" data-index="${idx}" class="btn-secondary btnVentaQuitar">
          ×
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const descuento = totalBruto - totalNeto;
  if (totalBrutoEl) totalBrutoEl.textContent = totalBruto.toFixed(2);
  if (totalDescuentoEl) totalDescuentoEl.textContent = descuento.toFixed(2);
  if (totalNetoEl) totalNetoEl.textContent = totalNeto.toFixed(2);
}

function clearVentaProductoForm() {
  const codigo = document.getElementById('ventaCodigo');
  const nombre = document.getElementById('ventaNombre');
  const sugerido = document.getElementById('ventaPrecioSugerido');
  const stock = document.getElementById('ventaStock');
  const cantidad = document.getElementById('ventaCantidad');
  const precioUnit = document.getElementById('ventaPrecioUnitario');

  if (nombre) nombre.value = '';
  if (sugerido) sugerido.value = '';
  if (stock) stock.value = '';
  if (cantidad) cantidad.value = '1';
  if (precioUnit) precioUnit.value = '';
  if (codigo) codigo.focus();
}

async function onClickVentaBuscarProducto() {
  const codigo = document.getElementById('ventaCodigo');
  const preId = 'ventaRespProducto';
  if (!codigo) return;
  const val = codigo.value.trim();
  if (!val) {
    alert('Ingresa un código de artículo para buscar.');
    return;
  }

  try {
    printJsonPre(preId, { info: 'Buscando producto...' });
    const productos = await productFetch({ id_del_articulo: val });

    if (!productos.length) {
      throw new Error('No se encontró producto con ese código.');
    }

    const p = productos[0];

    const nombre = document.getElementById('ventaNombre');
    const sugerido = document.getElementById('ventaPrecioSugerido');
    const stock = document.getElementById('ventaStock');
    const precioUnit = document.getElementById('ventaPrecioUnitario');

    if (nombre) nombre.value = p.nombre || '';
    if (sugerido) sugerido.value = p.precio_de_venta != null ? p.precio_de_venta : '';
    if (stock) stock.value = p.cantidad != null ? p.cantidad : '';
    if (precioUnit) precioUnit.value = p.precio_de_venta != null ? p.precio_de_venta : '';

    printJsonPre(preId, { found: p });
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al buscar producto: ' + err.message);
  }
}

function onVentaCodigoKey(ev) {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    onClickVentaBuscarProducto();
  }
}

function onClickVentaAgregarItem() {
  const codigo = document.getElementById('ventaCodigo');
  const nombre = document.getElementById('ventaNombre');
  const sugerido = document.getElementById('ventaPrecioSugerido');
  const stock = document.getElementById('ventaStock');
  const cantidadEl = document.getElementById('ventaCantidad');
  const precioUnitEl = document.getElementById('ventaPrecioUnitario');

  if (!codigo || !nombre || !cantidadEl || !precioUnitEl) return;

  const id_del_articulo = codigo.value.trim();
  const nombreProd = nombre.value.trim();
  const precioSugerido = Number(sugerido && sugerido.value ? sugerido.value : 0);
  const stockNum = Number(stock && stock.value ? stock.value : 0);
  const cantNum = Number(cantidadEl.value || 0);
  const precioUnit = Number(precioUnitEl.value || 0);

  if (!id_del_articulo) {
    alert('Ingresa un código de artículo.');
    return;
  }
  if (!nombreProd) {
    alert('Primero busca el producto (para cargar nombre y precio).');
    return;
  }
  if (!cantNum || cantNum <= 0) {
    alert('La cantidad debe ser mayor que cero.');
    return;
  }
  if (!precioUnit || precioUnit <= 0) {
    alert('El precio unitario debe ser mayor que cero.');
    return;
  }
  if (stockNum && cantNum > stockNum) {
    if (!confirm('La cantidad supera el stock actual. ¿Continuar de todas formas?')) {
      return;
    }
  }

  VENTA_ITEMS.push({
    id_del_articulo,
    nombre: nombreProd,
    cantidad: cantNum,
    precio_sugerido: precioSugerido,
    precio_unitario: precioUnit
  });

  renderVentaItems();
  clearVentaProductoForm();
}

function onClickVentaItemsBody(ev) {
  const btn = ev.target.closest('.btnVentaQuitar');
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= VENTA_ITEMS.length) return;
  VENTA_ITEMS.splice(idx, 1);
  renderVentaItems();
}

async function onSubmitVenta(ev) {
  ev.preventDefault();
  const form = ev.target;
  const preId = 'respVenta';

  try {
    if (!VENTA_ITEMS.length) {
      throw new Error('Agrega al menos 1 producto a la venta.');
    }

    const fd = new FormData(form);
    const cliente_nombre = (fd.get('cliente_nombre') || '').toString().trim();
    if (!cliente_nombre) throw new Error('El nombre del cliente es obligatorio.');

    const id_cliente = (fd.get('id_cliente') || '').toString().trim();
    const cliente_telefono = (fd.get('cliente_telefono') || '').toString().trim();
    const cliente_email = (fd.get('cliente_email') || '').toString().trim();
    const notas = (fd.get('notas') || '').toString().trim();

    const pago_inicial_monto = Number(fd.get('pago_inicial_monto') || 0);
    const pago_inicial_forma = (fd.get('pago_inicial_forma') || '').toString().trim();
    const plazo_dias = Number(fd.get('plazo_dias') || 0);

    // Totales:
    let totalBruto = 0;
    let totalNeto = 0;
    VENTA_ITEMS.forEach((it) => {
      totalBruto += it.precio_sugerido * it.cantidad;
      totalNeto += it.precio_unitario * it.cantidad;
    });
    const descuento = totalBruto - totalNeto;

    const payload = {
      id_cliente,
      cliente_nombre,
      cliente_telefono,
      cliente_email,
      notas,
      items: VENTA_ITEMS,
      totales: {
        total_bruto: totalBruto,
        total_descuento: descuento,
        total_neto: totalNeto
      },
      pago_inicial: {
        monto: pago_inicial_monto,
        forma: pago_inicial_forma
      },
      plazo_dias
    };

    printJsonPre(preId, { sending: payload });

    const url = buildApiUrl('sale_register');
    const btn = document.getElementById('btnVentaRegistrar');
    if (btn) btn.disabled = true;

    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const data = await parseJsonResponse(res);
    printJsonPre(preId, data);

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'No se pudo registrar la venta');
    }

    LAST_SALE_ID = data.id_venta || data.id || data.sale_id || null;
    if (LAST_SALE_ID) {
      const btnComp = document.getElementById('btnVentaVerComprobante');
      if (btnComp) btnComp.disabled = false;
    }

    VENTA_ITEMS = [];
    renderVentaItems();
    alert('Venta registrada correctamente.');
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al registrar la venta: ' + err.message);
  } finally {
    const btn = document.getElementById('btnVentaRegistrar');
    if (btn) btn.disabled = false;
  }
}

function onClickVentaVerComprobante() {
  if (!LAST_SALE_ID) {
    alert('No hay una venta reciente para generar comprobante.');
    return;
  }
  try {
    const url = buildApiUrl('sale_receipt', { id_venta: LAST_SALE_ID });
    window.open(url, '_blank');
  } catch (err) {
    alert('No se pudo generar el enlace de comprobante: ' + err.message);
  }
}

/* ======================================================
   7) COMPRAS (purchase_register + product_fetch)
   ====================================================== */

let COMPRA_ITEMS = [];

function renderCompraItems() {
  const tbody = document.getElementById('compraItemsBody');
  const totalEl = document.getElementById('compraTotalNeto');
  if (!tbody) return;

  if (!COMPRA_ITEMS.length) {
    tbody.innerHTML = `
      <tr><td colspan="6" style="text-align:center;opacity:.7;">
        Sin productos en la compra.
      </td></tr>`;
    if (totalEl) totalEl.textContent = '0.00';
    return;
  }

  tbody.innerHTML = '';
  let total = 0;

  COMPRA_ITEMS.forEach((it, idx) => {
    const subtotal = it.costo_unitario * it.cantidad;
    total += subtotal;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.id_del_articulo}</td>
      <td>${it.nombre}</td>
      <td style="text-align:right;">${it.cantidad}</td>
      <td style="text-align:right;">${formatMoneyGTQ(it.costo_unitario)}</td>
      <td style="text-align:right;">${formatMoneyGTQ(subtotal)}</td>
      <td style="text-align:center;">
        <button type="button" data-index="${idx}" class="btn-secondary btnCompraQuitar">
          ×
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (totalEl) totalEl.textContent = total.toFixed(2);
}

function clearCompraProductoForm() {
  const codigo = document.getElementById('compraCodigo');
  const nombre = document.getElementById('compraNombre');
  const costo = document.getElementById('compraCostoUnitario');
  const precioSugerido = document.getElementById('compraPrecioSugerido');
  const cantidad = document.getElementById('compraCantidad');

  if (nombre) nombre.value = '';
  if (costo) costo.value = '';
  if (precioSugerido) precioSugerido.value = '';
  if (cantidad) cantidad.value = '1';
  if (codigo) codigo.focus();
}

async function onClickCompraBuscarProducto() {
  const codigo = document.getElementById('compraCodigo');
  const preId = 'compraRespProducto';
  if (!codigo) return;

  const val = codigo.value.trim();
  if (!val) {
    alert('Ingresa un código de artículo para buscar.');
    return;
  }

  try {
    printJsonPre(preId, { info: 'Buscando producto...' });
    const productos = await productFetch({ id_del_articulo: val });
    if (!productos.length) {
      throw new Error('No se encontró producto con ese código.');
    }

    const p = productos[0];
    const nombre = document.getElementById('compraNombre');
    const costo = document.getElementById('compraCostoUnitario');
    const precioSugerido = document.getElementById('compraPrecioSugerido');

    if (nombre) nombre.value = p.nombre || '';
    if (costo) costo.value = p.costo_unitario != null ? p.costo_unitario : '';
    if (precioSugerido) precioSugerido.value = p.precio_de_venta != null ? p.precio_de_venta : '';

    printJsonPre(preId, { found: p });
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al buscar producto: ' + err.message);
  }
}

function onClickCompraAgregarItem() {
  const codigo = document.getElementById('compraCodigo');
  const nombre = document.getElementById('compraNombre');
  const costo = document.getElementById('compraCostoUnitario');
  const precioSugerido = document.getElementById('compraPrecioSugerido');
  const cantidadEl = document.getElementById('compraCantidad');

  if (!codigo || !nombre || !costo || !cantidadEl) return;

  const id_del_articulo = codigo.value.trim();
  const nombreProd = nombre.value.trim();
  const costoUnitario = Number(costo.value || 0);
  const cantNum = Number(cantidadEl.value || 0);
  const precioVentaSugerido = Number(precioSugerido && precioSugerido.value ? precioSugerido.value : 0);

  if (!id_del_articulo) {
    alert('Ingresa un código de artículo.');
    return;
  }
  if (!nombreProd) {
    alert('Primero busca el producto (para cargar nombre, costo, etc.).');
    return;
  }
  if (!cantNum || cantNum <= 0) {
    alert('La cantidad debe ser mayor que cero.');
    return;
  }
  if (!costoUnitario || costoUnitario <= 0) {
    alert('El costo unitario debe ser mayor que cero.');
    return;
  }

  COMPRA_ITEMS.push({
    id_del_articulo,
    nombre: nombreProd,
    cantidad: cantNum,
    costo_unitario: costoUnitario,
    precio_venta_sugerido: precioVentaSugerido
  });

  renderCompraItems();
  clearCompraProductoForm();
}

function onClickCompraItemsBody(ev) {
  const btn = ev.target.closest('.btnCompraQuitar');
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= COMPRA_ITEMS.length) return;
  COMPRA_ITEMS.splice(idx, 1);
  renderCompraItems();
}

async function onSubmitCompra(ev) {
  ev.preventDefault();
  const form = ev.target;
  const preId = 'respCompra';

  try {
    if (!COMPRA_ITEMS.length) {
      throw new Error('Agrega al menos 1 producto a la compra.');
    }

    const fd = new FormData(form);
    const proveedor_nombre = (fd.get('proveedor_nombre') || '').toString().trim();
    if (!proveedor_nombre) throw new Error('El nombre del proveedor es obligatorio.');

    const payload = {
      id_proveedor: (fd.get('id_proveedor') || '').toString().trim(),
      proveedor_nombre,
      proveedor_telefono: (fd.get('proveedor_telefono') || '').toString().trim(),
      proveedor_email: (fd.get('proveedor_email') || '').toString().trim(),
      tipo_documento: (fd.get('tipo_documento') || '').toString().trim(),
      numero_documento: (fd.get('numero_documento') || '').toString().trim(),
      items: COMPRA_ITEMS,
      notas: (fd.get('notas') || '').toString().trim()
    };

    printJsonPre(preId, { sending: payload });

    const url = buildApiUrl('purchase_register');
    const btn = document.getElementById('btnCompraRegistrar');
    if (btn) btn.disabled = true;

    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const data = await parseJsonResponse(res);
    printJsonPre(preId, data);

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'No se pudo registrar la compra');
    }

    COMPRA_ITEMS = [];
    renderCompraItems();
    alert('Compra registrada correctamente.');
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al registrar la compra: ' + err.message);
  } finally {
    const btn = document.getElementById('btnCompraRegistrar');
    if (btn) btn.disabled = false;
  }
}

/* ======================================================
   8) MOVIMIENTOS & RECIBO (movement_register / movement_receipt)
   ====================================================== */

async function onSubmitMovimiento(ev) {
  ev.preventDefault();
  const form = ev.target;
  const preId = 'respMovimiento';

  try {
    const fd = new FormData(form);

    const operacion = (fd.get('operacion') || '').toString().trim();
    const id_del_articulo = (fd.get('id_del_articulo') || '').toString().trim();
    const cantidad = Number(fd.get('cantidad') || 0);
    if (!operacion) throw new Error('La operación es obligatoria.');
    if (!id_del_articulo) throw new Error('El Id del artículo es obligatorio.');
    if (!cantidad || cantidad <= 0) throw new Error('La cantidad debe ser mayor que cero.');

    const payload = {
      operacion,
      id_del_articulo,
      cantidad,
      precio_unitario: fd.get('precio_unitario') !== null && fd.get('precio_unitario') !== ''
        ? Number(fd.get('precio_unitario'))
        : null,
      costo_unitario: fd.get('costo_unitario') !== null && fd.get('costo_unitario') !== ''
        ? Number(fd.get('costo_unitario'))
        : null,
      motivo: (fd.get('motivo') || '').toString().trim(),
      usuario: (fd.get('usuario') || '').toString().trim(),
      observaciones: (fd.get('observaciones') || '').toString().trim()
    };

    printJsonPre(preId, { sending: payload });

    const url = buildApiUrl('movement_register');
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const data = await parseJsonResponse(res);
    printJsonPre(preId, data);

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'No se pudo registrar el movimiento');
    }

    alert('Movimiento registrado correctamente. ID: ' + (data.id_movimiento || 'N/D'));
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al registrar el movimiento: ' + err.message);
  }
}

async function onSubmitRecibo(ev) {
  ev.preventDefault();
  const form = ev.target;
  const preId = 'respRecibo';

  try {
    const fd = new FormData(form);
    const id_movimiento = (fd.get('id_movimiento') || '').toString().trim();
    if (!id_movimiento) {
      throw new Error('El ID de movimiento es obligatorio.');
    }

    const url = buildApiUrl('movement_receipt', { id_movimiento });
    printJsonPre(preId, { open: url });

    window.open(url, '_blank');
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al generar recibo: ' + err.message);
  }
}

/* ======================================================
   9) DASHBOARD & REPORTES (mínimo, fácilmente ajustable)
   ====================================================== */

// Dashboard simple (puedes adaptar el path a tu backend)
async function loadDashboard() {
  const kpiHoy = document.getElementById('kpiHoy');
  const kpiMes = document.getElementById('kpiMes');
  const kpiStockBajo = document.getElementById('kpiStockBajo');
  const kpiInventario = document.getElementById('kpiInventario');
  const lastSalesBody = document.getElementById('dashLastSalesBody');

  if (!kpiHoy || !lastSalesBody) return;

  try {
    const url = buildApiUrl('dashboard');
    const res = await fetch(url, { method: 'GET', mode: 'cors' });
    const data = await parseJsonResponse(res);
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'Error en dashboard');
    }

    const kpi = data.kpi || {};
    if (kpiHoy) kpiHoy.textContent = formatMoneyGTQ(kpi.ventas_hoy || 0);
    if (kpiMes) kpiMes.textContent = formatMoneyGTQ(kpi.ventas_mes || 0);
    if (kpiStockBajo) kpiStockBajo.textContent = kpi.stock_bajo || '—';
    if (kpiInventario) kpiInventario.textContent = kpi.inventario_total || '—';

    const ultimas = data.ultimas_ventas || [];
    lastSalesBody.innerHTML = '';
    if (!ultimas.length) {
      lastSalesBody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;opacity:.7;">Sin ventas recientes.</td></tr>';
    } else {
      ultimas.forEach((v) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${v.hora || ''}</td>
          <td>${v.cliente || ''}</td>
          <td>${v.tipo || ''}</td>
          <td style="text-align:right;">${formatMoneyGTQ(v.total_neto || 0)}</td>
        `;
        lastSalesBody.appendChild(tr);
      });
    }

    if (window.Chart && data.ventas_7d) {
      const ctx = document.getElementById('chart-ventas-7d');
      if (ctx) {
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: data.ventas_7d.labels || [],
            datasets: [
              {
                label: 'Ventas (Q)',
                data: data.ventas_7d.values || []
              }
            ]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn('Dashboard no cargado:', err.message);
  }
}

/* === Reporte: Resumen de ventas del día ================= */

async function onSubmitResumenVentas(ev) {
  ev.preventDefault();
  const form = ev.target;
  const preId = 'respResumenVentas';

  try {
    const fd = new FormData(form);
    const fecha = (fd.get('fecha') || '').toString().trim();

    const url = buildApiUrl('sales_summary_day', fecha ? { fecha } : {});
    const res = await fetch(url, { method: 'GET', mode: 'cors' });
    const data = await parseJsonResponse(res);
    printJsonPre(preId, data);

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'No se pudo obtener el resumen');
    }

    const totales = data.totales || {};
    const totalesDiaDiv = document.getElementById('totales-dia');
    if (totalesDiaDiv) {
      totalesDiaDiv.innerHTML = `
        <p>Ventas contado: <strong>${formatMoneyGTQ(totales.contado || 0)}</strong></p>
        <p>Ventas crédito: <strong>${formatMoneyGTQ(totales.credito || 0)}</strong></p>
        <p>Total neto: <strong>${formatMoneyGTQ(totales.total_neto || 0)}</strong></p>
      `;
    }

    // Tabla detalle
    const tbody = document.getElementById('detalle-ventas-body');
    if (tbody) {
      const lst = data.ventas || [];
      tbody.innerHTML = '';
      if (!lst.length) {
        tbody.innerHTML =
          '<tr><td colspan="6" style="text-align:center;opacity:.7;">Sin ventas.</td></tr>';
      } else {
        lst.forEach((v) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${v.hora || ''}</td>
            <td>${v.cliente || ''}</td>
            <td>${v.tipo || ''}</td>
            <td style="text-align:right;">${formatMoneyGTQ(v.total_neto || 0)}</td>
            <td style="text-align:right;">${formatMoneyGTQ(v.pagado || 0)}</td>
            <td style="text-align:right;">${formatMoneyGTQ(v.saldo || 0)}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }

    // Gráficas
    if (window.Chart && data.charts) {
      const chVentas = document.getElementById('chart-ventas');
      const chMargen = document.getElementById('chart-margen');

      if (chVentas && data.charts.ventas) {
        new Chart(chVentas, {
          type: 'doughnut',
          data: {
            labels: ['Contado', 'Crédito'],
            datasets: [
              {
                data: [
                  data.charts.ventas.contado || 0,
                  data.charts.ventas.credito || 0
                ]
              }
            ]
          },
          options: { responsive: true }
        });
      }

      if (chMargen && data.charts.margen) {
        new Chart(chMargen, {
          type: 'doughnut',
          data: {
            labels: ['Costo', 'Ganancia estimada'],
            datasets: [
              {
                data: [
                  data.charts.margen.costo || 0,
                  data.charts.margen.ganancia || 0
                ]
              }
            ]
          },
          options: { responsive: true }
        });
      }
    }
  } catch (err) {
    console.error(err);
    printJsonPre(preId, { error: err.message });
    alert('Error al obtener resumen de ventas: ' + err.message);
  }
}

/* ======================================================
   10) INICIALIZACIÓN GLOBAL
   ====================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Config API
  hydrateApiConfig();
  const btnSaveApi = document.getElementById('saveApi');
  if (btnSaveApi) {
    btnSaveApi.addEventListener('click', onClickSaveApi);
  }

  // Tabs
  setupTabs();

  // Productos
  const formProducto = document.getElementById('formProducto');
  if (formProducto) {
    formProducto.addEventListener('submit', onSubmitProducto);
    const btnCargar = document.getElementById('cargarProducto');
    if (btnCargar) {
      btnCargar.addEventListener('click', onClickCargarProducto);
    }
  }

  // Fotos
  const formFoto = document.getElementById('formFoto');
  if (formFoto) {
    formFoto.addEventListener('submit', onSubmitFoto);
  }

  // Ventas
  const formVenta = document.getElementById('formVenta');
  if (formVenta) {
    formVenta.addEventListener('submit', onSubmitVenta);
    const btnBuscarProd = document.getElementById('btnVentaBuscarProducto');
    const btnAgregarItem = document.getElementById('btnVentaAgregarItem');
    const btnVerComp = document.getElementById('btnVentaVerComprobante');
    const codigo = document.getElementById('ventaCodigo');
    const tbody = document.getElementById('ventaItemsBody');

    if (btnBuscarProd) btnBuscarProd.addEventListener('click', onClickVentaBuscarProducto);
    if (btnAgregarItem) btnAgregarItem.addEventListener('click', onClickVentaAgregarItem);
    if (btnVerComp) btnVerComp.addEventListener('click', onClickVentaVerComprobante);
    if (codigo) codigo.addEventListener('keydown', onVentaCodigoKey);
    if (tbody) tbody.addEventListener('click', onClickVentaItemsBody);
  }

  // Compras
  const formCompra = document.getElementById('formCompra');
  if (formCompra) {
    formCompra.addEventListener('submit', onSubmitCompra);
    const btnBuscarProdC = document.getElementById('btnCompraBuscarProducto');
    const btnAgregarItemC = document.getElementById('btnCompraAgregarItem');
    const tbodyC = document.getElementById('compraItemsBody');

    if (btnBuscarProdC) btnBuscarProdC.addEventListener('click', onClickCompraBuscarProducto);
    if (btnAgregarItemC) btnAgregarItemC.addEventListener('click', onClickCompraAgregarItem);
    if (tbodyC) tbodyC.addEventListener('click', onClickCompraItemsBody);
  }

  // Movimientos
  const formMovimiento = document.getElementById('formMovimiento');
  if (formMovimiento) {
    formMovimiento.addEventListener('submit', onSubmitMovimiento);
  }

  const formRecibo = document.getElementById('formRecibo');
  if (formRecibo) {
    formRecibo.addEventListener('submit', onSubmitRecibo);
  }

  // Reporte: Resumen de ventas del día
  const formResumenVentas = document.getElementById('formResumenVentas');
  if (formResumenVentas) {
    formResumenVentas.addEventListener('submit', onSubmitResumenVentas);
  }

  // Cargar dashboard al inicio (si la API está lista; si no, solo fallará en silencio)
  loadDashboard().catch((e) => console.warn('Dashboard no inicializado:', e.message));
});
