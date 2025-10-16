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
  const obj = Object.fromEntries(fd.entries());
  // Limpia campos vacíos
  Object.keys(obj).forEach(k=> (obj[k]==='' ? delete obj[k] : 0));
  const url = apiBase() + '?path=product_upsert';
  const out = await fetchJSON(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) });
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
  const fd = new FormData(e.target);
  const id = fd.get('id_del_articulo');
  const url = apiBase() + '?path=upload';
  const res = await fetch(url, { method:'POST', body: fd });
  const txt = await res.text();
  let data; try{ data = JSON.parse(txt); } catch { data = { raw: txt }; }
  showResp(document.getElementById('respFoto'), data);
  if(data && data.ok && data.publicUrl){
    // Asigna al producto como image_url
    const upsertUrl = apiBase() + '?path=product_upsert';
    const out = await fetchJSON(upsertUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id_del_articulo:id, image_url: data.publicUrl }) });
    const log = document.getElementById('respFoto');
    log.textContent += "\n\nAsignado a image_url:\n" + JSON.stringify(out, null, 2);
  }
});

// Movimientos y recibo
document.getElementById('formMovimiento').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const obj = Object.fromEntries(fd.entries());
  obj.cantidad = Number(obj.cantidad || 0);
  const url = apiBase() + '?path=movement';
  const out = await fetchJSON(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) });
  showResp(document.getElementById('respMovimiento'), out);
  if(out && out.ok && obj.tipo==='salida' && out.id_movimiento){
    // Autocompletar id en formulario de recibo
    document.querySelector('#formRecibo [name="id_movimiento"]').value = out.id_movimiento;
  }
});

document.getElementById('formRecibo').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = new FormData(e.target).get('id_movimiento');
  const url = apiBase() + '?path=receipt&id=' + encodeURIComponent(id);
  const out = await fetchJSON(url);
  showResp(document.getElementById('respRecibo'), out);
  if(out && out.ok && out.url){
    window.open(out.url, '_blank');
  }
});
