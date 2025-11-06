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
//            FOTOS: upload + autoasignación
// ===================================================
document.getElementById('formFoto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respFoto');
  respEl.textContent = '';

  const form  = e.target;
  const id    = form.querySelector('[name="id_del_articulo"]').value.trim();
  const files = Array.from(form.querySelector('[name="file"]').files || []);
  if (!id)            { alert('Ingresa un id_del_articulo'); return; }
  if (!files.length)  { alert('Selecciona al menos un archivo'); return; }

  // URL con token en query (multipart no lo lee del body)
  const uploadUrl = apiUrlAuth('upload');

  const log = (obj) => {
    respEl.textContent += (respEl.textContent ? '\n\n' : '') +
      (typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  };

  const toBase64 = (f)=> new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload  = ()=> resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = ()=> reject(new Error('FileReader error'));
    fr.readAsDataURL(f);
  });

  // 1) Intento: multipart único
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
      const obj = await getWithToken('product_fetch', { id });
      log({ debug:'product_fetch', obj });
      return;
    }

    log({ warn: 'Multipart no marcó ok, se intentará fallback por archivo…' });
  }catch(err){
    log({ warn: 'Falló multipart, se intentará fallback por archivo…', error: String(err) });
  }

  // 2) Fallback: uno por uno urlencoded + token en body
  log({ debug: 'Intento #2: fallback urlencoded + base64' });

  for (let i=0; i<files.length; i++){
    const file = files[i];
    try{
      log({ debug: `[${i+1}/${files.length}] Subiendo ${file.name}` });

      const base64 = await toBase64(file);
      const body = new URLSearchParams({
        id_del_articulo: id,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64: base64,
        token: getToken() // <-- token en body urlencoded
      });

      const urlForFallback = apiBase() + (apiBase().includes('?') ? '&' : '?') + 'path=upload';
      const res = await fetch(urlForFallback, { method:'POST', body });
      const txt = await res.text();
      let up; try { up = JSON.parse(txt); } catch { up = { raw: txt, status: res.status }; }
      log({ debug: 'upload response (fallback)', file: file.name, up });

      await new Promise(r => setTimeout(r, 300));
    }catch(err){
      log({ error: 'TypeError: Failed to fetch', file: file.name, detail: String(err) });
    }
  }

  // 3) Verificación
  try{
    const obj = await getWithToken('product_fetch', { id });
    log({ debug:'product_fetch', obj });
  }catch(err){
    log({ error: 'No se pudo verificar product_fetch', detail: String(err) });
  }
});

// ===================================================
//              MOVIMIENTOS + RECIBO PDF
// ===================================================
document.getElementById('formMovimiento').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respMovimiento');
  respEl.textContent = '';

  const payload = Object.fromEntries(new FormData(e.target).entries());
  payload.cantidad = Number(payload.cantidad || 0);

  appendResp(respEl, { debug:'POST movement' });

  const out = await postWithToken('movement', payload);
  showResp(respEl, out);

  if(out && out.ok && payload.tipo==='salida' && out.id_movimiento){
    document.querySelector('#formRecibo [name="id_movimiento"]').value = out.id_movimiento;
  }
});

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
