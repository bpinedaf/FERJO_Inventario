
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
function cotPdfFolder_(){
 const configured=PropertiesService.getScriptProperties().getProperty('FERJO_COTIZACIONES_FOLDER_ID');
 const folderId=String(configured||CFG.DRIVE_RECEIPTS_FOLDER_ID||'').trim();
 if(!folderId)throw Error('No hay carpeta configurada para los PDF de cotizaciones.');
 try{const folder=DriveApp.getFolderById(folderId);folder.getName();return folder;}
 catch(_){throw Error('La cuenta que ejecuta Apps Script no tiene acceso a la carpeta de PDF configurada.');}
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
  // Validar destino antes de crear documentos. Hereda los permisos existentes de la carpeta.
  const folder=cotPdfFolder_();
  // Diseño corporativo: mismo contenido y cálculos; solo cambia la presentación.
  const doc=DocumentApp.create('FERJO Cotización '+id);
  try{cotRenderPdfDoc_(doc,q,items);}catch(err){
   try{doc.saveAndClose();DriveApp.getFileById(doc.getId()).setTrashed(true);}catch(_){}
   throw err;
  }
  doc.saveAndClose();

  const docFile=DriveApp.getFileById(doc.getId());
  const pdf=folder.createFile(docFile.getAs(MimeType.PDF).setName('Cotizacion_'+id+'_v'+q.version+'.pdf'));
  // Política autorizada por el propietario: igual que los PDF de ventas.
  pdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
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


/* Diseño corporativo basado en Plantilla_Cotizacion_FERJO.pdf.
 * Logo JPEG original extraído de la plantilla (729 x 220); sin dependencia de URL pública.
 * FERJO_LOGO_FILE_ID puede sustituirlo conservando proporciones.
 */
function cotPdfLogo_(){
 const logoId=(PropertiesService.getScriptProperties().getProperty('FERJO_LOGO_FILE_ID')||'').trim();
 if(logoId){try{return DriveApp.getFileById(logoId).getBlob();}catch(err){console.warn('Logo configurado no disponible; se utiliza el de la plantilla.');}}
 return Utilities.newBlob(Utilities.base64Decode(COT_LOGO_JPEG_BASE64),'image/jpeg','FERJO_logo.jpg');
}
function cotPdfDate_(value){
 const s=String(value||'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
 return m?m[3]+'/'+m[2]+'/'+m[1]:s;
}
function cotRenderPdfDoc_(doc,q,items){
 const blue='#005AAA',ink='#243247',pale='#EAF2FB',line='#CED6DF',white='#FFFFFF';
 const A=DocumentApp.HorizontalAlignment;
 const body=doc.getBody();body.clear();
 body.setPageWidth(612).setPageHeight(792).setMarginTop(38).setMarginBottom(42).setMarginLeft(48).setMarginRight(48);
 body.setAttributes({[DocumentApp.Attribute.FONT_FAMILY]:'Arial',[DocumentApp.Attribute.FONT_SIZE]:9,[DocumentApp.Attribute.FOREGROUND_COLOR]:ink});
 const money=v=>'Q '+Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const para=(container,text,size,bold,color)=>{
  const p=container.appendParagraph(String(text));p.setSpacingBefore(0).setSpacingAfter(5).setLineSpacing(1.12);
  p.editAsText().setFontFamily('Arial').setFontSize(size||9).setBold(!!bold).setForegroundColor(color||ink);return p;
 };
 const section=text=>para(body,text,10,true,ink).setSpacingBefore(10).setSpacingAfter(6);
 function table(rows,widths,style){
  const t=body.appendTable(rows);t.setBorderColor(line).setBorderWidth(0.5);
  widths.forEach((w,i)=>t.setColumnWidth(i,w));
  for(let r=0;r<t.getNumRows();r++)for(let c=0;c<t.getRow(r).getNumCells();c++){
   const cell=t.getCell(r,c);cell.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6).setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
   const p=cell.getChild(0).asParagraph();p.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1.08);
   p.editAsText().setFontFamily('Arial').setFontSize(8.5).setBold(false).setForegroundColor(ink);
   style(cell,p,r,c);
  }
  return t;
 }
 const logo=cotPdfLogo_();
 function brand(continued){
  const p=body.appendParagraph('');p.setSpacingBefore(0).setSpacingAfter(3);
  const img=p.appendInlineImage(logo.copyBlob()),w=continued?185:265,ratio=img.getHeight()/img.getWidth();img.setWidth(w).setHeight(Math.round(w*ratio));
  para(body,'19 Calle, zona 1 • Tel. 2251 6251',8,false,blue).setSpacingAfter(12);
  const title=para(body,continued?'Cotización comercial · continuación':'Cotización comercial',16,true,'#111827');title.setSpacingAfter(3);
  const rule=body.appendTable([['']]);rule.setBorderWidth(0).setColumnWidth(0,516);
  const cell=rule.getCell(0,0);cell.setBackgroundColor(blue).setPaddingTop(0).setPaddingBottom(0);
  cell.getChild(0).asParagraph().setSpacingBefore(0).setSpacingAfter(0).editAsText().setFontSize(1);
  if(continued){para(body,q.id_cotizacion+'  |  '+q.cliente_nombre,8.5,false,ink).setSpacingBefore(6);}
 }
 brand(false);
 para(body,'Estimado cliente: presentamos la siguiente propuesta de productos y precios para su consideración.',8.5,false,ink).setSpacingBefore(7).setSpacingAfter(10);
 table([
  ['No. de cotización',String(q.id_cotizacion),'Fecha',cotPdfDate_(q.fecha)],
  ['Cliente / empresa',String(q.cliente_nombre),'NIT',String(q.cliente_nit||'CF')],
  ['Contacto',[q.cliente_telefono,q.cliente_email].filter(Boolean).join(' | ')||'No indicado','Atendido por',String(q.usuario||'FERJO S.A.')]
 ],[100,158,70,188],(cell,p,r,c)=>{if(c===0||c===2){cell.setBackgroundColor(pale);p.editAsText().setBold(true).setForegroundColor(blue);}});
 // Repetir cabecera de productos en páginas explícitas. Presupuesto conservador
 // por altura estimada, incluyendo descripciones largas y códigos sin espacios.
 const rowUnits=it=>Math.max(1,Math.ceil(String(it.nombre).length/48),Math.ceil(String(it.id_del_articulo).length/9));
 const totalUnits=items.reduce((sum,it)=>sum+rowUnits(it),0);
 const chunks=[];let chunk=[],units=0,capacity=totalUnits<=18?12:22;
 items.forEach(it=>{
  const cost=rowUnits(it);
  if(chunk.length&&units+cost>capacity){chunks.push(chunk);chunk=[];units=0;capacity=30;}
  chunk.push(it);units+=cost;
 });if(chunk.length)chunks.push(chunk);
 // Reservar espacio real para totales y condiciones, evitando un cierre huérfano.
 const last=chunks[chunks.length-1],lastUnits=last.reduce((sum,it)=>sum+rowUnits(it),0);
 if(last.length>1&&lastUnits>(chunks.length===1?12:18)){
  const target=lastUnits/2;let cut=0,used=0;
  while(cut<last.length-1&&used<target){used+=rowUnits(last[cut++]);}
  chunks.splice(chunks.length-1,1,last.slice(0,cut),last.slice(cut));
 }
 chunks.forEach((page,pageIndex)=>{
  if(pageIndex){body.appendPageBreak();brand(true);}
  section('Detalle de productos');
  const rows=[['Código','Descripción del producto','Cant.','Precio unitario','Total']];
  page.forEach(it=>rows.push([String(it.id_del_articulo),String(it.nombre),String(it.cantidad),money(it.precio_unitario),money(it.subtotal)]));
  // Espacio de escritura visual equivalente a la plantilla para ofertas cortas.
  if(chunks.length===1)while(rows.length<5)rows.push(['','','','','']);
  table(rows,[54,232,40,94,96],(cell,p,r,c)=>{
   if(r===0){cell.setBackgroundColor(blue);p.editAsText().setBold(true).setForegroundColor(white).setFontSize(8);}
   else cell.setBackgroundColor(r%2===0?'#F5F8FC':white);
   if(c>=2)p.setAlignment(c===2?A.CENTER:A.RIGHT);
  });
  if(pageIndex<chunks.length-1)para(body,'Continúa en la siguiente página.',8,false,blue).setAlignment(A.RIGHT).setSpacingBefore(8);
 });
 if(String(q.notas||'').length>500){body.appendPageBreak();brand(true);}
 para(body,'',2,false,ink).setSpacingAfter(4);
 table([
  ['Subtotal',money(q.subtotal)],
  ['Descuento global ('+Number(q.descuento_porcentaje||0)+'%)',money(q.descuento_monto)],
  ['TOTAL COTIZADO',money(q.total_neto)]
 ],[356,160],(cell,p,r,c)=>{p.editAsText().setBold(true);if(c===1)p.setAlignment(A.RIGHT);if(r===2){cell.setBackgroundColor(pale);p.editAsText().setForegroundColor(blue).setFontSize(11);}});
 section('Condiciones comerciales');
 function condition(label,value){const p=para(body,label+' '+value,8.5,false,ink);p.editAsText().setBold(0,label.length-1,true);return p;}
 condition('Vigencia de la oferta:',String(q.vigencia_dias)+' días; válida hasta el '+cotPdfDate_(q.fecha_vencimiento)+'.');
 condition('Disponibilidad y entrega:',q.entrega||'Sujeto a confirmación de inventario y plazo de entrega.');
 condition('Forma de pago:',q.forma_pago||'A convenir.');
 condition('Observaciones:',q.notas||'Sin observaciones adicionales.');
 para(body,'Gracias por considerar a FERJO S.A.',9,true,ink).setSpacingBefore(12);
 para(body,'Esta cotización no constituye una factura. Los precios, disponibilidad y condiciones deberán confirmarse al momento de concretar el pedido.',8,false,ink);
 const footer=doc.getFooter()||doc.addFooter();
 para(footer,'FERJO S.A. | Importadora de Juguetes y Novedades | 2251 6251',7,false,blue).setAlignment(A.CENTER).setSpacingAfter(0);
}

const COT_LOGO_JPEG_BASE64='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NQ083/wxahOzTl+B4p4z8aaB4y0iCz0/TbiXV3kQRExLuQZ+ZQQSWyOMdO/avWfD9rc2Ph7TrS8bdcw26JIc5+YAZ5q5HaW0MryxW8SSP951QAt9T3qWnWrxlBU4KyXncVOk4yc5O7YtJS0VzG4UUUUAFFFFABRRRQAUUUUCCiiigAooooGFFFFAgooooGFFFFAgooooAKKKKACiiigYUUUUCCiiigAooooAKKKKACiiigYUUUUCCiiigAooooAKKKKACiiigAooooAKKKKACiiigYUUUUCCiiigAooooAKKKKBhRRRQAUUUUCCiiigAooooAKKKKACiiigYUUUUAFFFFAgooooGFFFFAgooooAKKKKBhRRRQAUUUUAFFFFAgooooASloooAKKKKBhRRRQAUUUUCCiiigAooooAKKSloAKKKKACiiigAooooGFFFFAgooooAKKKKACiiigYUUUUCCiiigAooooAKKKKBhRRRQIKKKKBhRRRQIKKKKACiiigAooooGFFFFAgooooAKKKKACiiigAooooAKKKKBhRRRQAUUUUCCiiigAooooAKKKKACiiigYUUUUAFFFFAgooooGFFFFAgooooGFFFFAgooooAKKKKACiiigYUUUUAFFFFAgooooAKKKKBhRRRQIKKKKBhRRRQIKKKKBhRRRQAUUUUCCiiigYUUUUCCiiigYUUUUCCiiigAooooAKKKKBhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQIKKKKACiiigAooooGFFFFAgooooGFFFFAgooooGFFFFAgooo70DCiiigQUUUUAFFHeigYUUlL2oEFFFHagAooooGFFFHegAopKWgAooooAKKKKACiiigAooooAKKKKBBRRRQAUUUdqACiiigYUUUUAFFJS0AFFFFABRRRQAUUUUCCiiigAooooGFFFFABRRRQIKKKKBhRSUtABRRRQAUUUUAFFFFABRRRQAUUUUCP//Z';
