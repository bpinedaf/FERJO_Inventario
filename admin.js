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
//    Helper: pie chart sencillo para el resumen diario
// ===================================================
function drawSimplePie(container, slices) {
  if (!container) return;

  // Normalizamos datos
  const data = (slices || []).map(s => ({
    label: s.label,
    valor: Number(s.valor) || 0
  }));

  const total = data.reduce((acc, s) => acc + s.valor, 0);

  // Limpiamos contenedor
  container.innerHTML = '';

  // Canvas + leyenda
  const canvas = document.createElement('canvas');
  canvas.width  = 260;
  canvas.height = 260;
  const legend = document.createElement('div');
  legend.className = 'pie-legend';

  container.appendChild(canvas);
  container.appendChild(legend);

  const ctx = canvas.getContext('2d');
  const cx  = canvas.width  / 2;
  const cy  = canvas.height / 2;
  const r   = Math.min(cx, cy) - 10;

  // Paleta simple (se reutiliza si hay más de 6 segmentos)
  const colors = [
    '#4e79a7', // azul
    '#f28e2b', // naranja
    '#e15759', // rojo
    '#76b7b2', // verde agua
    '#59a14f', // verde
    '#edc948'  // amarillo
  ];

  // Caso sin datos: círculo gris con texto "Sin datos"
  if (!total) {
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#555';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sin datos', cx, cy);

    legend.innerHTML = '<div class="pie-legend-item">Sin datos</div>';
    return;
  }

  // Dibujar slices
  let startAngle = -Math.PI / 2; // empezar arriba

  data.forEach((s, i) => {
    const angle = (s.valor / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const color = colors[i % colors.length];

    // Arco exterior
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    startAngle = endAngle;

    // Leyenda
    const pct = total ? (s.valor / total) * 100 : 0;
    const item = document.createElement('div');
    item.className = 'pie-legend-item';
    item.innerHTML = `
      <span class="pie-color" style="background:${color}"></span>
      <span class="pie-label">${s.label}:</span>
      <span class="pie-value">Q ${s.valor.toFixed(2)} (${pct.toFixed(1)}%)</span>
    `;
    legend.appendChild(item);
  });

  // Opcional: efecto "donut" (círculo blanco al centro)
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

// ===================================================
//        RESUMEN DE VENTAS DEL DÍA (sales_summary)
// ===================================================
const formResumenVentas = document.getElementById('formResumenVentas');
const respResumenVentas = document.getElementById('respResumenVentas');

if (formResumenVentas && respResumenVentas) {
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

      const t       = out.totales || {};
      const detalle = out.detalle_ventas || [];

      const totContado = Number(t.contado || 0);
      const totCredito = Number(t.credito || 0);
      const totCosto   = Number(t.costo_estimado || 0);
      const totGan     = Number(t.ganancia_estimada || 0);

      let html = '';

      // ---------- Totales del día (colapsable) ----------
      html += `
        <details class="resumen-section" open>
          <summary><strong>Totales del día (${out.fecha})</strong></summary>
          <ul>
            <li><strong>Total del día:</strong> Q ${Number(t.total_dia || 0).toFixed(2)}</li>
            <li><strong>Contado:</strong> Q ${totContado.toFixed(2)}</li>
            <li><strong>Crédito:</strong> Q ${totCredito.toFixed(2)}</li>
            <li><strong>Pagado hoy:</strong> Q ${Number(t.pagado_hoy || 0).toFixed(2)}</li>
            <li><strong>Saldo pendiente:</strong> Q ${Number(t.saldo_pendiente || 0).toFixed(2)}</li>
            <li><strong>Costo estimado:</strong> Q ${totCosto.toFixed(2)}</li>
            <li><strong>Ganancia estimada:</strong> Q ${totGan.toFixed(2)}</li>
          </ul>
        </details>
      `;

      // ---------- Gráficas (colapsable) ----------
      html += `
        <details class="resumen-section">
          <summary>Ver gráficas del día</summary>
          <div class="charts-row">
            <div class="chart-box">
              <h5>Ventas contado vs crédito</h5>
              <div id="chartContadoCredito"></div>
            </div>
            <div class="chart-box">
              <h5>Costo vs ganancia estimada</h5>
              <div id="chartCostoGanancia"></div>
            </div>
          </div>
        </details>
      `;

      // ---------- Detalle de ventas (colapsable) ----------
      html += `
        <details class="resumen-section">
          <summary>Ver detalle de ventas</summary>
      `;

      if (detalle.length) {
        detalle.forEach(v => {
          const items = Array.isArray(v.detalle_items) ? v.detalle_items : [];

          html += `
            <details class="venta-card">
              <summary>
                <div class="venta-summary">
                  <div class="venta-summary-left">
                    <div class="venta-id">${v.id_venta || ''}</div>
                    <div class="venta-cliente">${v.cliente || ''}</div>
                  </div>
                  <div class="venta-summary-right">
                    <span class="venta-tipo ${v.tipo_venta === 'credito' ? 'badge-credito' : 'badge-contado'}">
                      ${v.tipo_venta || ''}
                    </span>
                    <span class="venta-monto">Total: Q ${Number(v.total_neto || 0).toFixed(2)}</span>
                    <span class="venta-monto">Pagado: Q ${Number(v.pagado || 0).toFixed(2)}</span>
                    <span class="venta-monto">Saldo: Q ${Number(v.saldo || 0).toFixed(2)}</span>
                  </div>
                </div>
              </summary>
          `;

          if (items.length) {
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
          } else {
            html += `<p class="venta-sin-detalle">Sin detalle de artículos para esta venta.</p>`;
          }

          html += `</details>`;
        });
      } else {
        html += `<p>No hay ventas registradas para esta fecha.</p>`;
      }

      html += `</details>`; // cierra "Ver detalle de ventas"

      respResumenVentas.innerHTML = html;

      // ---------- Dibujar gráficas ----------
      const cont1 = document.getElementById('chartContadoCredito');
      const cont2 = document.getElementById('chartCostoGanancia');

      if (cont1) {
        drawSimplePie(cont1, [
          { label: 'Contado', valor: totContado },
          { label: 'Crédito', valor: totCredito }
        ]);
      }

      if (cont2) {
        drawSimplePie(cont2, [
          { label: 'Costo',    valor: totCosto },
          { label: 'Ganancia', valor: totGan }
        ]);
      }

    } catch (err) {
      showResp(respResumenVentas, { error: String(err) });
    }
  });
}
