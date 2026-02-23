// =====================
// admin.js (completo)
// =====================

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.tab).classList.add('active');
  });
});

// ---------- API URL handling ----------
const apiInput  = document.getElementById('apiUrl');
const apiStatus = document.getElementById('apiStatus');
const saved     = localStorage.getItem('FERJO_API_BASE') || (window.CONFIG && window.CONFIG.API) || '';
apiInput.value  = saved || '';
function apiBase(){ return (apiInput.value || '').replace(/\/+$/,''); }

document.getElementById('saveApi').addEventListener('click', ()=>{
  localStorage.setItem('FERJO_API_BASE', apiInput.value.trim());
  apiStatus.textContent = 'Guardado';
  setTimeout(()=> apiStatus.textContent='', 1500);
});

// ---------- Helpers visuales ----------
function showResp(el, data){
  try { el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2); }
  catch { el.textContent = String(data); }
}

function appendResp(el, data){
  const prev  = el.textContent || '';
  const block = (typeof data === 'string') ? data : JSON.stringify(data, null, 2);
  el.textContent = (prev ? prev + "\n\n" : "") + block;
}

async function fetchJSON(url, opts={}){
  try{
    const res = await fetch(url, opts);
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return { raw: txt, status: res.status, ok: res.ok }; }
  }catch(err){
    return { error: String(err), url, opts: { method: opts.method } };
  }
}

// =========================
// Helpers de formato numérico
// =========================
const nfEnteroGT = new Intl.NumberFormat("es-GT", {
  maximumFractionDigits: 0
});

const nfDecimalGT = new Intl.NumberFormat("es-GT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// Q 1,234.56
function formatQ(value) {
  const num = Number(value) || 0;
  return "Q " + nfDecimalGT.format(num);
}

// Solo número con separador de miles: 1,234
function formatEntero(value) {
  const num = Number(value) || 0;
  return nfEnteroGT.format(num);
}

// ---------- Helpers de Autenticación ----------
function getToken(){
  return (window.AUTH && AUTH.token) || sessionStorage.getItem('FERJO_ID_TOKEN') || '';
}

// Construye URL incluyendo path y token en query (especial para multipart)
function apiUrlAuth(path, extraParams = {}){
  const base = apiBase();
  const sep  = base.includes('?') ? '&' : '?';

  const params = { path, ...extraParams };
  if (!params.token) params.token = getToken(); // fallback

  const qs = new URLSearchParams(params).toString();
  return base + sep + qs;
}


// POST urlencoded + token (usa auth.js si está disponible)
async function getWithToken(path, params={}){
  const t = (window.ensureFreshToken_ ? await window.ensureFreshToken_() : getToken());
  return await fetchJSON(apiUrlAuth(path, { ...params, token: t }));
}

async function postWithToken(path, payload={}){
  const t = (window.ensureFreshToken_ ? await window.ensureFreshToken_() : getToken());

  // urlencoded + token (simple request)
  const body = new URLSearchParams({ ...payload, token: t });
  const url  = apiBase() + (apiBase().includes('?') ? '&' : '?') + 'path=' + encodeURIComponent(path);

  const res = await fetch(url, { method:'POST', body });
  try{ return await res.json(); }catch{ return { ok:false, status:res.status, raw: await res.text() }; }
}


// Helper para POST JSON (ventas) SIN disparar preflight
async function postJSONWithToken(path, payload = {}) {
  const t = (window.ensureFreshToken_ ? await window.ensureFreshToken_() : getToken());
  const url = apiUrlAuth(path, { token: t });

  const res = await fetch(url, { method:'POST', body: JSON.stringify(payload) });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { ok:false, raw:txt, status:res.status }; }
}


// Helper SOLO para CIERRE (forzar request simple + capturar raw)
async function postCashCloseWithToken(payload = {}) {
  const url  = apiUrlAuth('cash_close_register');
  const body = JSON.stringify(payload);

  try {
    // IMPORTANTE: no-cors => respuesta "opaque" (no se puede leer),
    // pero el POST sí se envía.
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body
    });

    // No sabemos si el server devolvió ok, así que verificamos aparte con otro endpoint.
    return { ok: true, opaque: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}



// ===================================================
//               PRODUCTOS: upsert / fetch
// ===================================================
document.getElementById('formProducto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respProducto');
  respEl.textContent = '';

  const fd = new FormData(e.target);

  const id_del_articulo = (fd.get('id_del_articulo') || '').toString().trim();
  const nombre          = (fd.get('nombre') || '').toString().trim();

  if (!id_del_articulo) {
    alert('El campo "Id del artículo" es obligatorio.');
    return;
  }
  if (!nombre) {
    alert('El campo "Nombre" es obligatorio.');
    return;
  }

  // Construimos payload tipando numéricos
  const payload = {
    id_del_articulo,
    nombre,
    categoria:   (fd.get('categoria')   || '').toString().trim(),
    moneda:      ((fd.get('moneda')     || 'GTQ').toString().trim()) || 'GTQ',
    status:      (fd.get('status')      || '').toString().trim(),
    image_url:   (fd.get('image_url')   || '').toString().trim(),
    descripcion: (fd.get('descripcion') || '').toString().trim()
  };

  const precioStr = fd.get('precio_de_venta');
  if (precioStr !== null && precioStr !== '') {
    payload.precio_de_venta = Number(precioStr);
  }

  const cantStr = fd.get('cantidad');
  if (cantStr !== null && cantStr !== '') {
    payload.cantidad = Number(cantStr);
  }

  appendResp(respEl, { debug:'POST product_upsert', payload });

  const out = await postWithToken('product_upsert', payload);
  showResp(respEl, out);
});

document.getElementById('cargarProducto').addEventListener('click', async ()=>{
  const respEl = document.getElementById('respProducto');
  respEl.textContent = '';

  const form = document.getElementById('formProducto');
  const id   = form.querySelector('[name="id_del_articulo"]').value.trim();

  if(!id){
    alert('Ingresa un id_del_articulo');
    return;
  }

  appendResp(respEl, { debug:'GET product_fetch', id_del_articulo: id });

  // Mandamos ambos parámetros para ser compatibles:
  const data = await getWithToken('product_fetch', {
    id_del_articulo: id,
    id: id
  });

  showResp(respEl, data);

  // Acepta { product: {...} } o { products: [...] }
  let p = null;
  if (data) {
    if (data.product) p = data.product;
    else if (Array.isArray(data.products) && data.products.length) {
      p = data.products[0];
    }
  }
  if (!p) return;

  // Rellenar los campos del formulario con el producto
  for (const k in p) {
    const el = form.querySelector(`[name="${k}"]`);
    if (!el) continue;
    el.value = (p[k] ?? '').toString();
  }
});

// ===================================================
//  FOTOS: upload + autoasignación (UI silenciosa con loading)
// ===================================================
document.getElementById('formFoto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respFoto');
  const form   = e.target;
  const btn    = form.querySelector('button[type="submit"]');
  const id     = form.querySelector('[name="id_del_articulo"]').value.trim();
  const files  = Array.from(form.querySelector('[name="file"]').files || []);

  respEl.textContent = '';
  if (!id)           { alert('Ingresa un id_del_articulo'); return; }
  if (!files.length) { alert('Selecciona al menos un archivo'); return; }

  // ---- Loading ON ----
  const originalBtnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Subiendo…';
  const loader = document.createElement('span');
  loader.className = 'spinner';
  loader.style.marginLeft = '8px';
  btn.appendChild(loader);
  // Indicador de estado
  const statusLine = document.createElement('div');
  statusLine.style.margin = '8px 0';
  statusLine.textContent = `⏳ Subiendo ${files.length} archivo(s)…`;
  respEl.replaceChildren(statusLine);

  // Modo silencioso (detalle solo si FERJO_DEBUG=1)
  const DEBUG_UI = (localStorage.getItem('FERJO_DEBUG')==='1');
  const dbg = []; const log = (obj)=> dbg.push(obj);

  const uploadUrl = apiUrlAuth('upload');
  const toBase64 = (f)=> new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload  = ()=> resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = ()=> reject(new Error('FileReader error'));
    fr.readAsDataURL(f);
  });

  let successCount = 0;
  let assignedFields = [];

  try {
    // 1) Intento: multipart
    try{
      log({ debug: 'Intento #1: multipart único', files: files.map(f=>f.name) });

      const fd = new FormData();
      fd.append('id_del_articulo', id);
      files.forEach(f => fd.append('file', f, f.name));

      const res = await fetch(uploadUrl, { method:'POST', body: fd });
      const txt = await res.text();
      let up; try { up = JSON.parse(txt); } catch { up = { raw: txt, status: res.status }; }
      log({ debug:'upload response (multipart)', up });

      if ((up && up.ok) || (up && Array.isArray(up.results))) {
        if (Array.isArray(up.results)){
          successCount = up.results.filter(r => r && r.ok).length;
          assignedFields = up.results.map(r => r?.assigned?.field).filter(Boolean);
        } else {
          successCount = 1;
          if (up.assigned?.field) assignedFields = [up.assigned.field];
        }
      } else {
        log({ warn: 'Multipart no marcó ok, vamos a fallback…' });
      }
    }catch(err){
      log({ warn: 'Fallo multipart, vamos a fallback…', error: String(err) });
    }

    // 2) Fallback: urlencoded + token en body
    if (successCount === 0){
      log({ debug: 'Intento #2: fallback urlencoded + base64' });
      const urlForFallback = apiBase() + (apiBase().includes('?') ? '&' : '?') + 'path=upload';
      for (let i=0; i<files.length; i++){
        statusLine.textContent = `⏳ Subiendo ${i+1}/${files.length}…`;
        const file = files[i];

        try{
          const base64 = await toBase64(file);
          const body = new URLSearchParams({
            id_del_articulo: id,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64: base64,
            token: getToken()
          });

          const res = await fetch(urlForFallback, { method:'POST', body });
          const txt = await res.text();
          let up; try { up = JSON.parse(txt); } catch { up = { raw: txt, status: res.status }; }
          log({ debug: 'upload response (fallback)', file: file.name, up });

          if (up && up.ok){
            successCount += 1;
            if (up.assigned?.field) assignedFields.push(up.assigned.field);
          }
          await new Promise(r => setTimeout(r, 200));
        }catch(err){
          log({ error: 'Failed to upload', file: file.name, detail: String(err) });
        }
      }
    }

    // 3) Verificación
    statusLine.textContent = '🔎 Verificando…';
    let verify = await getWithToken('product_fetch', { id });
    log({ debug:'product_fetch', verify });

    // 4) Resumen visible
    const ok = successCount > 0 && verify?.ok;
    const resumen = ok
      ? `✅ Carga exitosa (${successCount} archivo(s)). Campos: ${assignedFields.join(', ')||'—'}`
      : '❌ No se pudo cargar, intenta de nuevo.';
    respEl.textContent = resumen;

    if (DEBUG_UI){
      respEl.textContent += '\n\n[DEBUG]\n' + JSON.stringify({dbg}, null, 2);
    }
  } finally {
    // ---- Loading OFF (siempre) ----
    btn.disabled = false;
    btn.textContent = originalBtnText;
    loader.remove();
  }
});

// ===================================================
//              MOVIMIENTOS + RECIBO PDF
// ===================================================
// -------- Movimientos --------
document.getElementById('formMovimiento').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respMovimiento');
  respEl.textContent = '';

  const fd = new FormData(e.target);

  // Mapear operación de negocio -> tipo de movimiento para el backend
  const operacion = fd.get('operacion') || 'venta';
  let tipo = 'salida'; // por defecto, venta = salida de inventario
  if (operacion === 'compra') tipo = 'ingreso';
  else if (operacion === 'ajuste') tipo = 'ajuste';
  fd.set('tipo', tipo);

  // Normalizar numéricos
  const raw = Object.fromEntries(fd.entries());
  if (raw.cantidad !== undefined) raw.cantidad = Number(raw.cantidad || 0);
  if (raw.precio_unitario) raw.precio_unitario = Number(raw.precio_unitario);
  if (raw.costo_unitario)  raw.costo_unitario  = Number(raw.costo_unitario);

  appendResp(respEl, { debug:'POST movement' });

  const out = await postWithToken('movement', raw);
  showResp(respEl, out);

  // Si fue una venta (salida) y se creó movimiento, proponemos el ID para el recibo
  if(out && out.ok && tipo === 'salida' && out.id_movimiento){
    const recForm = document.querySelector('#formRecibo [name="id_movimiento"]');
    if (recForm) recForm.value = out.id_movimiento;
  }
});

// -------- Recibo PDF --------
document.getElementById('formRecibo').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respRecibo');
  respEl.textContent = '';

  const id  = new FormData(e.target).get('id_movimiento');
  appendResp(respEl, { debug:'GET receipt', id });

  const out = await getWithToken('receipt', { id });
  showResp(respEl, out);
  if(out && out.ok && out.url){ window.open(out.url, '_blank'); }
});

// ===================================================
//                VENTAS (caja registradora)
// ===================================================
let ventaItems = [];

// Dom refs
const formVenta           = document.getElementById('formVenta');
const respVenta           = document.getElementById('respVenta');
const respCliente         = document.getElementById('respCliente');
const inputIdCliente      = formVenta.querySelector('[name="id_cliente"]');
const ventaRespProducto   = document.getElementById('ventaRespProducto');
const ventaItemsBody      = document.getElementById('ventaItemsBody');

const btnVentaVerComprobante = document.getElementById('btnVentaVerComprobante');
let   ventaDocUrlUltima       = '';
if (btnVentaVerComprobante) {
  btnVentaVerComprobante.disabled = true;
}

const inputVentaCodigo    = document.getElementById('ventaCodigo');
const inputVentaNombre    = document.getElementById('ventaNombre');
const inputVentaPrecioSug = document.getElementById('ventaPrecioSugerido');
const inputVentaStock     = document.getElementById('ventaStock');
const inputVentaCantidad  = document.getElementById('ventaCantidad');
const inputVentaPrecioUni = document.getElementById('ventaPrecioUnitario');

const spanTotalBruto      = document.getElementById('ventaTotalBruto');
const spanTotalDesc       = document.getElementById('ventaTotalDescuento');
const spanTotalNeto       = document.getElementById('ventaTotalNeto');

const inputPagoInicialMonto = document.getElementById('pagoInicialMonto');
const inputPagoInicialForma = document.getElementById('pagoInicialForma');
const selectPlazoDias       = document.getElementById('plazoDias');

// Recalcular totales cuando cambia % de descuento
const descuentoEl = document.getElementById("ventaDescuentoPorcentaje");
if (descuentoEl) {
  descuentoEl.addEventListener("input", () => {
    recomputeVentaTotals();
  });
}


// --- Helpers de ventas ---
function limpiarProductoActual(){
  inputVentaNombre.value    = '';
  inputVentaPrecioSug.value = '';
  inputVentaPrecioUni.value = '';
  inputVentaStock.value     = '';
  inputVentaCantidad.value  = '1';
  ventaRespProducto.textContent = '';
}

function renderVentaItems(){
  ventaItemsBody.innerHTML = '';
  ventaItems.forEach((it, idx)=>{
    const tr = document.createElement('tr');
    const subtotal = it.cantidad * it.precio_unitario;
    tr.innerHTML = `
      <td>${it.id_del_articulo}</td>
      <td>${it.nombre}</td>
      <td>${it.cantidad}</td>
      <td>Q ${it.precio_unitario.toFixed(2)}</td>
      <td>Q ${subtotal.toFixed(2)}</td>
      <td><button type="button" class="ventaRemoveItem" data-index="${idx}">✕</button></td>
    `;
    ventaItemsBody.appendChild(tr);
  });
}

function recomputeVentaTotals(){
  let totalBrutoReal   = 0; // lo que realmente se está cobrando antes del % global
  let totalSugerido    = 0; // referencia (precio sugerido * cant)
  let descuentoLineas  = 0; // solo cuando precio real < sugerido
  let recargoLineas    = 0; // opcional: cuando precio real > sugerido (NO es descuento)

  // 1) Totales a partir de los items en memoria
  ventaItems.forEach(it => {
    const cant           = Number(it.cantidad || 0);
    const precioSug      = Number(it.precio_sugerido || 0);
    const precioUnitario = Number(it.precio_unitario || 0);

    const sugerido = cant * precioSug;
    const real     = cant * precioUnitario;

    totalSugerido  += sugerido;
    totalBrutoReal += real;

    const diff = sugerido - real; // + => descuento, - => recargo
    if (diff > 0) descuentoLineas += diff;
    else         recargoLineas   += Math.abs(diff);
  });

  // 2) Descuento global (%) — debe aplicarse sobre el TOTAL REAL, no sobre el sugerido
  const pctEl = document.getElementById("ventaDescuentoPorcentaje");
  const pct   = pctEl ? (parseFloat(pctEl.value) || 0) : 0;

  const descuentoVenta = totalBrutoReal * (pct / 100);

  // 3) Descuento total y total neto final
  // Descuento total = (descuento por bajar precios) + (descuento % global)
  const descuentoTotal = descuentoLineas + descuentoVenta;

  // Total neto final = total real - descuento global
  // (porque el “descuento de línea” ya está incorporado en totalBrutoReal)
  const totalNetoFinal = totalBrutoReal - descuentoVenta;

  // 4) Refrescar UI
  const spanTotalBruto = document.getElementById("ventaTotalBruto");
  const spanTotalDesc  = document.getElementById("ventaTotalDescuento");
  const spanTotalNeto  = document.getElementById("ventaTotalNeto");

  if (spanTotalBruto) spanTotalBruto.textContent = totalBrutoReal.toFixed(2);
  if (spanTotalDesc)  spanTotalDesc.textContent  = descuentoTotal.toFixed(2);
  if (spanTotalNeto)  spanTotalNeto.textContent  = totalNetoFinal.toFixed(2);

  // 5) Guardar para el payload al backend
  window.__VENTA_TOTALS__ = {
    totalBruto: totalBrutoReal,          // ✅ ahora sí: lo real
    totalSugerido,                       // referencia
    descuentoLineas,                     // referencia
    recargoLineas,                       // opcional
    descuentoVenta,                      // ✅ % sobre lo real
    descuentoTotal,                      // línea + % (solo para reporteo)
    totalNeto: totalNetoFinal,
    descuentoPorcentaje: pct
  };
}



function resetVenta(){
  ventaItems = [];
  renderVentaItems();

  // Limpiar descuento global
  const inputDescuentoPct = document.getElementById('ventaDescuentoPorcentaje');
  if (inputDescuentoPct) {
    inputDescuentoPct.value = '';
  }

  // Limpiar totales en memoria
  window.__VENTA_TOTALS__ = {
    totalBruto: 0,
    descuentoLineas: 0,
    descuentoVenta: 0,
    descuentoTotal: 0,
    totalNeto: 0,
    descuentoPorcentaje: 0
  };

  // Recalcular totales para dejar todo en Q 0.00 en la UI
  recomputeVentaTotals();

  respVenta.textContent = '';
  inputPagoInicialMonto.value = '';
  inputPagoInicialForma.value = '';
  selectPlazoDias.value       = '0';
  formVenta.querySelector('[name="notas"]').value = '';
  // No tocamos ventaDocUrlUltima para seguir viendo el último comprobante
}


// --- Helpers de cliente (ventas) ---
function rellenarCliente(cliente){
  if (!cliente) return;
  if (inputIdCliente) inputIdCliente.value = cliente.id_cliente || '';
  const inpNom  = formVenta.querySelector('[name="cliente_nombre"]');
  const inpTel  = formVenta.querySelector('[name="cliente_telefono"]');
  const inpMail = formVenta.querySelector('[name="cliente_email"]');

  if (inpNom)  inpNom.value  = cliente.nombre   || '';
  if (inpTel)  inpTel.value  = cliente.telefono || '';
  if (inpMail) inpMail.value = cliente.email    || '';
}

// Buscar cliente por ID (NIT)
async function buscarClientePorId(){
  if (!inputIdCliente) return;
  const id = (inputIdCliente.value || '').trim();
  respCliente.textContent = '';

  if (!id){
    return;
  }

  appendResp(respCliente, { debug:'GET customer_fetch', id_cliente: id });

  const data = await getWithToken('customer_fetch', { id_cliente: id });

  if (!data || !data.ok || !data.customer){
    showResp(respCliente, data || { error:'Cliente no encontrado' });
    rellenarCliente({ id_cliente: id, nombre:'', telefono:'', email:'' });
    return;
  }

  rellenarCliente(data.customer);
  showResp(respCliente, data);
}

// --- Búsqueda de producto por código ---
async function buscarProductoVenta(){
  const id = (inputVentaCodigo.value || '').trim();
  if (!id){
    alert('Ingresa un código de artículo');
    return;
  }
  ventaRespProducto.textContent = 'Buscando producto...';

  const data = await getWithToken('product_fetch', { id });
  if (!data || !data.ok || !data.product){
    ventaRespProducto.textContent = '❌ Producto no encontrado';
    limpiarProductoActual();
    return;
  }

  const p = data.product;
  const precio = Number(p.precio_de_venta || 0) || 0;
  const stock  = Number(p.cantidad || 0) || 0;

  inputVentaNombre.value    = p.nombre || '';
  inputVentaPrecioSug.value = precio ? precio.toFixed(2) : '';
  inputVentaPrecioUni.value = precio ? precio.toFixed(2) : '';
  inputVentaStock.value     = stock;

  ventaRespProducto.textContent =
    `✅ ${p.nombre} • Precio sugerido: Q ${precio.toFixed(2)} • Stock: ${stock}`;
}

// Enter en el campo código
inputVentaCodigo.addEventListener('keydown', (ev)=>{
  if (ev.key === 'Enter'){
    ev.preventDefault();
    buscarProductoVenta();
  }
});

// Botón buscar
document.getElementById('btnVentaBuscarProducto').addEventListener('click', ()=>{
  buscarProductoVenta();
});

// --- Agregar item al carrito ---
document.getElementById('btnVentaAgregarItem').addEventListener('click', ()=>{
  const codigo = (inputVentaCodigo.value || '').trim();
  const nombre = (inputVentaNombre.value || '').trim();
  const cant   = Number(inputVentaCantidad.value || 0);
  const precioSug = Number(inputVentaPrecioSug.value || 0);
  const precioUni = Number(inputVentaPrecioUni.value || 0);
  const stockActual = Number(inputVentaStock.value || 0);

  if (!codigo){
    alert('Ingresa el código del artículo y búscalo primero.');
    return;
  }
  if (!nombre){
    alert('Primero busca el producto para cargar su nombre y precio sugerido.');
    return;
  }
  if (!cant || cant <= 0){
    alert('La cantidad debe ser mayor que cero.');
    return;
  }
  if (!precioUni || precioUni <= 0){
    alert('El precio unitario debe ser mayor que cero.');
    return;
  }

  // Control de stock en el carrito
  let yaEnCarrito = 0;
  ventaItems.forEach(it => {
    if (it.id_del_articulo === codigo) {
      yaEnCarrito += Number(it.cantidad || 0);
    }
  });

  const disponible = stockActual - yaEnCarrito;

  if (stockActual <= 0 || disponible <= 0) {
    alert('Este producto no tiene existencias disponibles en este momento.');
    return;
  }

  if (cant > disponible) {
    alert(`Solo hay ${disponible} unidad(es) disponibles de este producto. Ajusta la cantidad.`);
    return;
  }

  ventaItems.push({
    id_del_articulo: codigo,
    nombre,
    cantidad: cant,
    precio_sugerido: precioSug || precioUni,
    precio_unitario: precioUni
  });

  renderVentaItems();
  recomputeVentaTotals();

  inputVentaStock.value = disponible - cant;

  inputVentaCodigo.value = '';
  limpiarProductoActual();
  inputVentaCodigo.focus();
});

// Eliminar item del carrito (delegación)
ventaItemsBody.addEventListener('click', (ev)=>{
  const btn = ev.target.closest('.ventaRemoveItem');
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  if (!isNaN(idx) && idx >= 0 && idx < ventaItems.length){
    ventaItems.splice(idx,1);
    renderVentaItems();
    recomputeVentaTotals();
  }
});

// --- Guardar / actualizar cliente (customer_upsert) ---
document.getElementById('btnVentaGuardarCliente').addEventListener('click', async ()=>{
  respCliente.textContent = '';

  const fd = new FormData(formVenta);
  const payload = {
    id_cliente: fd.get('id_cliente') || '',
    nombre:     fd.get('cliente_nombre') || '',
    telefono:   fd.get('cliente_telefono') || '',
    email:      fd.get('cliente_email') || ''
  };

  if (!payload.nombre){
    alert('El nombre del cliente es obligatorio para guardarlo.');
    return;
  }

  appendResp(respCliente, { debug:'POST customer_upsert', payload });

  const out = await postWithToken('customer_upsert', payload);
  showResp(respCliente, out);

  if (out && out.ok && out.id_cliente){
    const idInput = formVenta.querySelector('[name="id_cliente"]');
    if (idInput) idInput.value = out.id_cliente;
  }
});

// Buscar cliente al usar el campo ID
if (inputIdCliente){
  inputIdCliente.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter'){
      ev.preventDefault();
      buscarClientePorId();
    }
  });

  inputIdCliente.addEventListener('blur', ()=>{
    buscarClientePorId();
  });
}

// --- Registrar venta (sale_register) ---
formVenta.addEventListener('submit', async (e)=>{
  e.preventDefault();
  respVenta.textContent = '';

  if (!ventaItems.length){
    alert('Agrega al menos un producto a la venta.');
    return;
  }

  const fd = new FormData(formVenta);

  const id_cliente       = (fd.get('id_cliente') || '').trim();
  const cliente_nombre   = (fd.get('cliente_nombre') || '').trim();
  const cliente_telefono = (fd.get('cliente_telefono') || '').trim();
  const cliente_email    = (fd.get('cliente_email') || '').trim();
  const notas            = (fd.get('notas') || '').trim();

  if (!cliente_nombre){
    alert('El nombre del cliente es obligatorio.');
    return;
  }

  let pagoInicialMonto = Number(fd.get('pago_inicial_monto') || 0);
  if (isNaN(pagoInicialMonto) || pagoInicialMonto < 0) pagoInicialMonto = 0;
  const pagoInicialForma = (fd.get('pago_inicial_forma') || '').trim();
  const plazoDias        = Number(fd.get('plazo_dias') || 0);

  const payload = {
    id_cliente,
    cliente_nombre,
    cliente_telefono,
    cliente_email,
    plazo_dias: plazoDias,
    notas,
    items: ventaItems.map(it => ({
      id_del_articulo: it.id_del_articulo,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario
    }))
  };
  
  // Pago inicial
  if (pagoInicialMonto > 0){
    payload.pago_inicial = {
      monto: pagoInicialMonto,
      forma_pago: pagoInicialForma || ''
    };
  }
  
  // ===============================
  // AÑADIR DESCUENTOS Y TOTALES
  // ===============================
  if (window.__VENTA_TOTALS__) {
    const t = window.__VENTA_TOTALS__;
    payload.descuento_porcentaje = t.descuentoPorcentaje;
    payload.descuento_venta_monto = t.descuentoVenta;
    payload.total_bruto = t.totalBruto;
    payload.total_descuento = t.descuentoTotal;
    payload.total_neto = t.totalNeto;
  
    // Opcional (si quieres depurar en backend)
    payload.descuento_lineas = t.descuentoLineas;
  }



  appendResp(respVenta, { debug:'POST sale_register', payload_preview: {
    cliente_nombre,
    items: payload.items.length
  }});

  const out = await postJSONWithToken('sale_register', payload);
  showResp(respVenta, out);

  if (out && out.ok){
    ventaDocUrlUltima = out.doc_url || '';

    if (btnVentaVerComprobante) {
      btnVentaVerComprobante.disabled = !ventaDocUrlUltima;
    }

    alert(
      `Venta registrada correctamente.\n` +
      `ID: ${out.id_venta}\n` +
      `Total: Q ${Number(out.total_neto || 0).toFixed(2)}`
    );

    if (ventaDocUrlUltima) {
      window.open(ventaDocUrlUltima, '_blank');
    }

    resetVenta();
  }
});

// ===================================================
//                COMPRAS (módulo de compras)
// ===================================================
let compraItems = [];

const formCompra            = document.getElementById('formCompra');
const respCompra            = document.getElementById('respCompra');
const compraItemsBody       = document.getElementById('compraItemsBody');
const compraRespProducto    = document.getElementById('compraRespProducto');
// Si existe un <pre id="respProveedorCompra"> lo usamos, si no, usamos respCompra como fallback
const respProveedorCompra = document.getElementById('respProveedorCompra') || respCompra;


const inputCompraCodigo     = document.getElementById('compraCodigo');
const inputCompraNombre     = document.getElementById('compraNombre');
const inputCompraCostoUnit  = document.getElementById('compraCostoUnitario');
const inputCompraCantidad   = document.getElementById('compraCantidad');
const inputCompraPrecioSug  = document.getElementById('compraPrecioSugerido');
const spanCompraTotalNeto   = document.getElementById('compraTotalNeto');

// Campos de proveedor dentro del formCompra
let inputProvId, inputProvNombre, inputProvTel, inputProvMail, inputTipoDoc, inputNumDoc, inputNotasCompra;
if (formCompra) {
  inputProvId     = formCompra.querySelector('[name="id_proveedor"]');
  inputProvNombre = formCompra.querySelector('[name="proveedor_nombre"]');
  inputProvTel    = formCompra.querySelector('[name="proveedor_telefono"]');
  inputProvMail   = formCompra.querySelector('[name="proveedor_email"]');
  inputTipoDoc    = formCompra.querySelector('[name="tipo_documento"]');
  inputNumDoc     = formCompra.querySelector('[name="numero_documento"]');
  inputNotasCompra= formCompra.querySelector('[name="notas"]');
}

// Buscar proveedor al usar el campo ID (igual que clientes)
if (inputProvId){
  inputProvId.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter'){
      ev.preventDefault();
      buscarProveedorPorId();
    }
  });

  inputProvId.addEventListener('blur', ()=>{
    buscarProveedorPorId();
  });
}


// --- Helpers de compras ---
function limpiarProductoCompra(){
  if (inputCompraNombre)    inputCompraNombre.value = '';
  if (inputCompraCostoUnit) inputCompraCostoUnit.value = '';
  if (inputCompraPrecioSug) inputCompraPrecioSug.value = '';
  if (inputCompraCantidad)  inputCompraCantidad.value = '1';
  if (compraRespProducto)   compraRespProducto.textContent = '';
}

function renderCompraItems(){
  if (!compraItemsBody) return;
  compraItemsBody.innerHTML = '';
  compraItems.forEach((it, idx)=>{
    const subtotal = it.cantidad * it.costo_unitario;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.id_del_articulo}</td>
      <td>${it.nombre}</td>
      <td>${it.cantidad}</td>
      <td>Q ${it.costo_unitario.toFixed(2)}</td>
      <td>Q ${subtotal.toFixed(2)}</td>
      <td><button type="button" class="compraRemoveItem" data-index="${idx}">✕</button></td>
    `;
    compraItemsBody.appendChild(tr);
  });
}

// --- Helpers de proveedor (compras) ---
function rellenarProveedorCompra(prov){
  if (!formCompra) return;
  if (!prov) prov = {};

  if (inputProvId)     inputProvId.value     = prov.id_proveedor || '';
  if (inputProvNombre) inputProvNombre.value = prov.nombre || prov.proveedor_nombre || '';
  if (inputProvTel)    inputProvTel.value    = prov.telefono || prov.proveedor_telefono || '';
  if (inputProvMail)   inputProvMail.value   = prov.email || prov.proveedor_email || '';
}

// Buscar proveedor por ID (código del proveedor)
async function buscarProveedorPorId(){
  if (!inputProvId) return;

  const id = (inputProvId.value || '').trim();
  if (!id){
    // Si se borra el campo, no hacemos nada
    return;
  }

  if (respProveedorCompra) {
    respProveedorCompra.textContent = '';
    appendResp(respProveedorCompra, { debug:'GET supplier_fetch', id_proveedor: id });
  }

  const data = await getWithToken('supplier_fetch', { id_proveedor: id });

  if (!data || !data.ok || !data.supplier){
    if (respProveedorCompra){
      showResp(respProveedorCompra, data || { error:'Proveedor no encontrado' });
    }
    // Prellenamos solo el id y dejamos los otros vacíos para que el usuario los escriba
    rellenarProveedorCompra({ id_proveedor: id, nombre:'', telefono:'', email:'' });
    return;
  }

  rellenarProveedorCompra(data.supplier);
  if (respProveedorCompra){
    showResp(respProveedorCompra, data);
  }
}

// --- Guardar / actualizar proveedor (supplier_upsert) ---
const btnCompraGuardarProveedor = document.getElementById('btnCompraGuardarProveedor');

if (btnCompraGuardarProveedor && formCompra){
  btnCompraGuardarProveedor.addEventListener('click', async ()=>{
    if (respProveedorCompra) respProveedorCompra.textContent = '';

    const fd = new FormData(formCompra);
    const payload = {
      id_proveedor: fd.get('id_proveedor') || '',
      nombre:       fd.get('proveedor_nombre') || '',
      telefono:     fd.get('proveedor_telefono') || '',
      email:        fd.get('proveedor_email') || '',
      notas:        fd.get('notas') || ''
    };

    if (!payload.nombre){
      alert('El nombre del proveedor es obligatorio para guardarlo.');
      return;
    }

    if (respProveedorCompra){
      appendResp(respProveedorCompra, { debug:'POST supplier_upsert', payload });
    }

    const out = await postWithToken('supplier_upsert', payload);
    if (respProveedorCompra){
      showResp(respProveedorCompra, out);
    }

    if (out && out.ok && out.id_proveedor){
      if (inputProvId) inputProvId.value = out.id_proveedor;
    }
  });
}

function recomputeCompraTotals(){
  let totalNeto = 0;
  compraItems.forEach(it=>{
    totalNeto += it.cantidad * it.costo_unitario;
  });
  if (spanCompraTotalNeto) {
    spanCompraTotalNeto.textContent = totalNeto.toFixed(2);
  }
}

function resetCompra(){
  compraItems = [];
  renderCompraItems();
  recomputeCompraTotals();
  if (respCompra) respCompra.textContent = '';
  if (inputNotasCompra) inputNotasCompra.value = '';
}

// --- Buscar producto para compras ---
async function buscarProductoCompra(){
  const id = (inputCompraCodigo && inputCompraCodigo.value || '').trim();
  if (!id){
    alert('Ingresa un código de artículo');
    return;
  }
  if (compraRespProducto) compraRespProducto.textContent = 'Buscando producto...';

  const data = await getWithToken('product_fetch', { id });
  if (!data || !data.ok || !data.product){
    if (compraRespProducto) compraRespProducto.textContent = '❌ Producto no encontrado';
    limpiarProductoCompra();
    return;
  }

  const p = data.product;
  const costo  = Number(p.costo || 0) || 0;
  const precio = Number(p.precio_de_venta || 0) || 0;

  if (inputCompraNombre)    inputCompraNombre.value = p.nombre || '';
  if (inputCompraCostoUnit) inputCompraCostoUnit.value = costo ? costo.toFixed(2) : '';
  if (inputCompraPrecioSug) inputCompraPrecioSug.value = precio ? precio.toFixed(2) : '';
  if (inputCompraCantidad)  inputCompraCantidad.value = '1';

  if (compraRespProducto){
    compraRespProducto.textContent =
      `✅ ${p.nombre} • Costo actual: ${costo ? 'Q ' + costo.toFixed(2) : '—'} • Precio de venta: ${precio ? 'Q ' + precio.toFixed(2) : '—'}`;
  }
}

// Enter en código de compra
if (inputCompraCodigo){
  inputCompraCodigo.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter'){
      ev.preventDefault();
      buscarProductoCompra();
    }
  });
}

// Botón buscar producto (compras)
const btnCompraBuscar = document.getElementById('btnCompraBuscarProducto');
if (btnCompraBuscar){
  btnCompraBuscar.addEventListener('click', ()=> buscarProductoCompra());
}

// --- Agregar item a la compra ---
const btnCompraAgregarItem = document.getElementById('btnCompraAgregarItem');
if (btnCompraAgregarItem){
  btnCompraAgregarItem.addEventListener('click', ()=>{
    const codigo = (inputCompraCodigo && inputCompraCodigo.value || '').trim();
    const nombre = (inputCompraNombre && inputCompraNombre.value || '').trim();
    const cant   = Number(inputCompraCantidad && inputCompraCantidad.value || 0);
    const costo  = Number(inputCompraCostoUnit && inputCompraCostoUnit.value || 0);
    const precioSug = Number(inputCompraPrecioSug && inputCompraPrecioSug.value || 0);

    if (!codigo){
      alert('Ingresa el código del artículo y búscalo primero.');
      return;
    }
    if (!nombre){
      alert('Primero busca el producto para cargar su nombre.');
      return;
    }
    if (!cant || cant <= 0){
      alert('La cantidad debe ser mayor que cero.');
      return;
    }
    if (!costo || costo <= 0){
      alert('El costo unitario debe ser mayor que cero.');
      return;
    }

    compraItems.push({
      id_del_articulo: codigo,
      nombre,
      cantidad: cant,
      costo_unitario: costo,
      precio_sugerido: precioSug || 0
    });

    renderCompraItems();
    recomputeCompraTotals();

    if (inputCompraCodigo) inputCompraCodigo.value = '';
    limpiarProductoCompra();
    if (inputCompraCodigo) inputCompraCodigo.focus();
  });
}

// Eliminar item del listado de compras
if (compraItemsBody){
  compraItemsBody.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('.compraRemoveItem');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (!isNaN(idx) && idx >= 0 && idx < compraItems.length){
      compraItems.splice(idx,1);
      renderCompraItems();
      recomputeCompraTotals();
    }
  });
}

// --- Registrar compra (purchase_register) ---
if (formCompra){
  formCompra.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (respCompra) respCompra.textContent = '';

    if (!compraItems.length){
      alert('Agrega al menos un producto a la compra.');
      return;
    }

    const fd = new FormData(formCompra);

    const proveedor_nombre = (fd.get('proveedor_nombre') || '').trim();
    if (!proveedor_nombre){
      alert('El nombre del proveedor es obligatorio.');
      return;
    }

    const payload = {
      id_proveedor:       (fd.get('id_proveedor') || '').trim(),
      proveedor_nombre,
      proveedor_telefono: (fd.get('proveedor_telefono') || '').trim(),
      proveedor_email:    (fd.get('proveedor_email') || '').trim(),
      tipo_documento:     (fd.get('tipo_documento') || '').trim(),
      numero_documento:   (fd.get('numero_documento') || '').trim(),
      notas:              (fd.get('notas') || '').trim(),
      items: compraItems.map(it => ({
        id_del_articulo: it.id_del_articulo,
        cantidad:        it.cantidad,
        costo_unitario:  it.costo_unitario,
        precio_sugerido: it.precio_sugerido
      }))
    };

    appendResp(respCompra, { debug:'POST purchase_register', payload_preview: {
      proveedor_nombre,
      items: payload.items.length
    }});

    const out = await postJSONWithToken('purchase_register', payload);
    showResp(respCompra, out);

    if (out && out.ok){
      const total = Number(out.total_neto || 0);
      alert(
        `Compra registrada correctamente.\n` +
        `ID: ${out.id_compra}\n` +
        `Total: Q ${total.toFixed(2)}`
      );
      resetCompra();
    }
  });
}

// ===================================================
//        REPORTE DIARIO DE CAJA (daily_cash_report)
// ===================================================
const formCajaDiaria        = document.getElementById('formCajaDiaria');
const fechaCajaDiaria       = document.getElementById('fechaCajaDiaria');
const cajaDiariaCards       = document.getElementById('cajaDiariaCards');
const kpiCajaEsperada       = document.getElementById('kpiCajaEsperada');
const kpiCajaVentasContado  = document.getElementById('kpiCajaVentasContado');
const kpiCajaPagCredito     = document.getElementById('kpiCajaPagCredito');
const kpiCajaCobAdicional   = document.getElementById('kpiCajaCobAdicional');
const kpiCajaAnulaciones    = document.getElementById('kpiCajaAnulaciones');
const cajaDiariaDetalle     = document.getElementById('cajaDiariaDetalle');
const respCajaDiaria        = document.getElementById('respCajaDiaria');

function todayISO_() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function Q_(n) {
  return `Q ${(Number(n || 0) || 0).toFixed(2)}`;
}

if (fechaCajaDiaria && !fechaCajaDiaria.value) {
  fechaCajaDiaria.value = todayISO_();
}

if (formCajaDiaria) {
  formCajaDiaria.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (respCajaDiaria) respCajaDiaria.textContent = '';

    const fd = new FormData(formCajaDiaria);
    const fecha = (fd.get('fecha') || '').trim();
    if (!fecha) {
      alert('Selecciona una fecha.');
      return;
    }

    try {
      const out = await getWithToken('daily_cash_report', { fecha });

      if (!out || !out.ok) {
        if (respCajaDiaria) showResp(respCajaDiaria, out || { error: 'Sin respuesta' });
        cajaDiariaCards && (cajaDiariaCards.style.display = 'none');
        cajaDiariaDetalle && (cajaDiariaDetalle.style.display = 'none');
        return;
      }

      const comp = out.componentes || {};
      kpiCajaEsperada      && (kpiCajaEsperada.textContent      = Q_(out.efectivo_esperado));
      kpiCajaVentasContado && (kpiCajaVentasContado.textContent = Q_(comp.ventas_contado_total));
      kpiCajaPagCredito    && (kpiCajaPagCredito.textContent    = Q_(comp.pagos_iniciales_credito_mixto));
      kpiCajaCobAdicional  && (kpiCajaCobAdicional.textContent  = Q_(comp.cobros_adicionales));
      kpiCajaAnulaciones   && (kpiCajaAnulaciones.textContent   = Q_(comp.reintegros_anulaciones_hoy));

      cajaDiariaCards && (cajaDiariaCards.style.display = 'flex');

      if (respCajaDiaria) {
        showResp(respCajaDiaria, out);
      }
      cajaDiariaDetalle && (cajaDiariaDetalle.style.display = 'block');

    } catch (err) {
      if (respCajaDiaria) showResp(respCajaDiaria, { error: String(err) });
      cajaDiariaCards && (cajaDiariaCards.style.display = 'none');
      cajaDiariaDetalle && (cajaDiariaDetalle.style.display = 'block');
    }
  });
}

// ==============================
// CIERRE DE CAJA (cash_close_register)
// ==============================
const formCierreCaja      = document.getElementById('formCierreCaja');
const fechaCierreCaja     = document.getElementById('fechaCierreCaja');
const efectivoContadoCaja = document.getElementById('efectivoContadoCaja');
const notasCierreCaja     = document.getElementById('notasCierreCaja');
const respCierreCaja      = document.getElementById('respCierreCaja');

function todayISO__() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

if (fechaCierreCaja && !fechaCierreCaja.value) fechaCierreCaja.value = todayISO__();

if (formCierreCaja) {
  formCierreCaja.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fecha = (fechaCierreCaja?.value || '').trim();
    const efectivo = Number(efectivoContadoCaja?.value || 0) || 0;
    const notas = (notasCierreCaja?.value || '').trim();

    if (!fecha) return alert('Selecciona una fecha.');
    if (!isFinite(efectivo)) return alert('Efectivo contado inválido.');

    respCierreCaja.style.display = 'block';
    respCierreCaja.textContent = 'Guardando cierre...';

    try {
      const out = await postCashCloseWithToken({
        fecha,
        efectivo_contado: efectivo,
        notas
      });

      showResp(respCierreCaja, out);

      if (out && out.ok) {
        alert(`Cierre guardado ✅\nDiferencia: Q ${(Number(out.diferencia||0)).toFixed(2)}`);
      }
    } catch (err) {
      showResp(respCierreCaja, { ok:false, error: String(err) });
    }
  });
}


// ===================================================
//        RESUMEN DE VENTAS DEL DÍA (sales_summary)
// ===================================================
const formResumenVentas = document.getElementById('formResumenVentas');
const respResumenVentas = document.getElementById('respResumenVentas');

const totalesDiaBox    = document.getElementById('totales-dia');
const detalleVentasTbody = document.getElementById('detalle-ventas-body');
const resumenWrapper   = document.getElementById('resumenVentasWrapper');

// Formulario de anulación de ventas
const formAnularVenta = document.getElementById('formAnularVenta');
const respAnularVenta = document.getElementById('respAnularVenta');

// ===================================================
//   RESUMEN DE VENTAS DEL DÍA PARA CIERRE DE CAJA
// ===================================================
const formResumenVentasCaja     = document.getElementById('formResumenVentasCaja');
const fechaResumenVentasCaja    = document.getElementById('fechaResumenVentasCaja');
const respResumenVentasCaja     = document.getElementById('respResumenVentasCaja');

const totalesDiaCajaBox         = document.getElementById('totales-dia-caja');
const detalleVentasCajaTbody    = document.getElementById('detalle-ventas-caja-body');
const resumenCajaWrapper        = document.getElementById('resumenVentasCajaWrapper');

// set fecha default (hoy)
if (fechaResumenVentasCaja && !fechaResumenVentasCaja.value) {
  fechaResumenVentasCaja.value = todayISO__(); // ya existe arriba en el archivo
}



let chartVentas = null;
let chartMargen = null;
let ventasDelDia = [];
let resumenDocUrlActual = '';

// Crea (si no existe) el contenedor del detalle de una venta
function ensureDetalleVentaBox() {
  let box = document.getElementById('detalle-venta-seleccionada');
  if (!box) {
    box = document.createElement('section');
    box.id = 'detalle-venta-seleccionada';
    resumenWrapper.appendChild(box);
  }
  return box;
}

// Render totales del día
function renderTotales(out) {
  const t = out.totales || {};
  const fecha = out.fecha || '';

  if (!totalesDiaBox) return;

  totalesDiaBox.innerHTML = `
    <h4>Totales del día (${fecha})</h4>
    <ul>
      <li><strong>Total del día:</strong> Q ${Number(t.total_dia || 0).toFixed(2)}</li>
      <li><strong>Contado:</strong> Q ${Number(t.contado || 0).toFixed(2)}</li>
      <li><strong>Crédito:</strong> Q ${Number(t.credito || 0).toFixed(2)}</li>
      <li><strong>Pagado hoy:</strong> Q ${Number(t.pagado_hoy || 0).toFixed(2)}</li>
      <li><strong>Saldo pendiente:</strong> Q ${Number(t.saldo_pendiente || 0).toFixed(2)}</li>
      <li><strong>Costo estimado:</strong> Q ${Number(t.costo_estimado || 0).toFixed(2)}</li>
      <li><strong>Ganancia estimada:</strong> Q ${Number(t.ganancia_estimada || 0).toFixed(2)}</li>
    </ul>
  `;
}

function renderTotalesCaja(out) {
  const t = out.totales || {};
  const fecha = out.fecha || '';

  if (!totalesDiaCajaBox) return;

  totalesDiaCajaBox.innerHTML = `
    <h4>Total vendido del día (${fecha})</h4>
    <ul>
      <li><strong>Total del día:</strong> Q ${Number(t.total_dia || 0).toFixed(2)}</li>
    </ul>
  `;
}


// Renderiza o actualiza las gráficas (Chart.js)
function renderCharts(out) {
  const t = out.totales || {};
  const totContado = Number(t.contado || 0);
  const totCredito = Number(t.credito || 0);
  const totCosto   = Number(t.costo_estimado || 0);
  const totGan     = Number(t.ganancia_estimada || 0);

  const canvasVentas = document.getElementById('chart-ventas');
  const canvasMargen = document.getElementById('chart-margen');

  if (!canvasVentas || !canvasMargen || typeof Chart === 'undefined') return;

  if (chartVentas) chartVentas.destroy();
  if (chartMargen) chartMargen.destroy();

  chartVentas = new Chart(canvasVentas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Contado', 'Crédito'],
      datasets: [{
        data: [totContado, totCredito],
        backgroundColor: ['#4e79a7', '#f28e2b']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = totContado + totCredito || 1;
              const v = ctx.parsed;
              const pct = (v / total) * 100;
              return `${ctx.label}: Q ${v.toFixed(2)} (${pct.toFixed(1)}%)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });

  chartMargen = new Chart(canvasMargen.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Costo', 'Ganancia'],
      datasets: [{
        data: [totCosto, totGan],
        backgroundColor: ['#4e79a7', '#e15759']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = totCosto + totGan || 1;
              const v = ctx.parsed;
              const pct = (v / total) * 100;
              return `${ctx.label}: Q ${v.toFixed(2)} (${pct.toFixed(1)}%)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });
}

// Pinta el detalle de una venta específica abajo de la tabla
function renderDetalleVentaSeleccionada(venta) {
  const box = ensureDetalleVentaBox();
  if (!venta) {
    box.innerHTML = '';
    return;
  }

  const items = Array.isArray(venta.detalle_items) ? venta.detalle_items : [];
  const tieneComprobante = !!(venta.doc_url);

  let html = `
    <div class="detalle-venta-header">
      <span>Detalle de la venta ${venta.id_venta || ''} — ${venta.cliente || ''}</span>
      ${
        tieneComprobante
          ? `<button type="button" id="btnDetalleVerComprobante">Ver comprobante</button>`
          : `<button type="button" id="btnDetalleVerComprobante" disabled title="Esta venta no tiene comprobante registrado">Sin comprobante</button>`
      }
    </div>
  `;

  if (!items.length) {
    html += `<p>Sin detalle de artículos para esta venta.</p>`;
  } else {
    html += `
      <div class="table-wrapper">
        <table class="tabla tabla-detalle-venta">
          <thead>
            <tr>
              <th>Línea</th>
              <th>Código</th>
              <th>Producto</th>
              <th>Cant.</th>
              <th>Precio unit.</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach(it => {
      html += `
        <tr>
          <td>${it.linea || ''}</td>
          <td>${it.id_del_articulo || ''}</td>
          <td>${it.nombre || ''}</td>
          <td>${Number(it.cantidad || 0)}</td>
          <td>Q ${Number(it.precio_unitario || 0).toFixed(2)}</td>
          <td>Q ${Number(it.subtotal || 0).toFixed(2)}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
  }

  box.innerHTML = html;

  // Enlazar botón "Ver comprobante"
  const btnComp = box.querySelector('#btnDetalleVerComprobante');
  if (btnComp && venta.doc_url) {
    btnComp.addEventListener('click', () => {
      window.open(venta.doc_url, '_blank');
    });
  }
}

// Selecciona una venta (por índice) y actualiza resaltado + detalle
function seleccionarVentaPorIndex(idx) {
  if (!ventasDelDia.length || idx < 0 || idx >= ventasDelDia.length) {
    renderDetalleVentaSeleccionada(null);
    return;
  }

  const venta = ventasDelDia[idx];
  resumenDocUrlActual = venta.doc_url || '';

  // Quitar clase de seleccionadas
  detalleVentasTbody.querySelectorAll('tr').forEach(tr => {
    tr.classList.remove('venta-row-selected');
  });

  // Agregar clase a la fila activa
  const trSel = detalleVentasTbody.querySelector(`tr[data-index="${idx}"]`);
  if (trSel) trSel.classList.add('venta-row-selected');

  // Render detalle
  renderDetalleVentaSeleccionada(venta);
}

// === ANULAR VENTA (sale_cancel) ===
if (formAnularVenta && respAnularVenta) {
  formAnularVenta.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    respAnularVenta.textContent = '';

    const fd = new FormData(formAnularVenta);
    const id_venta = (fd.get('id_venta') || '').toString().trim();
    const motivo   = (fd.get('motivo')   || '').toString().trim();

    if (!id_venta) {
      respAnularVenta.textContent = 'Debes indicar el ID de la venta.';
      return;
    }

    // Confirmación fuerte: esta acción debe ser consciente
    const msgConfirm =
      `¿Seguro que deseas ANULAR la venta ${id_venta}?\n` +
      `Esto revertirá los movimientos de inventario asociados ` +
      `y la venta ya no contará en los totales ni reportes.`;
    if (!confirm(msgConfirm)) {
      return;
    }

    // Llamamos al backend: POST JSON con token en query (?token=...)
    const payload = {
      id_venta,
      motivo
    };

    appendResp(respAnularVenta, {
      debug: 'POST sale_cancel',
      payload_preview: payload
    });

    const out = await postJSONWithToken('sale_cancel', payload);
    showResp(respAnularVenta, out);

    if (out && out.ok) {
      alert(`Venta ${id_venta} anulada correctamente.`);

      // Limpiar formulario
      formAnularVenta.reset();

      // Opcional: refrescar dashboard
      try {
        cargarDashboard();
      } catch (e) {
        console.warn('No se pudo recargar dashboard tras anulación:', e);
      }

      // Opcional: si hay un resumen de ventas cargado, volver a disparar el submit
      if (formResumenVentas) {
        // Si el navegador soporta requestSubmit, la usamos
        if (typeof formResumenVentas.requestSubmit === 'function') {
          formResumenVentas.requestSubmit();
        } else {
          // Fallback: disparar evento submit manual
          const evt = new Event('submit', { cancelable: true });
          formResumenVentas.dispatchEvent(evt);
        }
      }
    } else {
      alert('Error al anular la venta: ' + (out && out.error ? out.error : 'desconocido'));
    }
  });
}


// Evento principal: submit del formulario de resumen
if (formResumenVentas && respResumenVentas && detalleVentasTbody) {
  formResumenVentas.addEventListener('submit', async (e) => {
    e.preventDefault();
    respResumenVentas.textContent = '';

    const fd    = new FormData(formResumenVentas);
    const fecha = (fd.get('fecha') || '').trim();

    if (!fecha) {
      alert('Selecciona una fecha.');
      return;
    }

    appendResp(respResumenVentas, {
      debug: 'GET sales_summary',
      fecha
    });

    try {
      const out = await getWithToken('sales_summary', { fecha });

      if (!out || !out.ok) {
        showResp(respResumenVentas, out || { error: 'Sin respuesta' });
        return;
      }

      // Guardar ventas en memoria
      ventasDelDia = Array.isArray(out.detalle_ventas) ? out.detalle_ventas : [];

      // Totales
      renderTotales(out);

      // Gráficas
      renderCharts(out);

      // Tabla de detalle (lista de ventas)
      detalleVentasTbody.innerHTML = '';
      ventasDelDia.forEach((v, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.index = String(idx);
        tr.innerHTML = `
          <td>${v.hora || ''}</td>
          <td>${v.cliente || ''}</td>
          <td>
            <span class="venta-tipo ${v.tipo_venta === 'credito' ? 'badge-credito' : 'badge-contado'}">
              ${v.tipo_venta || ''}
            </span>
          </td>
          <td style="text-align:right;">Q ${Number(v.total_neto || 0).toFixed(2)}</td>
          <td style="text-align:right;">Q ${Number(v.pagado || 0).toFixed(2)}</td>
          <td style="text-align:right;">Q ${Number(v.saldo || 0).toFixed(2)}</td>
        `;
        detalleVentasTbody.appendChild(tr);
      });

      // Seleccionar por defecto la primera venta (si hay)
      if (ventasDelDia.length) {
        seleccionarVentaPorIndex(0);
      } else {
        renderDetalleVentaSeleccionada(null);
      }

    } catch (err) {
      showResp(respResumenVentas, { error: String(err) });
    }
  });

  // Delegación de eventos para clicks en filas de ventas
  detalleVentasTbody.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-index]');
    if (!tr) return;
    const idx = Number(tr.dataset.index);
    if (!Number.isNaN(idx)) {
      seleccionarVentaPorIndex(idx);
    }
  });
}

// ================================
// Resumen ventas del día (Caja)
// ================================
if (formResumenVentasCaja && detalleVentasCajaTbody) {
  formResumenVentasCaja.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (respResumenVentasCaja) respResumenVentasCaja.textContent = '';

    const fecha = (fechaResumenVentasCaja?.value || '').trim();
    if (!fecha) {
      alert('Selecciona una fecha.');
      return;
    }

    // Mostrar wrapper
    if (resumenCajaWrapper) resumenCajaWrapper.style.display = 'block';

    try {
      const out = await getWithToken('sales_summary', { fecha, mode:'caja' });

      if (respResumenVentasCaja) showResp(respResumenVentasCaja, out);

      if (!out || !out.ok) {
        // limpiar tabla si falla
        detalleVentasCajaTbody.innerHTML = '';
        return;
      }

      // Totales (solo total_dia)
      renderTotalesCaja(out);

      // Tabla (solo Hora/Cliente/Tipo/Total Neto)
      const ventas = Array.isArray(out.detalle_ventas) ? out.detalle_ventas : [];
      detalleVentasCajaTbody.innerHTML = '';

      ventas.forEach((v) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${v.hora || ''}</td>
          <td>${v.cliente || ''}</td>
          <td>${v.tipo_venta || ''}</td>
          <td style="text-align:right;">Q ${Number(v.total_neto || 0).toFixed(2)}</td>
        `;
        detalleVentasCajaTbody.appendChild(tr);
      });

    } catch (err) {
      if (respResumenVentasCaja) showResp(respResumenVentasCaja, { ok:false, error: String(err) });
      detalleVentasCajaTbody.innerHTML = '';
    }
  });
}

// ===================================================
//        REPORTES AVANZADOS (sales_report)
// ===================================================

// Referencias DOM
const formReportesAvanzados = document.getElementById('formReportesAvanzados');
const repAvDesde            = document.getElementById('repAvDesde');
const repAvHasta            = document.getElementById('repAvHasta');
const repAvWrapper          = document.getElementById('repAvWrapper');
const repAvTotalesBox       = document.getElementById('repAvTotales');
const repAvPorDiaBody       = document.getElementById('repAvPorDiaBody');
const repAvTopProdBody      = document.getElementById('repAvTopProdBody');
const repAvTopCliBody       = document.getElementById('repAvTopCliBody');
const repAvCxcBody          = document.getElementById('repAvCxcBody');
const repAvDebugPre         = document.getElementById('repAvDebug');


// ===================================================
//   REPORTES AVANZADOS DE COMPRAS (purchases_report)
// ===================================================
const formReportesCompras = document.getElementById('formReportesCompras');
const repCompDesde        = document.getElementById('repCompDesde');
const repCompHasta        = document.getElementById('repCompHasta');
const repCompWrapper      = document.getElementById('repCompWrapper');
const repCompTotalesBox   = document.getElementById('repCompTotales');
const repCompPorDiaBody   = document.getElementById('repCompPorDiaBody');
const repCompTopProdBody  = document.getElementById('repCompTopProdBody');
const repCompTopProvBody  = document.getElementById('repCompTopProvBody');
const repCompDebugPre     = document.getElementById('repCompDebug');


// Llamada al endpoint (reutilizamos getWithToken)
async function fetchSalesReport(desde, hasta) {
  return await getWithToken('sales_report', { desde, hasta });
}

// Llamada al endpoint de COMPRAS
async function fetchPurchasesReport(desde, hasta) {
  return await getWithToken('purchases_report', { desde, hasta });
}

// Pintar el reporte avanzado
function renderSalesReport(data) {
  if (!repAvWrapper) return;

  repAvWrapper.style.display = 'block';

  // --- Totales del rango ---
  if (repAvTotalesBox) {
    repAvTotalesBox.innerHTML = '';
    const t = data.totales || {};
    const cards = [
      { label: 'Total del rango',      value: formatQ(t.total_rango) },
      { label: 'Contado',              value: formatQ(t.contado) },
      { label: 'Crédito',              value: formatQ(t.credito) },
      { label: 'Pagado en el rango',   value: formatQ(t.pagado_rango) },
      { label: 'Saldo pendiente',      value: formatQ(t.saldo_pendiente) },
      { label: 'Costo estimado',       value: formatQ(t.costo_estimado) },
      { label: 'Ganancia estimada',    value: formatQ(t.ganancia_estimada) }
    ];

    cards.forEach(card => {
      const div = document.createElement('div');
      div.style.flex = '1 1 160px';
      div.style.minWidth = '150px';
      div.style.padding = '12px';
      div.style.borderRadius = '10px';
      div.style.border = '1px solid #ddd';
      div.style.background = '#fafafa';

      const label = document.createElement('div');
      label.style.fontSize = '0.85rem';
      label.style.color = '#555';
      label.textContent = card.label;

      const val = document.createElement('div');
      val.style.fontSize = '1.1rem';
      val.style.fontWeight = '600';
      val.textContent = card.value;

      div.appendChild(label);
      div.appendChild(val);
      repAvTotalesBox.appendChild(div);
    });
  }

  // --- Ventas por día ---
  if (repAvPorDiaBody) {
    repAvPorDiaBody.innerHTML = '';
    const porDia = data.por_dia || [];

    porDia.forEach(dia => {
      const tr = document.createElement('tr');

      const tdFecha = document.createElement('td');
      tdFecha.textContent = dia.fecha;

      const tdTotal = document.createElement('td');
      tdTotal.style.textAlign = 'right';
      tdTotal.textContent = formatQ(dia.total_dia);

      const tdContado = document.createElement('td');
      tdContado.style.textAlign = 'right';
      tdContado.textContent = formatQ(dia.contado);

      const tdCredito = document.createElement('td');
      tdCredito.style.textAlign = 'right';
      tdCredito.textContent = formatQ(dia.credito);

      const tdPagado = document.createElement('td');
      tdPagado.style.textAlign = 'right';
      tdPagado.textContent = formatQ(dia.pagado_dia);

      const tdSaldo = document.createElement('td');
      tdSaldo.style.textAlign = 'right';
      tdSaldo.textContent = formatQ(dia.saldo_pendiente);

      tr.appendChild(tdFecha);
      tr.appendChild(tdTotal);
      tr.appendChild(tdContado);
      tr.appendChild(tdCredito);
      tr.appendChild(tdPagado);
      tr.appendChild(tdSaldo);
      repAvPorDiaBody.appendChild(tr);
    });

    if (!porDia.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = 'No hay ventas en este rango.';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      repAvPorDiaBody.appendChild(tr);
    }
  }

  // --- Top productos ---
  if (repAvTopProdBody) {
    repAvTopProdBody.innerHTML = '';
    const topP = data.top_productos || [];

    topP.forEach(p => {
      const tr = document.createElement('tr');

      const tdCod = document.createElement('td');
      tdCod.textContent = p.id_del_articulo || '';

      const tdNom = document.createElement('td');
      tdNom.textContent = p.nombre || '';

      const tdCant = document.createElement('td');
      tdCant.style.textAlign = 'right';
      tdCant.textContent = p.cantidad != null ? p.cantidad : '';

      const tdTotal = document.createElement('td');
      tdTotal.style.textAlign = 'right';
      tdTotal.textContent = formatQ(p.total_neto);

      tr.appendChild(tdCod);
      tr.appendChild(tdNom);
      tr.appendChild(tdCant);
      tr.appendChild(tdTotal);
      repAvTopProdBody.appendChild(tr);
    });

    if (!topP.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No hay productos vendidos en este rango.';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      repAvTopProdBody.appendChild(tr);
    }
  }

  // --- Top clientes ---
  if (repAvTopCliBody) {
    repAvTopCliBody.innerHTML = '';
    const topC = data.top_clientes || [];

    topC.forEach(c => {
      const tr = document.createElement('tr');

      const tdNom = document.createElement('td');
      tdNom.textContent = c.nombre || c.id_cliente || '';

      const tdTotal = document.createElement('td');
      tdTotal.style.textAlign = 'right';
      tdTotal.textContent = formatQ(c.total_neto);

      const tdSaldo = document.createElement('td');
      tdSaldo.style.textAlign = 'right';
      tdSaldo.textContent = formatQ(c.saldo_pendiente);

      tr.appendChild(tdNom);
      tr.appendChild(tdTotal);
      tr.appendChild(tdSaldo);
      repAvTopCliBody.appendChild(tr);
    });

    if (!topC.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = 'No hay clientes con compras en este rango.';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      repAvTopCliBody.appendChild(tr);
    }
  }

  // --- Cuentas por cobrar ---
  if (repAvCxcBody) {
    repAvCxcBody.innerHTML = '';
    const cxc = data.cuentas_por_cobrar || [];

    cxc.forEach(c => {
      const tr = document.createElement('tr');

      const tdNom = document.createElement('td');
      tdNom.textContent = c.nombre || c.id_cliente || '';

      const tdSaldo = document.createElement('td');
      tdSaldo.style.textAlign = 'right';
      tdSaldo.textContent = formatQ(c.saldo_pendiente_total);

      const tdVentas = document.createElement('td');
      tdVentas.style.textAlign = 'right';
      tdVentas.textContent = c.ventas_pendientes != null ? c.ventas_pendientes : '';

      tr.appendChild(tdNom);
      tr.appendChild(tdSaldo);
      tr.appendChild(tdVentas);
      repAvCxcBody.appendChild(tr);
    });

    if (!cxc.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = 'No hay cuentas por cobrar en este rango.';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      repAvCxcBody.appendChild(tr);
    }
  }

  // --- Debug JSON ---
  if (repAvDebugPre) {
    repAvDebugPre.textContent = JSON.stringify(data, null, 2);
  }
}

// Pintar el reporte avanzado de COMPRAS
function renderPurchasesReport(data) {
  if (!repCompWrapper) return;

  repCompWrapper.style.display = 'block';

  // --- Totales del rango de compras ---
  if (repCompTotalesBox) {
    repCompTotalesBox.innerHTML = '';
    const t = data.totales || {};
    const cards = [
      { label: 'Total compras del rango', value: formatQ(t.total_rango) }
    ];

    cards.forEach(card => {
      const div = document.createElement('div');
      div.style.flex = '1 1 160px';
      div.style.minWidth = '150px';
      div.style.padding = '12px';
      div.style.borderRadius = '10px';
      div.style.border = '1px solid #ddd';
      div.style.background = '#fafafa';

      const label = document.createElement('div');
      label.style.fontSize = '0.85rem';
      label.style.color = '#555';
      label.textContent = card.label;

      const val = document.createElement('div');
      val.style.fontSize = '1.1rem';
      val.style.fontWeight = '600';
      val.textContent = card.value;

      div.appendChild(label);
      div.appendChild(val);
      repCompTotalesBox.appendChild(div);
    });
  }

  // --- Compras por día ---
  if (repCompPorDiaBody) {
    repCompPorDiaBody.innerHTML = '';
    const porDia = data.por_dia || [];

    porDia.forEach(dia => {
      const tr = document.createElement('tr');

      const tdFecha = document.createElement('td');
      tdFecha.textContent = dia.fecha;

      const tdTotal = document.createElement('td');
      tdTotal.style.textAlign = 'right';
      tdTotal.textContent = formatQ(dia.total_dia);

      tr.appendChild(tdFecha);
      tr.appendChild(tdTotal);
      repCompPorDiaBody.appendChild(tr);
    });

    if (!porDia.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = 'No hay compras en este rango.';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      repCompPorDiaBody.appendChild(tr);
    }
  }

  // --- Top productos comprados ---
  if (repCompTopProdBody) {
    repCompTopProdBody.innerHTML = '';
    const topP = data.top_productos || [];

    topP.forEach(p => {
      const tr = document.createElement('tr');

      const tdCod = document.createElement('td');
      tdCod.textContent = p.id_del_articulo || '';

      const tdNom = document.createElement('td');
      tdNom.textContent = p.nombre || '';

      const tdCant = document.createElement('td');
      tdCant.style.textAlign = 'right';
      tdCant.textContent = p.cantidad != null ? p.cantidad : '';

      const tdTotal = document.createElement('td');
      tdTotal.style.textAlign = 'right';
      tdTotal.textContent = formatQ(p.total_neto);

      tr.appendChild(tdCod);
      tr.appendChild(tdNom);
      tr.appendChild(tdCant);
      tr.appendChild(tdTotal);
      repCompTopProdBody.appendChild(tr);
    });

    if (!topP.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No hay productos comprados en este rango.';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      repCompTopProdBody.appendChild(tr);
    }
  }

  // --- Top proveedores ---
  if (repCompTopProvBody) {
    repCompTopProvBody.innerHTML = '';
    const topProv = data.top_proveedores || [];

    topProv.forEach(pv => {
      const tr = document.createElement('tr');

      const tdNom = document.createElement('td');
      tdNom.textContent = pv.nombre || pv.id_proveedor || '';

      const tdTotal = document.createElement('td');
      tdTotal.style.textAlign = 'right';
      tdTotal.textContent = formatQ(pv.total_neto);

      tr.appendChild(tdNom);
      tr.appendChild(tdTotal);
      repCompTopProvBody.appendChild(tr);
    });

    if (!topProv.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = 'No hay proveedores con compras en este rango.';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      repCompTopProvBody.appendChild(tr);
    }
  }

  // --- Debug JSON de compras ---
  if (repCompDebugPre) {
    repCompDebugPre.textContent = JSON.stringify(data, null, 2);
  }
}


// Listener del formulario de reportes avanzados
if (formReportesAvanzados && repAvDesde && repAvHasta) {
  // Prellenar: últimos 7 días
  const hoy = new Date();
  const hastaISO = hoy.toISOString().slice(0, 10);
  const dDesde = new Date(hoy);
  dDesde.setDate(dDesde.getDate() - 7);
  const desdeISO = dDesde.toISOString().slice(0, 10);

  if (!repAvDesde.value) repAvDesde.value = desdeISO;
  if (!repAvHasta.value) repAvHasta.value = hastaISO;

  formReportesAvanzados.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const desde = repAvDesde.value || '';
    const hasta = repAvHasta.value || '';

    if (!desde || !hasta) {
      alert('Debes indicar una fecha "Desde" y "Hasta".');
      return;
    }
    if (desde > hasta) {
      alert('La fecha "Desde" no puede ser mayor que "Hasta".');
      return;
    }

    try {
      const data = await fetchSalesReport(desde, hasta);
      if (!data || !data.ok) {
        alert('Error en el reporte: ' + (data && data.error ? data.error : 'desconocido'));
        if (repAvDebugPre) {
          repAvDebugPre.textContent = JSON.stringify(data, null, 2);
        }
        return;
      }
      renderSalesReport(data);
    } catch (err) {
      console.error(err);
      alert('Error al cargar el reporte avanzado. Revisa la consola.');
    }
  });
}

// Listener del formulario de reportes avanzados de COMPRAS
if (formReportesCompras && repCompDesde && repCompHasta) {
  // Prellenar: últimos 7 días también
  const hoy = new Date();
  const hastaISO = hoy.toISOString().slice(0, 10);
  const dDesde = new Date(hoy);
  dDesde.setDate(dDesde.getDate() - 7);
  const desdeISO = dDesde.toISOString().slice(0, 10);

  if (!repCompDesde.value) repCompDesde.value = desdeISO;
  if (!repCompHasta.value) repCompHasta.value = hastaISO;

  formReportesCompras.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const desde = repCompDesde.value || '';
    const hasta = repCompHasta.value || '';

    if (!desde || !hasta) {
      alert('Debes indicar una fecha "Desde" y "Hasta" para compras.');
      return;
    }
    if (desde > hasta) {
      alert('La fecha "Desde" no puede ser mayor que "Hasta".');
      return;
    }

    try {
      const data = await fetchPurchasesReport(desde, hasta);
      if (!data || !data.ok) {
        alert('Error en el reporte de compras: ' + (data && data.error ? data.error : 'desconocido'));
        if (repCompDebugPre) {
          repCompDebugPre.textContent = JSON.stringify(data, null, 2);
        }
        return;
      }
      renderPurchasesReport(data);
    } catch (err) {
      console.error(err);
      alert('Error al cargar el reporte de compras. Revisa la consola.');
    }
  });
}
// ===================================================
//                  DASHBOARD PRINCIPAL
// ===================================================
async function cargarDashboard() {
  try {
    // 1. KPIs generales
    const stats = await getWithToken("dashboard_stats", {});
    console.log("dashboard_stats:", stats); // opcional para ver el JSON

    if (stats && stats.ok) {
      // Soporta la estructura actual {ventas_hoy, ventas_mes, ...}
      // y una futura estructura anidada en stats.kpi (por si luego la cambiamos)
      const src = stats.kpi || stats;

      const ventasHoy       = src.ventas_hoy ?? src.hoy ?? 0;
      const ventasMes       = src.ventas_mes ?? src.mes ?? 0;
      const stockBajo       = src.stock_bajo ?? 0;
      const inventarioTotal = src.inventario_total ?? 0;

      document.getElementById("kpiHoy").textContent        = formatQ(ventasHoy);
      document.getElementById("kpiMes").textContent        = formatQ(ventasMes);
      document.getElementById("kpiStockBajo").textContent  = formatEntero(stockBajo);
      document.getElementById("kpiInventario").textContent = formatQ(inventarioTotal);
    } else {
      console.warn("dashboard_stats sin datos válidos:", stats);
    }

    // 2. Últimos 7 días
    const ult7 = await getWithToken("dashboard_last7", {});
    if (ult7 && ult7.ok) {
      renderChartUltimos7(ult7.data || []);
    }

    // 3. Últimas ventas
    const last = await getWithToken("dashboard_last_sales", {});
    renderUltimasVentas(last && last.ok ? last.ventas : []);
  }
  catch (err) {
    console.error("Error en dashboard:", err);
  }
}

function renderUltimasVentas(lista) {
  const tbody = document.getElementById("dashLastSalesBody");
  tbody.innerHTML = "";
  console.log("Ultimas ventas desde API:", lista);  // 👀
  if (!lista || !lista.length) {
    tbody.innerHTML = `<tr><td colspan="4">Sin ventas recientes</td></tr>`;
    return;
  }

  lista.forEach(v => {
    const fechaHora =
      (v.fecha ? `${v.fecha} ${v.hora || ""}` : (v.hora || ""));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fechaHora}</td>
      <td>${v.cliente || ""}</td>
      <td>${v.tipo_venta || ""}</td>
      <td style="text-align:right;">${formatQ(v.total_neto ?? v.total)}</td>
    `;
    tbody.appendChild(tr);
  });
}


let chartUltimos7 = null;

function renderChartUltimos7(data) {
  const labels  = data.map(d => d.fecha);
  const valores = data.map(d => d.total);

  const canvas = document.getElementById("chart-ventas-7d");
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");

  if (chartUltimos7) {
    chartUltimos7.destroy();
  }

  chartUltimos7 = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Ventas (Q)",
        data: valores,
        borderWidth: 2,
        pointRadius: 4,
        pointHitRadius: 8
      }]
    },
    options: {
      responsive: true,
      tension: 0.3,
      scales: {
        y: {
          ticks: {
            callback: (value) => formatQ(value)
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `Ventas: ${formatQ(ctx.parsed.y)}`
          }
        },
        legend: {
          display: true
        }
      }
    }
  });
}



// Llamar dashboard al abrir la pestaña Inicio
document.querySelector('[data-tab="dashboard"]')
  .addEventListener("click", cargarDashboard);

// Carga inicial al iniciar sesión
setTimeout(cargarDashboard, 800);

// ===============================================
//    CONTROL DE TAB INICIAL SEGÚN ROLES
// ===============================================

// Esta función será llamada desde auth.js cuando
// ya conozcamos los roles del usuario.
window.activarTabInicial = function(roles) {
  if (!Array.isArray(roles)) return;

  const tabs = Array.from(document.querySelectorAll('.tab'));

  let tabSeleccionado = null;

  // 1) Si el usuario es admin → Dashboard
  if (roles.includes('admin')) {
    tabSeleccionado = tabs.find(btn => btn.dataset.tab === 'dashboard');
  }

  // 2) Si no es admin → primer tab permitido según data-roles
  if (!tabSeleccionado) {
    tabSeleccionado = tabs.find(btn => {
      const allowed = (btn.dataset.roles || '')
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);
      return roles.some(r => allowed.includes(r));
    });
  }

  if (!tabSeleccionado) return;

  const tabName = tabSeleccionado.dataset.tab;

  // Activar el tab correcto
  tabs.forEach(btn => {
    btn.classList.toggle('active', btn === tabSeleccionado);
  });

  // Activar solo el panel correspondiente
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabName);
  });

  // Si es el dashboard, cargarlo
  if (tabName === 'dashboard') {
    setTimeout(cargarDashboard, 300);
  }
};

// ===================================================
//                  PAGOS / CXC
// ===================================================
const btnCxcRefresh = document.getElementById('btnCxcRefresh');
const cxcBody       = document.getElementById('cxcBody');

const formPago      = document.getElementById('formPago');
const respPago      = document.getElementById('respPago');
const btnPagoBuscarVenta = document.getElementById('btnPagoBuscarVenta');
const pagoVentaInfo = document.getElementById('pagoVentaInfo');

const pagoIdVenta = document.getElementById('pagoIdVenta');
const pagoMonto   = document.getElementById('pagoMonto');
const pagoForma   = document.getElementById('pagoForma');
const pagoNotas   = document.getElementById('pagoNotas');

const cxcVentasBox     = document.getElementById('cxcVentasBox');
const cxcClienteTitulo = document.getElementById('cxcClienteTitulo');
const cxcVentasBody    = document.getElementById('cxcVentasBody');

const formReportePagos = document.getElementById('formReportePagos');
const repPagosDesde    = document.getElementById('repPagosDesde');
const repPagosHasta    = document.getElementById('repPagosHasta');
const repPagosWrapper  = document.getElementById('repPagosWrapper');
const repPagosTotales  = document.getElementById('repPagosTotales');
const repPagosBody     = document.getElementById('repPagosBody');
const repPagosDebug    = document.getElementById('repPagosDebug');


let cxcClientesCache = [];   // guardamos lo que devuelve cxc_list
let cxcClienteSel = null;    // cliente seleccionado

let ventaSeleccionadaPago = null;

function renderReportePagos(data) {
  if (!repPagosWrapper) return;
  repPagosWrapper.style.display = 'block';

  // Totales
  if (repPagosTotales) {
    const t = data.totales || {};
    repPagosTotales.innerHTML = `
      <div class="card">
        <div class="card-label">Pagos</div>
        <div class="card-value">${formatEntero(t.pagos || 0)}</div>
      </div>
      <div class="card">
        <div class="card-label">Monto total</div>
        <div class="card-value">${formatQ(t.monto_total || 0)}</div>
      </div>
    `;
  }

  // Tabla
  if (repPagosBody) {
    repPagosBody.innerHTML = '';
    const pagos = data.pagos || [];

    pagos.forEach(p => {
      const f = p.fecha ? new Date(p.fecha) : null;
      const fechaTxt = f && !isNaN(f.getTime())
        ? f.toISOString().replace('T',' ').slice(0,19)
        : (p.fecha || '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fechaTxt}</td>
        <td>${p.id_venta || ''}</td>
        <td>${p.cliente || p.id_cliente || ''}</td>
        <td>${p.forma_pago || ''}</td>
        <td style="text-align:right;">${formatQ(p.monto || 0)}</td>
        <td>${p.usuario || ''}</td>
        <td>${p.notas || ''}</td>
      `;
      repPagosBody.appendChild(tr);
    });

    if (!pagos.length) {
      repPagosBody.innerHTML = `<tr><td colspan="7"><i>No hay pagos en este rango.</i></td></tr>`;
    }
  }

  if (repPagosDebug) repPagosDebug.textContent = JSON.stringify(data, null, 2);
}

if (formReportePagos && repPagosDesde && repPagosHasta) {
  const hoy = new Date();
  const hastaISO = hoy.toISOString().slice(0,10);
  const dDesde = new Date(hoy);
  dDesde.setDate(dDesde.getDate() - 7);
  const desdeISO = dDesde.toISOString().slice(0,10);

  if (!repPagosDesde.value) repPagosDesde.value = desdeISO;
  if (!repPagosHasta.value) repPagosHasta.value = hastaISO;

  formReportePagos.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const desde = repPagosDesde.value || '';
    const hasta = repPagosHasta.value || '';
    if (!desde || !hasta) return alert('Indica Desde y Hasta.');
    if (desde > hasta)    return alert('"Desde" no puede ser mayor que "Hasta".');

    const data = await getWithToken('payments_report', { desde, hasta });
    if (!data || !data.ok) {
      alert('Error en el reporte de pagos.');
      if (repPagosDebug) repPagosDebug.textContent = JSON.stringify(data, null, 2);
      return;
    }
    renderReportePagos(data);
  });
}


async function cargarCxc() {
  if (!cxcBody) return;
  cxcBody.innerHTML = `<tr><td colspan="4">Cargando...</td></tr>`;

  const out = await getWithToken('cxc_list', {});
  if (!out || !out.ok) {
    cxcBody.innerHTML = `<tr><td colspan="4">Error: ${(out && out.error) ? out.error : 'desconocido'}</td></tr>`;
    return;
  }

  const lista = out.clientes || [];
  cxcClientesCache = lista; // ✅ cache

  // reset panel de ventas del cliente
  if (cxcVentasBox) cxcVentasBox.style.display = 'none';
  if (cxcVentasBody) cxcVentasBody.innerHTML = '';
  if (cxcClienteTitulo) cxcClienteTitulo.textContent = '';

  if (!lista.length) {
    cxcBody.innerHTML = `<tr><td colspan="4">No hay saldos pendientes 🎉</td></tr>`;
    return;
  }

  cxcBody.innerHTML = '';
  lista.forEach((c, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(idx);
    tr.style.cursor = 'pointer'; // 👈 indica que se puede clickear

    tr.innerHTML = `
      <td>${c.nombre || ''}</td>
      <td>${c.id_cliente || ''}</td>
      <td style="text-align:right;">${formatQ(c.saldo_total || 0)}</td>
      <td style="text-align:right;">${(c.ventas || []).length}</td>
    `;

    cxcBody.appendChild(tr);
  });
}


function renderVentasPendientesCliente(cliente){
  if (!cxcVentasBox || !cxcVentasBody || !cxcClienteTitulo) return;

  cxcClienteSel = cliente || null;

  const nombre = (cliente && cliente.nombre) ? cliente.nombre : '(Sin nombre)';
  const idc    = (cliente && cliente.id_cliente) ? cliente.id_cliente : '';

  cxcClienteTitulo.textContent = `Cliente: ${nombre}${idc ? ' — ' + idc : ''}`;

  const ventas = (cliente && Array.isArray(cliente.ventas)) ? cliente.ventas : [];
  const pendientes = ventas.filter(v => Number(v.saldo_pendiente || 0) > 0);

  cxcVentasBody.innerHTML = '';

  if (!pendientes.length) {
    cxcVentasBody.innerHTML = `<tr><td colspan="5" style="font-style:italic;">Este cliente no tiene ventas pendientes.</td></tr>`;
    cxcVentasBox.style.display = 'block';
    return;
  }

  pendientes.forEach(v => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.dataset.idVenta = v.id_venta || '';

    // Fecha puede venir como Date o string: lo mostramos simple
    const fechaTxt = (v.fecha instanceof Date)
      ? v.fecha.toISOString().slice(0,10)
      : (v.fecha ? String(v.fecha).slice(0, 19) : '');

    tr.innerHTML = `
      <td><strong>${v.id_venta || ''}</strong></td>
      <td>${fechaTxt}</td>
      <td style="text-align:right;">${formatQ(v.total_neto || 0)}</td>
      <td style="text-align:right;"><strong>${formatQ(v.saldo_pendiente || 0)}</strong></td>
      <td>${v.estado || ''}</td>
    `;

    // Click en la venta => llena el form de pago
    tr.addEventListener('click', () => {
      if (pagoIdVenta) pagoIdVenta.value = v.id_venta || '';
      if (pagoMonto)   pagoMonto.value   = Number(v.saldo_pendiente || 0).toFixed(2);

      // opcional: auto-buscar venta para mostrar caja info
      buscarVentaParaPago();
    });

    cxcVentasBody.appendChild(tr);
  });

  cxcVentasBox.style.display = 'block';
}

// Delegación: click en filas de clientes
if (cxcBody){
  cxcBody.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-index]');
    if (!tr) return;

    const idx = Number(tr.dataset.index);
    if (Number.isNaN(idx) || !cxcClientesCache[idx]) return;

    // resaltado simple
    cxcBody.querySelectorAll('tr').forEach(x => x.classList.remove('row-selected'));
    tr.classList.add('row-selected');

    renderVentasPendientesCliente(cxcClientesCache[idx]);
  });
}

async function buscarVentaParaPago() {
  if (!respPago || !pagoVentaInfo) return;
  respPago.textContent = '';
  pagoVentaInfo.textContent = '';

  const id = (pagoIdVenta.value || '').trim();
  if (!id) { alert('Ingresa el ID de la venta'); return; }

  const out = await getWithToken('sale_fetch', { id_venta: id });
  if (!out || !out.ok) {
    showResp(respPago, out || { ok:false, error:'Sin respuesta' });
    ventaSeleccionadaPago = null;
    return;
  }

  ventaSeleccionadaPago = out.venta;

  const v = out.venta || {};
  pagoVentaInfo.innerHTML = `
    <div style="padding:10px; border:1px solid #ddd; border-radius:10px; background:#fafafa;">
      <div><strong>Cliente:</strong> ${v.cliente || ''} (${v.id_cliente || ''})</div>
      <div><strong>Total neto:</strong> ${formatQ(v.total_neto || 0)}</div>
      <div><strong>Saldo pendiente:</strong> ${formatQ(v.saldo_pendiente || 0)}</div>
      <div><strong>Estado:</strong> ${v.estado || ''}</div>
    </div>
  `;

  // sugerir monto = saldo pendiente
  if (!pagoMonto.value) {
    pagoMonto.value = Number(v.saldo_pendiente || 0).toFixed(2);
  }
}

if (btnCxcRefresh) btnCxcRefresh.addEventListener('click', cargarCxc);
if (btnPagoBuscarVenta) btnPagoBuscarVenta.addEventListener('click', buscarVentaParaPago);

if (formPago) {
  formPago.addEventListener('submit', async (e) => {
    e.preventDefault();
    respPago.textContent = '';

    const id_venta = (pagoIdVenta.value || '').trim();
    const monto = Number(pagoMonto.value || 0);
    const forma_pago = (pagoForma.value || '').trim();
    const notas = (pagoNotas.value || '').trim();

    if (!id_venta) { alert('ID venta es obligatorio'); return; }
    if (!monto || monto <= 0) { alert('Monto debe ser mayor a 0'); return; }

    const payload = { id_venta, monto, forma_pago, notas };

    appendResp(respPago, { debug:'POST payment_register', payload });

    const out = await postJSONWithToken('payment_register', payload);
    showResp(respPago, out);

    if (out && out.ok) {
      alert(`Pago registrado.\nSaldo nuevo: Q ${Number(out.saldo_nuevo||0).toFixed(2)}\nEstado: ${out.estado}`);

      // refrescar venta + cxc
      await buscarVentaParaPago();
      await cargarCxc();
    }
  });
}

// Cargar CXC cuando se abra el tab Pagos
const tabPagos = document.querySelector('[data-tab="pagos"]');
if (tabPagos) {
  tabPagos.addEventListener('click', () => {
    setTimeout(cargarCxc, 200);
  });
}

// ===================================================
//           INVENTARIO (Vista rápida)
// ===================================================
let INV_CACHE = [];

function renderInventario(rows){
  const tb = document.getElementById('inventarioBody');
  const meta = document.getElementById('invMeta');
  if (!tb) return;

  tb.innerHTML = '';
  for (const it of rows){
      let margen = 0;
      if (it.precio_de_venta > 0) {
        margen = ((it.precio_de_venta - it.costo) / it.precio_de_venta) * 100;
      }

    // 🎨 Definir color según margen
    let color = 'green';
    if (margen < 0) color = '#8B0000';        // rojo oscuro (grave)
    else if (margen < 10) color = 'red';
    else if (margen < 20) color = 'orange';
    else if (margen < 35) color = '#2E8B57';  // verde medio
    else color = '#006400';                   // verde fuerte
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.id_del_articulo || ''}</td>
      <td>${it.nombre || ''}</td>
      <td style="text-align:right;">${formatEntero(it.cantidad)}</td>
      <td style="text-align:right;">${formatQ(it.costo)}</td>
      <td>Q ${Number(it.precio_de_venta || 0).toFixed(2)}</td>
      <td style="text-align:right; font-weight:600; color:${color};">
        ${margen.toFixed(2)}%
      </td>
    `;
    tb.appendChild(tr);
  }

  if (meta) meta.textContent = `Mostrando ${rows.length} producto(s).`;
}

async function loadInventario(){
  const respPre = document.getElementById('respInventario');
  const btnRef = document.getElementById('btnInventarioRefrescar');

  if (respPre) { respPre.style.display='none'; respPre.textContent=''; }

  const data = await getWithToken('inventory_list');
  if (!data || !data.ok){
    if (respPre){
      respPre.style.display='';
      respPre.textContent = JSON.stringify(data, null, 2);
    }
    throw new Error((data && data.error) ? data.error : 'Error cargando inventario');
  }

  INV_CACHE = data.rows || [];
  renderInventario(INV_CACHE);

  if (btnRef) btnRef.style.display = '';
}

function wireInventarioUI(){
  const btn = document.getElementById('btnInventarioVer');
  const btnRef = document.getElementById('btnInventarioRefrescar');
  const search = document.getElementById('invSearch');

  if (btn){
    btn.addEventListener('click', async ()=>{
      try { await loadInventario(); }
      catch(err){ alert('No se pudo cargar inventario: ' + (err.message || err)); }
    });
  }

  if (btnRef){
    btnRef.addEventListener('click', async ()=>{
      try { await loadInventario(); }
      catch(err){ alert('No se pudo refrescar inventario: ' + (err.message || err)); }
    });
  }

  if (search){
    search.addEventListener('input', ()=>{
      const q = (search.value || '').trim().toLowerCase();
      if (!q) return renderInventario(INV_CACHE);

      const filtered = INV_CACHE.filter(it=>{
        const id = String(it.id_del_articulo||'').toLowerCase();
        const nm = String(it.nombre||'').toLowerCase();
        return id.includes(q) || nm.includes(q);
      });
      renderInventario(filtered);
    });
  }
}

document.addEventListener('DOMContentLoaded', wireInventarioUI);
