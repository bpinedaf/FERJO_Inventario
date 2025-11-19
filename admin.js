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

// Helpers que usan auth.js si está disponible; si no, hacen fallback manual
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
// -------- Movimientos y recibo --------
// ===================================================
//              MOVIMIENTOS + RECIBO PDF
// ===================================================
// -------- Movimientos (usa postWithToken) --------
document.getElementById('formMovimiento').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respMovimiento');
  respEl.textContent = '';

  // Tomar los valores del form como objeto plano
  const fd   = new FormData(e.target);
  const raw  = Object.fromEntries(fd.entries());

  // Mapear operación de negocio -> tipo de movimiento para el backend
  const operacion = raw.operacion || 'venta';
  let tipo = 'salida';               // por defecto, venta = salida de inventario
  if (operacion === 'compra') tipo = 'ingreso';
  else if (operacion === 'ajuste') tipo = 'ajuste';
  raw.tipo = tipo;

  // Normalizar numéricos
  raw.cantidad = Number(raw.cantidad || 0) || 0;
  if (raw.precio_unitario) {
    raw.precio_unitario = Number(raw.precio_unitario) || 0;
  }
  if (raw.costo_unitario) {
    raw.costo_unitario = Number(raw.costo_unitario) || 0;
  }

  // Validaciones mínimas
  if (!raw.id_del_articulo) {
    alert('Ingresa un id_del_articulo');
    return;
  }
  if (!raw.cantidad) {
    alert('La cantidad debe ser distinta de 0');
    return;
  }

  appendResp(respEl, { debug:'POST movement', payload: raw });

  // Enviar al backend usando el helper con token
  const out = await postWithToken('movement', raw);
  showResp(respEl, out);

  // Si fue una venta (salida) y se creó movimiento, proponemos el ID para el recibo
  if(out && out.ok && tipo === 'salida' && out.id_movimiento){
    const recForm = document.querySelector('#formRecibo [name="id_movimiento"]');
    if (recForm) recForm.value = out.id_movimiento;
  }
});
// ===================================================
//  BÚSQUEDA RÁPIDA DE PRODUCTO EN "MOVIMIENTOS"
//  - Escribir código y presionar Enter
//  - Autollenar nombre y precio de venta
// ===================================================
(function setupMovimientoLookup(){
  const formMov = document.getElementById('formMovimiento');
  if (!formMov) return;

  const inputId     = formMov.querySelector('[name="id_del_articulo"]');
  const inputCant   = formMov.querySelector('[name="cantidad"]');
  const inputPrecio = formMov.querySelector('[name="precio_unitario"]');
  const infoBox     = document.getElementById('movProductoInfo');

  if (!inputId) return;

  async function lookupProductoMovimiento(){
    const id = (inputId.value || '').trim();
    if (!id){
      if (infoBox) infoBox.textContent = '';
      return;
    }

    // Limpia mensaje previo
    if (infoBox) {
      infoBox.textContent = 'Buscando producto...';
    }

    // Llamar al mismo endpoint que usamos en Productos
    const data = await getWithToken('product_fetch', { id });

    if (!data || !data.ok || !data.product){
      if (infoBox) {
        infoBox.textContent = '⚠ Producto no encontrado para código: ' + id;
      }
      // No tocar precio si no se encontró
      return;
    }

    const p = data.product;

    // Autollenar precio de venta sugerido (editable)
    if (inputPrecio) {
      const precio = Number(p.precio_de_venta || 0) || 0;
      inputPrecio.value = precio ? precio : '';
    }

    // Si cantidad está vacía, asumir 1
    if (inputCant && (!inputCant.value || Number(inputCant.value) === 0)) {
      inputCant.value = 1;
    }

    // Mostrar info amigable en la banda de ayuda
    if (infoBox) {
      const precioTxt = p.precio_de_venta ? `Q${Number(p.precio_de_venta).toFixed(2)}` : '—';
      const stockTxt  = (p.cantidad !== undefined && p.cantidad !== null)
        ? String(p.cantidad)
        : 'N/D';

      infoBox.textContent =
        `Producto: ${p.id_del_articulo || id} · ${p.nombre || '(sin nombre)'} ` +
        `— Precio sugerido: ${precioTxt} — Stock: ${stockTxt}`;
    }
  }

  // Cuando se presiona Enter en el código, buscar producto
  inputId.addEventListener('keydown', (ev)=>{
    if (ev.key === 'Enter'){
      ev.preventDefault();
      lookupProductoMovimiento();
    }
  });

  // Opcional: al salir del campo también podemos intentar la búsqueda
  inputId.addEventListener('blur', ()=>{
    if ((inputId.value || '').trim()){
      lookupProductoMovimiento();
    }
  });
})();

// -------- Recibo PDF (sin cambios por ahora) --------
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

