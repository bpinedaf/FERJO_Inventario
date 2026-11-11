
/* FERJO: módulo independiente de Cotizaciones.
 * Integración: añadir este archivo como Cotizaciones.gs al mismo proyecto Apps Script.
 * Añadir rutas quotation_* a doGet/doPost de Code.gs según README.
 * NO invoca saleRegister_, internalRegisterMovement_ ni modifica existencias/cobros.
 */
const COT_HEAD=['id_cotizacion','fecha','cliente_nombre','cliente_telefono','cliente_email','cliente_nit','vigencia_dias','fecha_vencimiento','forma_pago','entrega','descuento_porcentaje','subtotal','descuento_monto','total_neto','estado','usuario','notas','doc_url','version','created_at','updated_at'];
const COT_DET=['id_cotizacion','linea','id_del_articulo','nombre','cantidad','precio_sugerido','precio_unitario','descuento_unitario','subtotal','created_at'];
function cotMoney_(x){return Math.round((Number(x)+Number.EPSILON)*100)/100;}
function cotStr_(x,max){return String(x==null?'':x).trim().slice(0,max||500);}
function cotSheets_(){
 const ss=SpreadsheetApp.openById(CFG.SHEET_ID);
 let head=ss.getSheetByName('cotizaciones'),det=ss.getSheetByName('cotizaciones_detalle');
 if(!head) {head=ss.insertSheet('cotizaciones');head.appendRow(COT_HEAD);}
 if(!det){det=ss.insertSheet('cotizaciones_detalle');det.appendRow(COT_DET);}
 const h=head.getRange(1,1,1,head.getLastColumn()).getValues()[0],d=det.getRange(1,1,1,det.getLastColumn()).getValues()[0];
 if(COT_HEAD.some((x,i)=>h[i]!==x)||COT_DET.some((x,i)=>d[i]!==x))throw Error('Estructura de cotizaciones incompatible. No se realizaron cambios.');
 return {head,det};
}
function cotHeader_(head,row){
 const o={},tz=Session.getScriptTimeZone()||'America/Guatemala';
 head.forEach((x,i)=>{const v=row[i];o[x]=v instanceof Date?(x==='fecha'||x==='fecha_vencimiento'?Utilities.formatDate(v,tz,'yyyy-MM-dd'):v.toISOString()):v;});
 return o;
}
function cotRow_(head,obj){return head.map(k=>obj[k]===undefined?'':obj[k]);}
function cotFind_(sh,id){
 const v=sh.getDataRange().getValues();const h=v[0]||[],col=h.indexOf('id_cotizacion');
 for(let i=1;i<v.length;i++)if(String(v[i][col])===id)return {index:i+1,head:h,row:cotHeader_(h,v[i])};
 return null;
}
function cotCatalog_(){
 const sh=getSheet_(CFG.SH_PRODUCTS);if(!sh)throw Error('No existe Base_Inventario.');
 const values=sh.getDataRange().getValues();const head=values.shift()||[],idx=headIndex_(head);
 const col=f=>colFor_(idx,f);const cId=col('id_del_articulo'),cNom=col('nombre'),cPrice=col('precio_de_venta'),cQty=col('cantidad');
 if([cId,cNom,cPrice].some(x=>x===undefined))throw Error('Inventario sin columnas requeridas.');
 return values.filter(r=>cotStr_(r[cId])).map(r=>({id_del_articulo:cotStr_(r[cId],100),nombre:cotStr_(r[cNom],250),precio_de_venta:cotMoney_(r[cPrice]||0),cantidad:cQty===undefined?0:Number(r[cQty]||0)}));
}
function quotationProducts_(e){
 try{const ctx=requireAuth_(e);checkRole_(ctx,['ventas','inventario']);const q=cotStr_(e.parameter?.q,100).toLowerCase();
 const products=cotCatalog_().filter(p=>!q||p.id_del_articulo.toLowerCase().includes(q)||p.nombre.toLowerCase().includes(q)).slice(0,80);
 return jsonResponse({ok:true,products});}catch(err){return jsonResponse({ok:false,error:String(err.message||err)});}
}
function quotationList_(e){
 try{const ctx=requireAuth_(e);checkRole_(ctx,['ventas','inventario']);const {head}=cotSheets_();
 const vv=head.getDataRange().getValues();const hh=vv.shift()||[];
 const all=vv.filter(r=>r[0]).map(r=>cotHeader_(hh,r)).map(r=>({id_cotizacion:String(r.id_cotizacion),fecha:String(r.fecha),cliente_nombre:String(r.cliente_nombre),estado:String(r.estado),total_neto:Number(r.total_neto||0),doc_url:String(r.doc_url||'')}));
 all.sort((a,b)=>b.id_cotizacion.localeCompare(a.id_cotizacion));
 return jsonResponse({ok:true,cotizaciones:all.slice(0,500)});
 }catch(err){return jsonResponse({ok:false,error:String(err.message||err)});}
}
function quotationGet_(e){
 try{const ctx=requireAuth_(e);checkRole_(ctx,['ventas','inventario']);
 const id=cotStr_(e.parameter?.id_cotizacion||e.parameter?.id,100);if(!id)throw Error('Falta id_cotizacion');
 const {head,det}=cotSheets_();const found=cotFind_(head,id);if(!found)throw Error('Cotización no encontrada.');
 const rows=det.getDataRange().getValues(),hdr=rows.shift()||[];
 const detalle=rows.filter(r=>String(r[0])===id).map(r=>cotHeader_(hdr,r)).sort((a,b)=>Number(a.linea)-Number(b.linea));
 return jsonResponse({ok:true,cotizacion:found.row,detalle});
 }catch(err){return jsonResponse({ok:false,error:String(err.message||err)});}
}
function quotationSave_(e){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const ctx=requireAuth_(e);checkRole_(ctx,['ventas','inventario']);
  const b=readBody_(e).data||{},name=cotStr_(b.cliente_nombre,150);
  if(!name)throw Error('Nombre de cliente requerido.');
  const source=Array.isArray(b.items)?b.items:[];
  if(!source.length||source.length>150)throw Error('Debe incluir entre 1 y 150 artículos.');
  const vigencia=Number(b.vigencia_dias),pct=Number(b.descuento_porcentaje);
  if(!Number.isInteger(vigencia)||vigencia<1||vigencia>365)throw Error('Vigencia fuera de rango (1 a 365 días).');
  if(!Number.isFinite(pct)||pct<0||pct>100)throw Error('Descuento global fuera de rango.');
  const catalog=cotCatalog_(),map=new Map(catalog.map(x=>[x.id_del_articulo,x])),seen=new Set(),lineas=[];
  let subtotal=0;
  source.forEach((it,i)=>{
   const id=cotStr_(it.id_del_articulo,100),p=map.get(id),qty=Number(it.cantidad),unit=Number(it.precio_unitario);
   if(!p)throw Error('Artículo inexistente: '+id);
   if(seen.has(id))throw Error('Artículo duplicado: '+id);seen.add(id);
   if(!Number.isFinite(qty)||qty<=0||qty>1000000||!Number.isFinite(unit)||unit<0||unit>100000000)throw Error('Cantidad/precio inválidos en la línea '+(i+1));
   const lineSub=cotMoney_(qty*unit);subtotal=cotMoney_(subtotal+lineSub);
   lineas.push({linea:i+1,id_del_articulo:id,nombre:p.nombre,cantidad:qty,precio_sugerido:p.precio_de_venta,precio_unitario:unit,descuento_unitario:cotMoney_(Math.max(0,p.precio_de_venta-unit)),subtotal:lineSub});
  });
  const disc=cotMoney_(subtotal*pct/100),total=cotMoney_(subtotal-disc);
  const {head,det}=cotSheets_(),now=new Date(),tz=Session.getScriptTimeZone()||'America/Guatemala';
  const id=cotStr_(b.id_cotizacion,100),old=id?cotFind_(head,id):null;
  if(id&&!old)throw Error('Cotización no encontrada, no se puede actualizar.');
  if(old&&Number(b.version)!==Number(old.row.version))throw Error('La cotización cambió desde que la abriste. Recarga antes de guardar.');
  if(old&&String(old.row.estado)!=='BORRADOR')throw Error('Solo se pueden editar BORRADORES. Duplica una cotización emitida o cerrada.');
  const newId=old?id:('COT-'+Utilities.formatDate(now,tz,'yyyyMMdd-HHmmss')+'-'+Math.floor(Math.random()*900+100));
  const created=old?old.row.created_at:now,version=old?Number(old.row.version)+1:1;
  const expires=new Date(now.getTime());expires.setDate(expires.getDate()+vigencia);
  const vals={id_cotizacion:newId,fecha:old?old.row.fecha:Utilities.formatDate(now,tz,'yyyy-MM-dd'),cliente_nombre:name,cliente_telefono:cotStr_(b.cliente_telefono,40),cliente_email:cotStr_(b.cliente_email,150),cliente_nit:cotStr_(b.cliente_nit,30),vigencia_dias:vigencia,fecha_vencimiento:Utilities.formatDate(expires,tz,'yyyy-MM-dd'),forma_pago:cotStr_(b.forma_pago,250),entrega:cotStr_(b.entrega,250),descuento_porcentaje:pct,subtotal,descuento_monto:disc,total_neto:total,estado:'BORRADOR',usuario:ctx.email,notas:cotStr_(b.notas,1500),doc_url:'',version,created_at:created,updated_at:now};
  const headVals=cotRow_(COT_HEAD,vals);
  // Las validaciones ocurren antes de cualquier escritura.
  // Guardar detalle nuevo antes de la cabecera: si falla, no se expone una cabecera con totales nuevos.
  const current=det.getDataRange().getValues(),keepers=current.slice(1).filter(r=>String(r[0])!==newId);
  const output=keepers.concat(lineas.map(li=>cotRow_(COT_DET,{id_cotizacion:newId,...li,created_at:now})));
  if(output.length>0)det.getRange(2,1,output.length,COT_DET.length).setValues(output);
  const previousCount=det.getLastRow()-1;
  if(previousCount>output.length)det.deleteRows(output.length+2,previousCount-output.length);
  if(old)head.getRange(old.index,1,1,COT_HEAD.length).setValues([headVals]);
  else head.appendRow(headVals);
  audit_('quotation_save',ctx.email,{id_cotizacion:newId,version,total_neto:total},true);
  return jsonResponse({ok:true,id_cotizacion:newId,version,estado:'BORRADOR',total_neto:total});
 }catch(err){return jsonResponse({ok:false,error:String(err.message||err)});}
 finally{try{lock.releaseLock();}catch(_){}}
}
function quotationPdf_(e){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const ctx=requireAuth_(e);checkRole_(ctx,['ventas','inventario']);
  const b=readBody_(e).data||{},id=cotStr_(b.id_cotizacion,100);if(!id)throw Error('id_cotizacion requerido.');
  const {head,det}=cotSheets_(),found=cotFind_(head,id);if(!found)throw Error('Cotización no encontrada.');
  const q=found.row,dr=det.getDataRange().getValues(),dh=dr.shift()||[];
  if(['ACEPTADA','RECHAZADA'].includes(String(q.estado)))throw Error('No se puede emitir nuevamente una cotización cerrada.');
  const items=dr.filter(r=>String(r[0])===id).map(r=>cotHeader_(dh,r)).sort((a,b)=>Number(a.linea)-Number(b.linea));
  if(!items.length)throw Error('La cotización no tiene artículos.');
  // Crear PDF a partir de Google Docs sin modificar archivos existentes.
  const doc=DocumentApp.create('FERJO Cotización '+id),body=doc.getBody();
  const logoId=(PropertiesService.getScriptProperties().getProperty('FERJO_LOGO_FILE_ID')||'').trim();
  if(logoId){try{const img=body.appendImage(DriveApp.getFileById(logoId).getBlob());img.setWidth(130);}catch(_){}}
  body.appendParagraph('FERJO S.A.').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('19 Calle, Zona 1  |  Tel. 2251 6251');
  body.appendParagraph('COTIZACIÓN '+id).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Fecha: '+q.fecha+'   |   Válida hasta: '+q.fecha_vencimiento);
  body.appendParagraph('Cliente: '+q.cliente_nombre+'   |   NIT: '+(q.cliente_nit||'—'));
  body.appendParagraph('Teléfono: '+(q.cliente_telefono||'—')+'   |   Correo: '+(q.cliente_email||'—'));
  const rows=[['CÓDIGO','DESCRIPCIÓN','CANT.','PRECIO','TOTAL']];
  items.forEach(it=>rows.push([String(it.id_del_articulo),String(it.nombre),String(it.cantidad),'Q '+Number(it.precio_unitario).toFixed(2),'Q '+Number(it.subtotal).toFixed(2)]));
  body.appendTable(rows);
  body.appendParagraph('Subtotal: Q '+Number(q.subtotal).toFixed(2));
  body.appendParagraph('Descuento ('+q.descuento_porcentaje+'%): Q '+Number(q.descuento_monto).toFixed(2));
  body.appendParagraph('TOTAL: Q '+Number(q.total_neto).toFixed(2)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Condiciones de pago: '+(q.forma_pago||'A convenir'));
  body.appendParagraph('Entrega: '+(q.entrega||'Según disponibilidad'));
  if(q.notas)body.appendParagraph('Observaciones: '+q.notas);
  body.appendParagraph('Este documento es una cotización, no una factura. Precios y disponibilidad sujetos a confirmación.');
  doc.saveAndClose();
  const folderId=(PropertiesService.getScriptProperties().getProperty('FERJO_COTIZACIONES_FOLDER_ID')||'').trim();
  const folder=folderId?DriveApp.getFolderById(folderId):DriveApp.getRootFolder();
  const docFile=DriveApp.getFileById(doc.getId());
  const pdf=folder.createFile(docFile.getAs(MimeType.PDF).setName('Cotizacion_'+id+'_v'+q.version+'.pdf'));
  docFile.setTrashed(true); // Solo elimina el documento temporal que creó esta función.
  const c=COT_HEAD.indexOf('doc_url')+1,s=COT_HEAD.indexOf('estado')+1,u=COT_HEAD.indexOf('updated_at')+1;
  head.getRange(found.index,c).setValue(pdf.getUrl());
  head.getRange(found.index,s).setValue('EMITIDA');
  head.getRange(found.index,u).setValue(new Date());
  audit_('quotation_pdf',ctx.email,{id_cotizacion:id,pdf_url:pdf.getUrl()},true);
  return jsonResponse({ok:true,id_cotizacion:id,doc_url:pdf.getUrl()});
 }catch(err){return jsonResponse({ok:false,error:String(err.message||err)});}
 finally{try{lock.releaseLock();}catch(_){}}
}


function quotationStatus_(e){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const ctx=requireAuth_(e);checkRole_(ctx,['ventas','inventario']);
  const b=readBody_(e).data||{},id=cotStr_(b.id_cotizacion,100),next=cotStr_(b.estado,30).toUpperCase();
  if(!id)throw Error('id_cotizacion requerido.');
  if(!['ACEPTADA','RECHAZADA','EMITIDA'].includes(next))throw Error('Estado no permitido.');
  const {head}=cotSheets_(),f=cotFind_(head,id);if(!f)throw Error('Cotización no encontrada.');
  const prev=String(f.row.estado||'');
  if(!((prev==='EMITIDA'&&['ACEPTADA','RECHAZADA'].includes(next))||(prev==='BORRADOR'&&next==='EMITIDA')))
   throw Error('Transición no permitida: '+prev+' → '+next);
  if(Number(b.version)!==Number(f.row.version))throw Error('Versión desactualizada. Recarga cotización.');
  head.getRange(f.index,COT_HEAD.indexOf('estado')+1).setValue(next);
  head.getRange(f.index,COT_HEAD.indexOf('updated_at')+1).setValue(new Date());
  audit_('quotation_status',ctx.email,{id_cotizacion:id,estado_anterior:prev,estado:next},true);
  return jsonResponse({ok:true,id_cotizacion:id,estado:next});
 }catch(err){return jsonResponse({ok:false,error:String(err.message||err)});}
 finally{try{lock.releaseLock();}catch(_){}}
}
