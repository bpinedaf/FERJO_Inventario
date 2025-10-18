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
document.getElementById('formFoto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respFoto');
  respEl.textContent = '';

  const form = e.target;
  const id   = form.querySelector('[name="id_del_articulo"]').value.trim();
  const file = form.querySelector('[name="file"]').files[0];
  if(!file){ alert('Selecciona un archivo'); return; }

  // Lee archivo como base64 (solo la parte después de la coma)
  const toBase64 = (f)=> new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload  = ()=> resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = ()=> reject(new Error('FileReader error'));
    fr.readAsDataURL(f);
  });

  try{
    const base64 = await toBase64(file);

    // 1) POST form-encoded al GAS (no añadimos headers → el navegador pone x-www-form-urlencoded)
    const uploadUrl = apiUrlWithPath('upload');
    const body = new URLSearchParams({
      id_del_articulo: id,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64: base64
    });

    // Log visible
    respEl.textContent = JSON.stringify({ debug: 'POST upload (form-encoded)', uploadUrl }, null, 2);

    const res = await fetch(uploadUrl, { method:'POST', body }); // simple request → sin preflight
    const txt = await res.text();
    let up; try { up = JSON.parse(txt); } catch { up = { raw: txt, status: res.status }; }
    // Mostramos lo que respondió (si el CORS permite; si no, vendrá vacío y no pasa nada)
    respEl.textContent += "\n\n" + JSON.stringify({ debug:'upload response', up }, null, 2);

    // 2) Verificar que ya esté el image_url en la hoja
    const checkUrl = apiUrlWithPath('product_fetch', { id });
    const ver = await fetch(checkUrl).then(r=>r.text());
    let obj; try { obj = JSON.parse(ver); } catch { obj = { raw: ver }; }
    respEl.textContent += "\n\n" + JSON.stringify({ debug:'product_fetch', obj }, null, 2);

  } catch(err){
    respEl.textContent = JSON.stringify({ error: String(err) }, null, 2);
  }
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
