// Tabs
document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.tab).classList.add('active');
  });
});

// API URL handling
const apiInput = document.getElementById('apiUrl');
const apiStatus = document.getElementById('apiStatus');
const saved = localStorage.getItem('FERJO_API_BASE') || (window.CONFIG && window.CONFIG.API) || '';
apiInput.value = saved || '';
function apiBase(){ return (apiInput.value || '').replace(/\/+$/,''); }

document.getElementById('saveApi').addEventListener('click', ()=>{
  localStorage.setItem('FERJO_API_BASE', apiInput.value.trim());
  apiStatus.textContent = 'Guardado';
  setTimeout(()=> apiStatus.textContent='', 1500);
});

// -------- Helpers --------
function apiUrlWithPath(path, extraParams = {}){
  const base = apiBase();                     // puede traer ?user_content_key=...&lib=...
  const sep  = base.includes('?') ? '&' : '?';
  const qs   = new URLSearchParams({ path, ...extraParams }).toString();
  return base + sep + qs;
}

function showResp(el, data){
  try {
    el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  } catch {
    el.textContent = String(data);
  }
}

function appendResp(el, data){
  const prev = el.textContent || '';
  const block = (typeof data === 'string') ? data : JSON.stringify(data, null, 2);
  el.textContent = (prev ? prev + "\n\n" : "") + block;
}

async function fetchJSON(url, opts={}){
  try{
    const res = await fetch(url, opts);
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return { raw: txt, status: res.status, ok: res.ok }; }
  }catch(err){
    // Mostramos el error de red
    return { error: String(err), url, opts: { method: opts.method } };
  }
}

// -------- Productos: upsert y fetch --------
document.getElementById('formProducto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respProducto');
  respEl.textContent = '';

  const fd = new FormData(e.target);
  for (const [k,v] of Array.from(fd.entries())) {
    if (v==='' || v==null) fd.delete(k);
  }

  const url = apiUrlWithPath('product_upsert');
  appendResp(respEl, { debug:'POST product_upsert', url });

  const out = await fetchJSON(url, { method:'POST', body: fd });
  showResp(respEl, out);
});

document.getElementById('cargarProducto').addEventListener('click', async ()=>{
  const respEl = document.getElementById('respProducto');
  respEl.textContent = '';

  const id = document.querySelector('#formProducto [name="id_del_articulo"]').value.trim();
  if(!id){ alert('Ingresa un id_del_articulo'); return; }
  const url = apiUrlWithPath('product_fetch', { id });
  appendResp(respEl, { debug:'GET product_fetch', url });

  const data = await fetchJSON(url);
  showResp(respEl, data);
  if(data && data.product){
    const f = document.getElementById('formProducto');
    for(const k in data.product){
      const el = f.querySelector(`[name="${k}"]`);
      if(el) el.value = data.product[k];
    }
  }
});

// -------- Fotos: upload y asignar a producto --------
// -------- Fotos: upload y asignar a producto (sin preflight) --------
// -------- Fotos: upload y asignar a producto (no-cors + refresh) --------
// -------- Fotos: upload por FORM cross-origin + verificación --------
// -------- Fotos: upload con x-www-form-urlencoded (sin CORS) --------
// -------- Fotos: upload múltiple (secuencial) y asignación automática --------
document.getElementById('formFoto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respFoto');
  respEl.textContent = '';

  const form  = e.target;
  const id    = form.querySelector('[name="id_del_articulo"]').value.trim();
  const files = Array.from(form.querySelector('[name="file"]').files || []);
  if(!id){ alert('Ingresa un id_del_articulo'); return; }
  if(files.length===0){ alert('Selecciona al menos una imagen'); return; }

  // Convierte a base64 (solo la parte después de la coma)
  const toBase64 = (f)=> new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload  = ()=> resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = ()=> reject(new Error('FileReader error'));
    fr.readAsDataURL(f);
  });

  // Subimos en serie para no saturar Apps Script
  let i = 0;
  for(const file of files){
    i++;
    appendResp(respEl, { debug:`[${i}/${files.length}] Subiendo ${file.name}` });

    try{
      const base64 = await toBase64(file);

      // POST application/x-www-form-urlencoded (sin preflight) → evita CORS
      const uploadUrl = apiUrlWithPath('upload');
      const body = new URLSearchParams({
        id_del_articulo: id,          // ← indispensable para que el backend asigne el slot
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64: base64
      });

      const res = await fetch(uploadUrl, { method:'POST', body });
      const txt = await res.text();
      let up; try { up = JSON.parse(txt); } catch { up = { raw: txt, status: res.status }; }

      appendResp(respEl, { debug:'upload response', up });

      if(up && up.ok && up.assigned){
        appendResp(respEl, { note:`Asignado en ${up.assigned.field}${up.assigned.replaced?' (reemplazada)':''}` });
      }
    }catch(err){
      appendResp(respEl, { error:String(err), file:file.name });
    }
  }

  // (opcional) refrescar datos del producto para ver que ya quedaron las URLs
  try{
    const checkUrl = apiUrlWithPath('product_fetch', { id });
    const ver = await fetch(checkUrl).then(r=>r.text());
    let obj; try { obj = JSON.parse(ver); } catch { obj = { raw: ver }; }
    appendResp(respEl, { debug:'product_fetch', obj });
  }catch{}
});



// -------- Movimientos y recibo --------
document.getElementById('formMovimiento').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respMovimiento');
  respEl.textContent = '';

  const fd = new FormData(e.target);
  fd.set('cantidad', Number(fd.get('cantidad') || 0));

  const url = apiUrlWithPath('movement');
  appendResp(respEl, { debug:'POST movement', url });

  const out = await fetchJSON(url, { method:'POST', body: fd });
  showResp(respEl, out);

  if(out && out.ok && fd.get('tipo')==='salida' && out.id_movimiento){
    document.querySelector('#formRecibo [name="id_movimiento"]').value = out.id_movimiento;
  }
});

document.getElementById('formRecibo').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respRecibo');
  respEl.textContent = '';

  const id = new FormData(e.target).get('id_movimiento');
  const url = apiUrlWithPath('receipt', { id });
  appendResp(respEl, { debug:'GET receipt', url });

  const out = await fetchJSON(url);
  showResp(respEl, out);
  if(out && out.ok && out.url){ window.open(out.url, '_blank'); }
});
