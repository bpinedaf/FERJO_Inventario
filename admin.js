// admin.js - Panel de administración FERJO
// ----------------------------------------
// - Comparte la misma base de API que el catálogo (FERJO_API_BASE / config.js).
// - NO modifica nada del catálogo.
// - Maneja configuración básica + CRUD de productos en el admin.
// ----------------------------------------

'use strict';

/* ======================================================
   1) HELPERS GENERALES: API BASE, STATUS, UTILIDADES
   ====================================================== */

// Usa la MISMA lógica que el catálogo para obtener la base
function apiBase() {
  const saved = localStorage.getItem('FERJO_API_BASE') || (window.CONFIG && window.CONFIG.API) || '';
  return (saved || '').replace(/\/+$/, ''); // sin slash final redundante
}

// Guardar FERJO_API_BASE manualmente desde el admin
function setApiBase(baseUrl) {
  const clean = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!clean) {
    localStorage.removeItem('FERJO_API_BASE');
  } else {
    localStorage.setItem('FERJO_API_BASE', clean);
  }
  return clean;
}

// Construir URL de API con path=...
function buildApiUrl(path, extraParams = {}) {
  const BASE = apiBase();
  if (!BASE) {
    throw new Error(
      'No hay API configurada. Define window.CONFIG.API en config.js o guarda FERJO_API_BASE en localStorage.'
    );
  }

  const params = new URLSearchParams({
    path,
    t: Date.now().toString(), // anti-cache
    ...extraParams
  });

  const join = BASE.includes('?') ? '&' : '?';
  return `${BASE}${join}${params.toString()}`;
}

// Mostrar mensajes en un recuadro de estado (si existe)
function showStatus(msg, type = 'info') {
  const box = document.getElementById('statusBox'); // <div id="statusBox">
  if (!box) {
    console[type === 'error' ? 'error' : 'log'](msg);
    return;
  }
  box.textContent = msg;
  box.className = ''; // limpia clases previas
  box.classList.add('status', `status-${type}`); // CSS: .status-info, .status-error, etc.
}

// Utilidad para formatear moneda (igual que el catálogo)
function formatPrice(n, currency = 'GTQ') {
  try {
    return new Intl.NumberFormat('es-GT', { style: 'currency', currency }).format(n || 0);
  } catch {
    return `Q ${Number(n || 0).toFixed(2)}`;
  }
}

/* ======================================================
   2) CONFIGURACIÓN BÁSICA DEL ADMIN
   ====================================================== */

// Cargar valor inicial de la API base en el formulario de config
function hydrateConfigForm() {
  const inputBase = document.getElementById('apiBaseInput'); // TODO: asegúrate de que exista en el HTML
  if (!inputBase) return;

  inputBase.value = apiBase() || '';
}

// Guardar configuración de API desde el formulario
async function onSubmitConfig(ev) {
  ev.preventDefault();
  const form = ev.target;
  const inputBase = form.querySelector('#apiBaseInput'); // mismo ID que arriba
  if (!inputBase) return;

  try {
    const clean = setApiBase(inputBase.value);
    if (!clean) {
      showStatus('Se limpió la configuración de API. Debes establecer una URL válida.', 'error');
      return;
    }

    showStatus('Guardando configuración y probando conexión...', 'info');

    // Test simple al endpoint "ping" (ajustable)
    const url = buildApiUrl('ping');
    const res = await fetch(url, { method: 'GET', mode: 'cors' });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text());

    if (!res.ok || data.ok === false) {
      const msg = data.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    showStatus('API configurada correctamente y conexión verificada.', 'success');
  } catch (err) {
    console.error(err);
    showStatus('Error de conexión: ' + err.message, 'error');
  }
}

/* ======================================================
   3) PRODUCTOS: FETCH + RENDER + GUARDAR
   ====================================================== */

// Estado en memoria
let ADMIN_PRODUCTS = []; // lista completa de productos
let CURRENT_EDIT_INDEX = null; // índice del producto que estamos editando, o null para nuevo

// Lee productos desde el backend (admin)
async function productFetch(options = {}) {
  const url = buildApiUrl('products', options);

  const res = await fetch(url, { method: 'GET', mode: 'cors' });
  if (!res.ok) {
    throw new Error(`No se pudo cargar la lista de productos (HTTP ${res.status})`);
  }

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text());

  // El backend puede responder { ok:true, products:[...] } o directamente [...]
  const products = data.products || data || [];
  return products;
}

// Renderiza productos en una tabla del admin
function renderProductsTable(products) {
  const tbody = document.getElementById('productsTbody'); // TODO: en tu HTML, <tbody id="productsTbody">
  if (!tbody) return;

  if (!Array.isArray(products) || !products.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;opacity:.7;">No hay productos para mostrar.</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = '';
  products.forEach((p, idx) => {
    const tr = document.createElement('tr');

    const sku = p.id_del_articulo || p.upc_ean_isbn || '';
    const nombre = p.nombre || '';
    const categoria = (p.categoria || '').trim();
    const cantidad = Number(p.cantidad || 0);
    const status = String(p.status || '').toLowerCase() || 'activo';
    const precioNum = Number(p.precio_de_venta || 0);

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${sku || '-'}</td>
      <td>${nombre || '(Sin nombre)'}</td>
      <td>${categoria || '-'}</td>
      <td style="text-align:right;">${cantidad}</td>
      <td>${status}</td>
      <td style="text-align:right;">${formatPrice(precioNum, p.moneda)}</td>
      <td style="text-align:center;">
        <button type="button"
                class="btn btn-sm btn-edit-product"
                data-index="${idx}">
          Editar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Cargar productos y refrescar tabla
async function reloadProducts() {
  try {
    showStatus('Cargando productos...', 'info');
    const products = await productFetch(); // aquí podrías pasar filtros si los usas
    ADMIN_PRODUCTS = products;
    renderProductsTable(products);
    showStatus(`Se cargaron ${products.length} productos.`, 'success');
  } catch (err) {
    console.error(err);
    showStatus('Error cargando productos: ' + err.message, 'error');
  }
}

// Llenar el formulario con los datos de un producto (para editar)
function fillProductFormFromData(product, index) {
  CURRENT_EDIT_INDEX = typeof index === 'number' ? index : null;

  // TODO: Ajusta estos IDs a los que tengas en tu HTML del admin
  const form = document.getElementById('productForm');
  if (!form) return;

  form.querySelector('#pf_id_del_articulo') &&
    (form.querySelector('#pf_id_del_articulo').value = product.id_del_articulo || '');
  form.querySelector('#pf_upc_ean_isbn') &&
    (form.querySelector('#pf_upc_ean_isbn').value = product.upc_ean_isbn || '');
  form.querySelector('#pf_nombre') && (form.querySelector('#pf_nombre').value = product.nombre || '');
  form.querySelector('#pf_precio_de_venta') &&
    (form.querySelector('#pf_precio_de_venta').value = product.precio_de_venta || '');
  form.querySelector('#pf_moneda') && (form.querySelector('#pf_moneda').value = product.moneda || 'GTQ');
  form.querySelector('#pf_cantidad') &&
    (form.querySelector('#pf_cantidad').value = product.cantidad != null ? product.cantidad : '');
  form.querySelector('#pf_categoria') &&
    (form.querySelector('#pf_categoria').value = product.categoria || '');
  form.querySelector('#pf_status') &&
    (form.querySelector('#pf_status').value = product.status || 'activo');

  form.querySelector('#pf_image_url') &&
    (form.querySelector('#pf_image_url').value = product.image_url || '');
  form.querySelector('#pf_image_url_2') &&
    (form.querySelector('#pf_image_url_2').value = product.image_url_2 || '');
  form.querySelector('#pf_image_url_3') &&
    (form.querySelector('#pf_image_url_3').value = product.image_url_3 || '');

  // Opcional: hacer foco en el nombre al editar
  const nombreEl = form.querySelector('#pf_nombre');
  if (nombreEl) nombreEl.focus();
}

// Limpiar formulario para crear un producto nuevo
function resetProductForm() {
  const form = document.getElementById('productForm');
  if (!form) return;
  form.reset();
  CURRENT_EDIT_INDEX = null;
}

// Construye el payload a enviar al backend según el formulario
function buildProductPayloadFromForm() {
  const form = document.getElementById('productForm');
  if (!form) throw new Error('No se encontró el formulario de producto.');

  function val(id) {
    const el = form.querySelector(id);
    return el ? el.value.trim() : '';
  }

  const id_del_articulo = val('#pf_id_del_articulo');
  const upc_ean_isbn = val('#pf_upc_ean_isbn');
  const nombre = val('#pf_nombre');
  const precioStr = val('#pf_precio_de_venta').replace(',', '.');
  const moneda = val('#pf_moneda') || 'GTQ';
  const cantidadStr = val('#pf_cantidad');
  const categoria = val('#pf_categoria');
  const status = val('#pf_status') || 'activo';

  const image_url = val('#pf_image_url');
  const image_url_2 = val('#pf_image_url_2');
  const image_url_3 = val('#pf_image_url_3');

  const precio_de_venta = Number(precioStr) || 0;
  const cantidad = cantidadStr ? Number(cantidadStr) : 0;

  if (!id_del_articulo && !upc_ean_isbn) {
    throw new Error('Debes indicar al menos un identificador (ID del artículo o UPC/EAN/ISBN).');
  }

  if (!nombre) {
    throw new Error('El nombre del producto es obligatorio.');
  }

  const payload = {
    id_del_articulo,
    upc_ean_isbn,
    nombre,
    precio_de_venta,
    moneda,
    cantidad,
    categoria,
    status,
    image_url,
    image_url_2,
    image_url_3
  };

  return payload;
}

// Guarda o actualiza un producto en el backend
async function saveProduct(payload) {
  if (!payload || (!payload.id_del_articulo && !payload.upc_ean_isbn)) {
    throw new Error('Falta el identificador del producto (id_del_articulo o upc_ean_isbn).');
  }

  const url = buildApiUrl('product_update'); // <-- ajusta "product_update" si tu backend usa otro path

  const res = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8' // Apps Script suele leerlo bien así
    },
    body: JSON.stringify(payload)
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text());

  if (!res.ok || data.ok === false) {
    const msg = data.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  // Si el backend devuelve el producto normalizado, lo regresamos; si no, regresamos el payload
  return data.product || payload;
}

/* ======================================================
   4) MANEJADORES DE EVENTOS DEL ADMIN
   ====================================================== */

async function onSubmitProduct(ev) {
  ev.preventDefault();

  try {
    const payload = buildProductPayloadFromForm();

    const form = ev.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    showStatus('Guardando producto...', 'info');

    const updated = await saveProduct(payload);

    showStatus('Producto guardado correctamente.', 'success');

    // Actualizar la lista local si estamos editando
    if (CURRENT_EDIT_INDEX != null && ADMIN_PRODUCTS[CURRENT_EDIT_INDEX]) {
      ADMIN_PRODUCTS[CURRENT_EDIT_INDEX] = {
        ...ADMIN_PRODUCTS[CURRENT_EDIT_INDEX],
        ...updated
      };
    }

    // Refrescar tabla (o podrías hacer una actualización puntual si prefieres)
    await reloadProducts();

    // Dejar el formulario listo para otro producto nuevo
    resetProductForm();
  } catch (err) {
    console.error(err);
    showStatus('Error guardando producto: ' + err.message, 'error');
  } finally {
    const form = ev.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = false;
  }
}

// Click en "Editar" dentro de la tabla de productos
function onClickProductsTable(ev) {
  const btn = ev.target.closest('.btn-edit-product');
  if (!btn) return;

  const idx = Number(btn.dataset.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= ADMIN_PRODUCTS.length) return;

  const product = ADMIN_PRODUCTS[idx];
  fillProductFormFromData(product, idx);
  showStatus(`Editando producto: ${product.nombre || '(Sin nombre)'}`, 'info');
}

// Click en "Nuevo producto"
function onClickNewProduct() {
  resetProductForm();
  showStatus('Creando producto nuevo.', 'info');
}

/* ======================================================
   5) INICIALIZACIÓN GLOBAL
   ====================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 1) Configuración API
  hydrateConfigForm();

  const configForm = document.getElementById('configForm'); // TODO: <form id="configForm">
  if (configForm) {
    configForm.addEventListener('submit', onSubmitConfig);
  }

  // 2) Productos
  const productForm = document.getElementById('productForm'); // TODO: <form id="productForm">
  if (productForm) {
    productForm.addEventListener('submit', onSubmitProduct);
  }

  const btnReloadProducts = document.getElementById('btnReloadProducts'); // TODO: botón para recargar
  if (btnReloadProducts) {
    btnReloadProducts.addEventListener('click', reloadProducts);
  }

  const btnNewProduct = document.getElementById('btnNewProduct'); // TODO: botón para limpiar formulario
  if (btnNewProduct) {
    btnNewProduct.addEventListener('click', onClickNewProduct);
  }

  const productsTbody = document.getElementById('productsTbody');
  if (productsTbody) {
    productsTbody.addEventListener('click', onClickProductsTable);
  }

  // 3) Cargar listado de productos apenas entra al admin
  reloadProducts().catch(err => {
    console.error(err);
    showStatus('Error al inicializar productos: ' + err.message, 'error');
  });
});
