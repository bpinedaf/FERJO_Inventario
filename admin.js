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

// 👉 Helper simple para formatear en Quetzales
function formatQ(num){
  const n = Number(num || 0);
  return 'Q ' + n.toFixed(2);
}

// ---------- Helpers de Autenticación ----------
function getToken(){
  return (window.AUTH && AUTH.token) || sessionStorage.getItem('FERJO_ID_TOKEN') || '';
}

// Construye URL incluyendo path y token en query (especial para multipart)
function apiUrlAuth(path, extraParams = {}){
  const base = apiBase();                         // puede traer ?user_content_key=...&lib=...
  const sep  = base.includes('?') ? '&' : '?';
  const params = { path, ...extraParams, token: getToken() };
  const qs   = new URLSearchParams(params).toString();
  return base + sep + qs;
}

// POST urlencoded + token (usa auth.js si está disponible)
async function postWithToken(path, payload={}){
  if (typeof window.postForm === 'function') {
    return await window.postForm(path, payload);      // usa auth.js (token en body)
  }
  // Fallback manual (urlencoded + token)
  const body = new URLSearchParams({ ...payload, token: getToken() });
  const url  = apiBase() + (apiBase().includes('?') ? '&' : '?') + 'path=' + encodeURIComponent(path);
  const res  = await fetch(url, { method:'POST', body });
  try{ return await res.json(); }catch{ return { ok:false, status:res.status, raw: await res.text() }; }
}

async function getWithToken(path, params={}){
  if (typeof window.getJSON === 'function') {
    return await window.getJSON(path, params);        // usa auth.js (token en query)
  }
  // Fallback manual (query + token)
  const url = apiUrlAuth(path, params);
  return await fetchJSON(url);
}

// Helper para POST JSON (ventas) SIN disparar preflight
async function postJSONWithToken(path, payload = {}) {
  const url  = apiUrlAuth(path);   // token en query
  const body = JSON.stringify(payload);  // sin headers personalizados

  try {
    const res = await fetch(url, {
      method: 'POST',
      body
    });
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      return { ok: false, raw: txt, status: res.status };
    }
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

  // Tomamos los campos y eliminamos vacíos
  const raw = Object.fromEntries(new FormData(e.target).entries());
  Object.keys(raw).forEach(k=>{ if(raw[k]==='' || raw[k]==null) delete raw[k]; });

  appendResp(respEl, { debug:'POST product_upsert' });

  const out = await postWithToken('product_upsert', raw);
  showResp(respEl, out);
});

document.getElementById('cargarProducto').addEventListener('click', async ()=>{
  const respEl = document.getElementById('respProducto');
  respEl.textContent = '';

  const id = document.querySelector('#formProducto [name="id_del_articulo"]').value.trim();
  if(!id){ alert('Ingresa un id_del_articulo'); return; }

  appendResp(respEl, { debug:'GET product_fetch', id });

  const data = await getWithToken('product_fetch', { id });
  showResp(respEl, data);

  if(data && data.product){
    const f = document.getElementById('formProducto');
    for(const k in data.product){
      const el = f.querySelector(`[name="${k}"]`);
      if(el) el.value = data.product[k];
    }
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
  let totalBruto = 0;
  let totalNeto  = 0;

  ventaItems.forEach(it=>{
    const bruto = it.cantidad * it.precio_sugerido;
    const neto  = it.cantidad * it.precio_unitario;
    totalBruto += bruto;
    totalNeto  += neto;
  });

  const totalDesc = totalBruto - totalNeto;

  spanTotalBruto.textContent = totalBruto.toFixed(2);
  spanTotalNeto.textContent  = totalNeto.toFixed(2);
  spanTotalDesc.textContent  = totalDesc.toFixed(2);
}

function resetVenta(){
  ventaItems = [];
  renderVentaItems();
  recomputeVentaTotals();
  respVenta.textContent = '';
  inputPagoInicialMonto.value = '';
  inputPagoInicialForma.value = '';
  selectPlazoDias.value       = '0';
  formVenta.querySelector('[name="notas"]').value = '';
  // No tocamos ventaDocUrlUltima para seguir viendo el último comprobante
}

// Ver comprobante de la última venta
if (btnVentaVerComprobante) {
  btnVentaVerComprobante.addEventListener('click', ()=>{
    if (ventaDocUrlUltima) {
      window.open(ventaDocUrlUltima, '_blank');
    }
  });
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

  if (pagoInicialMonto > 0){
    payload.pago_inicial = {
      monto: pagoInicialMonto,
      forma_pago: pagoInicialForma || ''
    };
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
//        RESUMEN DE VENTAS DEL DÍA (sales_summary)
// ===================================================
const formResumenVentas = document.getElementById('formResumenVentas');
const respResumenVentas = document.getElementById('respResumenVentas');

const totalesDiaBox    = document.getElementById('totales-dia');
const detalleVentasTbody = document.getElementById('detalle-ventas-body');
const resumenWrapper   = document.getElementById('resumenVentasWrapper');

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

// Llamada al endpoint (reutilizamos getWithToken)
async function fetchSalesReport(desde, hasta) {
  return await getWithToken('sales_report', { desde, hasta });
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
