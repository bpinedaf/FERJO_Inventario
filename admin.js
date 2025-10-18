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

// Helpers
function showResp(el, data){ el.textContent = JSON.stringify(data, null, 2); }
async function fetchJSON(url, opts={}){
  const res = await fetch(url, opts);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

// Productos: upsert y fetch
document.getElementById('formProducto').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);

  // elimina vacíos
  for (const [k,v] of Array.from(fd.entries())) {
    if (v==='' || v==null) fd.delete(k);
  }

  const url = apiBase() + '?path=product_upsert';
  // ¡sin headers! FormData evita preflight
  const out = await fetchJSON(url, { method:'POST', body: fd });
  showResp(document.getElementById('respProducto'), out);
});


document.getElementById('cargarProducto').addEventListener('click', async ()=>{
  const id = document.querySelector('#formProducto [name="id_del_articulo"]').value.trim();
  if(!id){ alert('Ingresa un id_del_articulo'); return; }
  const url = apiBase() + '?path=product_fetch&id=' + encodeURIComponent(id);
  const data = await fetchJSON(url);
  showResp(document.getElementById('respProducto'), data);
  if(data && data.product){
    const f = document.getElementById('formProducto');
    for(const k in data.product){
      const el = f.querySelector(`[name="${k}"]`);
      if(el) el.value = data.product[k];
    }
  }
});

// Fotos: upload y asignar a producto
document.getElementById('formFoto').addEventListener('submit', async (e)=>{
  e.preventDefault();

  const form = e.target;
  const id   = form.querySelector('[name="id_del_articulo"]').value.trim();
  const file = form.querySelector('[name="file"]').files[0];
  if(!file){ alert('Selecciona un archivo'); return; }

  // Construimos un FormData limpio y explícito
  const fd = new FormData();
  fd.append('file', file, file.name);            // ← nombre de campo EXACTAMENTE 'file'
  fd.append('id_del_articulo', id);              // ← opcional (por si quieres loguearlo luego)

  const uploadUrl = apiBase() + '?path=upload';
  const data = await fetchJSON(uploadUrl, { method:'POST', body: fd });
  showResp(document.getElementById('respFoto'), data);

  if(data && data.ok && data.publicUrl){
    const fd2 = new FormData();
    fd2.append('id_del_articulo', id);
    fd2.append('image_url', data.publicUrl);

    const upsertUrl = apiBase() + '?path=product_upsert';
    const out = await fetchJSON(upsertUrl, { method:'POST', body: fd2 });

    const log = document.getElementById('respFoto');
    log.textContent += "\n\nAsignado a image_url:\n" + JSON.stringify(out, null, 2);
  }
});

// Movimientos y recibo
document.getElementById('formMovimiento').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  // fuerza número
  fd.set('cantidad', Number(fd.get('cantidad') || 0));

  const url = apiBase() + '?path=movement';
  const out = await fetchJSON(url, { method:'POST', body: fd });
  showResp(document.getElementById('respMovimiento'), out);

  if(out && out.ok && fd.get('tipo')==='salida' && out.id_movimiento){
    document.querySelector('#formRecibo [name="id_movimiento"]').value = out.id_movimiento;
  }
});

document.getElementById('formRecibo').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = new FormData(e.target).get('id_movimiento');
  const url = apiBase() + '?path=receipt&id=' + encodeURIComponent(id);
  const out = await fetchJSON(url);
  showResp(document.getElementById('respRecibo'), out);
  if(out && out.ok && out.url){ window.open(out.url, '_blank'); }
});
