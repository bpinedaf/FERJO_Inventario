
/* FERJO Cotizaciones - módulo aislado, no invoca sale_register */
(function(){
"use strict";
const $=id=>document.getElementById(id), money=n=>'Q '+(Number(n)||0).toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
const state={id:"",version:0,items:[],products:[],history:[],status:"BORRADOR"};
function warn(message,error=false){const e=$('cotAviso');e.textContent=String(message);e.className='cot-aviso '+(error?'error':'ok');}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function round(v){return Math.round((num(v)+Number.EPSILON)*100)/100;}
async function request(path,body=null,params={}){
  if(typeof ensureFreshToken_==='function')await ensureFreshToken_();
  const token=typeof getToken==='function'?getToken():'';
  if(!token)throw Error('Inicia sesión para utilizar Cotizaciones.');
  const base=typeof apiBase==='function'?apiBase():'';
  if(!base)throw Error('Configura la URL de la API.');
  const url=base+(base.includes('?')?'&':'?')+new URLSearchParams({path,...params,...(body===null?{token}:{})});
  let res;
  if(body===null){res=await fetch(url,{cache:'no-store'});}
  else{res=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,token})});}
  if(!res.ok)throw Error('Error HTTP '+res.status);
  const data=await res.json();
  if(!data.ok)throw Error(data.error||'No se completó la operación');
  return data;
}
function summary(){
 const sub=round(state.items.reduce((s,x)=>s+round(x.cantidad*x.precio_unitario),0));
 const pct=Math.min(100,Math.max(0,num($('cotDescuento').value)));
 const discount=round(sub*pct/100);
 $('cotSubtotal').textContent=money(sub);
 $('cotDescuentoMonto').textContent=money(discount);
 $('cotTotal').textContent=money(round(sub-discount));
}
function renderItems(){
 const el=$('cotItems');
 if(!state.items.length){el.innerHTML='<tr><td colspan="5">Agrega artículos para comenzar.</td></tr>';summary();return;}
 el.innerHTML=state.items.map((it,i)=>'<tr><td><strong>'+esc(it.nombre)+'</strong><br><small>'+esc(it.id_del_articulo)+' · Existencia: '+esc(it.existencia)+'</small></td><td><input type="number" min="0.001" step="0.001" data-idx="'+i+'" data-k="cantidad" value="'+esc(it.cantidad)+'"></td><td><input type="number" min="0" step="0.01" data-idx="'+i+'" data-k="precio_unitario" value="'+esc(it.precio_unitario)+'"></td><td>'+money(round(it.cantidad*it.precio_unitario))+'</td><td><button type="button" data-remove="'+i+'" class="btn-secondary" aria-label="Quitar artículo">×</button></td></tr>').join('');
 el.querySelectorAll('input[data-idx]').forEach(input=>input.addEventListener('change',()=>{
 const it=state.items[Number(input.dataset.idx)],n=num(input.value);
 if(input.dataset.k==='cantidad'&&n<=0){warn('La cantidad debe ser mayor que cero.',true);renderItems();return;}
 if(n<0){warn('No se permiten precios negativos.',true);renderItems();return;}
 it[input.dataset.k]=n;renderItems();
 }));
 el.querySelectorAll('button[data-remove]').forEach(b=>b.addEventListener('click',()=>{state.items.splice(Number(b.dataset.remove),1);renderItems();}));
 summary();
}
function addProduct(p){
 const id=String(p.id_del_articulo);
 const existing=state.items.find(x=>String(x.id_del_articulo)===id);
 if(existing)existing.cantidad=round(existing.cantidad+1);
 else state.items.push({id_del_articulo:id,nombre:p.nombre,cantidad:1,precio_unitario:round(p.precio_de_venta),precio_sugerido:round(p.precio_de_venta),existencia:num(p.cantidad)});
 renderItems();
 if(num(p.cantidad)<=0)warn('El artículo no tiene existencias actualmente. La cotización se puede emitir, pero no reserva inventario.');
}
function drawResults(){
 const q=$('cotBuscar').value.trim().toLowerCase();
 const matches=state.products.filter(p=>!q||String(p.id_del_articulo).toLowerCase().includes(q)||String(p.nombre).toLowerCase().includes(q)).slice(0,30);
 const el=$('cotResultados');
 el.innerHTML=matches.length?matches.map((p,i)=>'<div class="cot-result"><div><strong>'+esc(p.nombre)+'</strong><small>'+esc(p.id_del_articulo)+' · '+money(p.precio_de_venta)+' · Existencia: '+esc(p.cantidad)+'</small></div><button type="button" data-add="'+i+'">Agregar</button></div>').join(''):'No se encontraron artículos.';
 el.querySelectorAll('button[data-add]').forEach(btn=>btn.addEventListener('click',()=>addProduct(matches[Number(btn.dataset.add)])));
}
function newQuotation(){
 state.id='';state.version=0;state.status='BORRADOR';state.items=[];
 ['cotCliente','cotTelefono','cotEmail','cotNit','cotNotas'].forEach(k=>$(k).value='');
 $('cotVigencia').value=15;$('cotPago').value='A convenir';$('cotEntrega').value='Según disponibilidad';$('cotDescuento').value=0;
 $('cotNumero').textContent='Nueva cotización';$('cotPdf').disabled=true;renderItems();warn('Nueva cotización lista para editar.');
}
function payload(){
 if(!$('cotCliente').value.trim())throw Error('Indica el nombre del cliente.');
 if(!state.items.length)throw Error('Agrega al menos un producto.');
 for(const x of state.items)if(!(x.cantidad>0)||x.precio_unitario<0||!Number.isFinite(x.cantidad)||!Number.isFinite(x.precio_unitario))throw Error('Revisa cantidades y precios.');
 return {
 id_cotizacion:state.id,version:state.version,cliente_nombre:$('cotCliente').value.trim(),
 cliente_telefono:$('cotTelefono').value.trim(),cliente_email:$('cotEmail').value.trim(),cliente_nit:$('cotNit').value.trim(),
 vigencia_dias:num($('cotVigencia').value),forma_pago:$('cotPago').value.trim(),entrega:$('cotEntrega').value.trim(),
 descuento_porcentaje:num($('cotDescuento').value),notas:$('cotNotas').value.trim(),
 items:state.items.map(x=>({id_del_articulo:x.id_del_articulo,cantidad:x.cantidad,precio_unitario:x.precio_unitario})),
 request_id: (window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+Math.random()
 };
}
async function save(){
 const btn=$('cotGuardar');btn.disabled=true;
 try{const r=await request('quotation_save',payload());state.id=r.id_cotizacion;state.version=r.version;state.status=r.estado;
 $('cotNumero').textContent=r.id_cotizacion+' · '+r.estado;$('cotPdf').disabled=false;
 warn('Cotización '+r.id_cotizacion+' guardada. Total: '+money(r.total_neto));await loadHistory();
 }catch(e){warn(e.message,true);}finally{btn.disabled=false;}
}
async function loadProducts(){
 try{const r=await request('quotation_products',null,{q:''});state.products=r.products||[];drawResults();}
 catch(e){warn('No se pudo cargar el inventario: '+e.message,true);}
}
async function loadHistory(){
 try{const r=await request('quotation_list');state.history=r.cotizaciones||[];drawHistory();}
 catch(e){warn('No se pudo cargar el historial: '+e.message,true);}
}
function drawHistory(){
 const q=$('cotFiltro').value.trim().toLowerCase();
 const rows=state.history.filter(x=>!q||String(x.id_cotizacion).toLowerCase().includes(q)||String(x.cliente_nombre).toLowerCase().includes(q));
 $('cotHistorial').innerHTML=rows.length?rows.map((x,i)=>'<tr><td>'+esc(x.id_cotizacion)+'</td><td>'+esc(x.fecha)+'</td><td>'+esc(x.cliente_nombre)+'</td><td>'+esc(x.estado)+'</td><td>'+money(x.total_neto)+'</td><td><button type="button" data-open="'+i+'" class="btn-secondary">Abrir</button></td></tr>').join(''):'<tr><td colspan="6">Sin cotizaciones para mostrar.</td></tr>';
 $('cotHistorial').querySelectorAll('button[data-open]').forEach(b=>b.addEventListener('click',()=>openQuotation(rows[Number(b.dataset.open)].id_cotizacion)));
}
async function openQuotation(id){
 try{
 const r=await request('quotation_get',null,{id_cotizacion:id}),q=r.cotizacion;
 state.id=q.id_cotizacion;state.version=num(q.version);state.status=q.estado;
 const mapping={cotCliente:'cliente_nombre',cotTelefono:'cliente_telefono',cotEmail:'cliente_email',cotNit:'cliente_nit',cotVigencia:'vigencia_dias',cotPago:'forma_pago',cotEntrega:'entrega',cotNotas:'notas',cotDescuento:'descuento_porcentaje'};
 Object.keys(mapping).forEach(k=>$(k).value=q[mapping[k]]??'');
 state.items=(r.detalle||[]).map(x=>({...x,existencia:state.products.find(p=>String(p.id_del_articulo)===String(x.id_del_articulo))?.cantidad??'?'}));
 $('cotNumero').textContent=state.id+' · '+state.status;$('cotPdf').disabled=false;renderItems();warn('Cotización cargada. Puedes editar y guardar una nueva versión.');$('cotizaciones').scrollIntoView({behavior:'smooth'});
 }catch(e){warn(e.message,true);}
}
async function makePdf(){
 if(!state.id)return warn('Guarda la cotización antes de generar PDF.',true);
 const btn=$('cotPdf');btn.disabled=true;
 try{const r=await request('quotation_pdf',{id_cotizacion:state.id});warn('PDF generado correctamente.');if(r.doc_url)window.open(r.doc_url,'_blank','noopener');await loadHistory();}
 catch(e){warn('Error al generar PDF: '+e.message,true);}
 finally{btn.disabled=false;}
}
function init(){
 if(!$('cotizaciones'))return;
 $('cotNueva').addEventListener('click',newQuotation);
 $('cotGuardar').addEventListener('click',save);
 $('cotPdf').addEventListener('click',makePdf);
 $('cotActualizar').addEventListener('click',()=>{loadProducts();loadHistory();});
 $('cotBuscarBtn').addEventListener('click',drawResults);
 $('cotBuscar').addEventListener('input',drawResults);
 $('cotFiltrar').addEventListener('click',drawHistory);
 $('cotFiltro').addEventListener('input',drawHistory);
 $('cotDescuento').addEventListener('input',summary);
 document.querySelector('[data-tab="cotizaciones"]')?.addEventListener('click',()=>{if(!state.products.length)loadProducts();loadHistory();});
 newQuotation();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
