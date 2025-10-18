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
document.getElementById('formFoto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const respEl = document.getElementById('respFoto');
  respEl.textContent = '';

  const base = apiBase(); // deja en API URL el Web App (sirve con script.google.com o googleusercontent.com)
  const action = (base.includes('?') ? base + '&' : base + '?') + 'path=upload';

  const formUI = e.target;
  const id   = formUI.querySelector('[name="id_del_articulo"]').value.trim();
  const fileInput = formUI.querySelector('[name="file"]');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if(!file){ alert('Selecciona un archivo'); return; }

  // 1) Creamos (una sola vez) un iframe oculto como target del form
  let iframe = document.getElementById('gas_xfer_iframe');
  if(!iframe){
    iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.name = 'gas_xfer_iframe';
    iframe.id = 'gas_xfer_iframe';
    document.body.appendChild(iframe);
  }

  // 2) Construimos un <form> temporal (multipart) que apunte al Web App
  const realForm = document.createElement('form');
  realForm.action = action;
  realForm.method = 'POST';
  realForm.enctype = 'multipart/form-data';
  realForm.target = 'gas_xfer_iframe';
  realForm.style.display = 'none';

  // Campo hidden con el id_del_articulo (el backend ya lo sabe usar)
  const hid = document.createElement('input');
  hid.type = 'hidden';
  hid.name = 'id_del_articulo';
  hid.value = id;
  realForm.appendChild(hid);

  // 3) Movemos el input tipo file al form temporal (clonamos un placeholder para no perder el UI)
  const placeholder = fileInput.cloneNode();
  placeholder.value = ''; // limpio
  fileInput.parentNode.insertBefore(placeholder, fileInput);
  realForm.appendChild(fileInput);

  document.body.appendChild(realForm);

  // 4) Enviamos el formulario (cross-origin, sin CORS)
  try{
    // Nota: no podremos leer respuesta; el backend sube archivo y actualiza image_url
    realForm.submit();
    // Pequeño log
    respEl.textContent = JSON.stringify({ debug:'FORM submitted to GAS', action }, null, 2);
  } finally {
    // Restituimos el input file al formulario original y limpiamos el temporal
    placeholder.parentNode.replaceChild(fileInput, placeholder);
    document.body.removeChild(realForm);
  }

  // 5) Verificamos en la hoja tras un pequeño delay
  setTimeout(async ()=>{
    const url = (base.includes('?') ? base + '&' : base + '?') + new URLSearchParams({ path:'product_fetch', id }).toString();
    const res = await fetch(url).then(r=>r.text()).catch(err=>JSON.stringify({error:String(err)}));
    // intenta parsear
    let obj; try{ obj = JSON.parse(res); } catch { obj = { raw: res }; }
    respEl.textContent += "\n\n" + JSON.stringify({ debug:'product_fetch', obj }, null, 2);
  }, 1500); // si lo ves justo, súbelo a 2500ms
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
