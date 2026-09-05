let attendanceMonthlyData=null,attendanceMonthlyRequest=0,attendanceMonthlyBusy=false;

function attendanceMonthStatus(){
  const select=document.getElementById('attendancePdfResident'),button=document.getElementById('exportAttendancePdf'),status=document.getElementById('attendancePdfStatus');
  button.disabled=true;
  if(attendanceMonthlyBusy)return;
  if(!attendanceMonthlyData){status.textContent='Escolha o mês e atualize a consulta.';return;}
  if(!select.value){status.textContent='Selecione o residente para emitir a ficha mensal.';return;}
  try{
    const sheet=AttendancePDF.prepare(attendanceMonthlyData,select.value);
    status.textContent=sheet.records?sheet.totals.dias+' dia(s) com frequência salva no mês. O PDF será identificado pelo preceptor conectado.':'Não há frequência salva para este residente no mês selecionado.';
    button.disabled=!sheet.records;
  }catch(error){status.textContent=error.message;}
}

async function loadAttendanceMonth(){
  if(attendanceMonthlyBusy)return;
  const month=document.getElementById('attendancePdfMonth'),select=document.getElementById('attendancePdfResident'),status=document.getElementById('attendancePdfStatus');
  if(!month.value)month.value=manausDate().slice(0,7);
  const request=++attendanceMonthlyRequest,previous=select.value;
  attendanceMonthlyData=null;select.disabled=true;document.getElementById('exportAttendancePdf').disabled=true;
  status.textContent='Consultando a frequência mensal salva…';
  try{
    AttendancePDF.monthInfo(month.value);
    const result=await api('frequencia_mensal_preceptor',{mes:month.value});
    if(request!==attendanceMonthlyRequest)return;
    if(result.mes!==month.value||!Array.isArray(result.residentes)||!Array.isArray(result.registros))throw new Error('A consulta mensal retornou dados incompletos. Atualize novamente.');
    attendanceMonthlyData=result;
    select.innerHTML='<option value="">Selecione o residente</option>'+result.residentes.map(r=>'<option value="'+escAttr(r.id)+'">'+esc(r.nome)+' · '+esc(r.ano)+' · '+esc(r.modulo)+'</option>').join('');
    if(result.residentes.some(r=>r.id===previous))select.value=previous;
    else if(result.residentes.length===1)select.value=result.residentes[0].id;
    select.disabled=false;attendanceMonthStatus();
    if(!result.residentes.length)status.textContent=result.cadastrosAmbiguos?'Há cadastros com o mesmo nome e ano. Solicite a revisão à coordenação.':'Nenhum residente vinculado aos seus módulos atuais.';
    else if(result.cadastrosAmbiguos)status.textContent+=' Cadastros com nome e ano repetidos precisam de revisão e não foram incluídos.';
  }catch(error){
    if(request!==attendanceMonthlyRequest)return;
    select.innerHTML='<option value="">Consulta indisponível</option>';status.textContent='Não foi possível carregar a frequência. '+error.message;
  }
}

async function exportAttendancePdf(){
  if(attendanceMonthlyBusy)return;
  const month=document.getElementById('attendancePdfMonth'),select=document.getElementById('attendancePdfResident'),button=document.getElementById('exportAttendancePdf'),status=document.getElementById('attendancePdfStatus');
  const mes=month.value,residenteId=select.value;
  if(!residenteId)return;
  const label=button.textContent;attendanceMonthlyBusy=true;
  [month,select,button,document.getElementById('refreshAttendanceMonth')].forEach(el=>el.disabled=true);
  status.textContent='Conferindo os registros salvos e gerando a ficha…';button.textContent='Gerando PDF…';
  try{
    if(!profile||profile.papel!=='preceptor')throw new Error('Entre novamente com a conta do preceptor.');
    // Reconsulta no momento da emissão: alterações ainda não salvas na grade não entram no documento.
    const result=await api('frequencia_mensal_preceptor',{mes,residenteId});
    if(result.mes!==mes||result.preceptor?.email!==profile.email)throw new Error('A identificação da emissão mudou. Entre novamente no portal.');
    const response=await fetch('./assets/uea-logo-verde.pdf');if(!response.ok)throw new Error('Não foi possível carregar a logo da UEA.');
    const bytes=await AttendancePDF.create(result,residenteId,await response.arrayBuffer());
    const resident=result.residentes.find(r=>r.id===residenteId),name=String(resident.nome).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,80);
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=document.createElement('a');link.href=url;link.download='frequencia-'+name+'-'+mes+'.pdf';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent='Ficha mensal emitida com o nome e e-mail de '+result.preceptor.nome+'.';toast('Ficha de frequência mensal gerada.');
  }catch(error){status.textContent='Não foi possível emitir a ficha. '+error.message;toast(error.message,true);}
  finally{attendanceMonthlyBusy=false;button.textContent=label;[month,select,button,document.getElementById('refreshAttendanceMonth')].forEach(el=>el.disabled=false);}
}
