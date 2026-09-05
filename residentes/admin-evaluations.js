// Dados da supervisão ficam somente em memória; cada consulta exige autorização no servidor.
const supervisionState={data:[],filtered:[],limit:20,request:0,pdfRequest:0,pdfUrl:'',pdfBusy:false};
const supervisionCriteria=[
  ['Conhecimentos','Apreendeu os pressupostos teóricos relacionados à prática profissional'],
  ['Habilidades','Realizou com segurança procedimentos de prevenção, diagnóstico e tratamento nas práticas clínicas e/ou cirúrgicas'],
  ['Atitudes','Foi pontual, assíduo e cumpriu o horário destinado às atividades da residência'],
  ['Atitudes','Identificou problemas e propôs soluções para o bom funcionamento do setor'],
  ['Atitudes','Esteve disponível para executar atividades e procedimentos conforme a necessidade dos pacientes'],
  ['Atitudes','Relacionou-se com o paciente de forma cordial e respeitosa, explicando as condutas adotadas'],
  ['Atitudes','Relacionou-se com os preceptores e demais profissionais com cordialidade e respeito'],
  ['Atitudes','Relacionou-se com os outros residentes de forma cordial, respeitando as diferenças individuais'],
  ['Atitudes','Sessão anátomo-clínica: participação e desempenho']
];
const supervisionEl=id=>document.getElementById(id);
const supervisionEscape=value=>escapeDashboardHtml(value);
const supervisionDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value))?String(value).split('-').reverse().join('/'):String(value||'Não informada');
function supervisionScore(value){
  if(value==null || String(value).trim()==='')return '—';
  const number=Number(String(value).replace(',','.'));
  return Number.isFinite(number)&&number>=0&&number<=10?number.toFixed(1).replace('.',','):'—';
}
const supervisionResidentKey=item=>item.residenteId||JSON.stringify([item.residente,item.ano]);
const supervisionPreceptorKey=item=>item.preceptorId||'sem-identificacao';

async function supervisionApi(dados){
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(RESIDENT_PORTAL_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({tipo:'avaliacoes_admin',token:AUTOAVAL_ADMIN_TOKEN,dados}),signal:controller.signal});
    if(!response.ok)throw new Error('Não foi possível conectar ao serviço.');
    const result=await response.json();
    if(!result.ok){const error=new Error(result.erro||'Não foi possível concluir a consulta.');error.accessDenied=result.codigo==='ACESSO_NEGADO';throw error;}
    return result;
  }catch(error){if(error.name==='AbortError')throw new Error('A consulta demorou mais que o esperado. Tente novamente.');throw error;}
  finally{clearTimeout(timeout);}
}

function closeSupervisionPdf(){
  supervisionState.pdfRequest++;
  supervisionState.pdfBusy=false;
  supervisionEl('supervisionPdfFrame').src='about:blank';
  supervisionEl('supervisionPdfPreview').hidden=true;
  supervisionEl('supervisionPdfDownload').removeAttribute('href');
  if(supervisionState.pdfUrl)URL.revokeObjectURL(supervisionState.pdfUrl);
  supervisionState.pdfUrl='';
  document.querySelectorAll('[data-supervision-pdf]').forEach(button=>button.disabled=false);
}

function signOutSupervision(){
  AUTOAVAL_ADMIN_TOKEN='';AUTOAVAL_ADMIN_DATA=[];
  supervisionState.request++;supervisionState.data=[];supervisionState.filtered=[];
  closeSupervisionPdf();
  supervisionEl('supervisionControls').hidden=true;
  supervisionEl('supervisionAccess').hidden=false;
  supervisionEl('supervisionList').innerHTML='';supervisionEl('supervisionSummary').textContent='';
  supervisionEl('supervisionMore').hidden=true;
  supervisionEl('supervisionStatus').textContent='';
  supervisionEl('supervisionRefresh').disabled=false;
  supervisionEl('dash-autoavaliacoes').innerHTML='<button class="btn btn-primary" onclick="abrirLoginAutoavaliacoes()">Entrar para visualizar</button>';
  if(window.google?.accounts?.id)google.accounts.id.disableAutoSelect();
}

async function loadSupervision(){
  const request=++supervisionState.request;
  closeSupervisionPdf();supervisionState.data=[];supervisionState.filtered=[];
  supervisionEl('supervisionList').innerHTML='';supervisionEl('supervisionSummary').textContent='';supervisionEl('supervisionMore').hidden=true;
  supervisionEl('supervisionAccess').hidden=!!AUTOAVAL_ADMIN_TOKEN;
  supervisionEl('supervisionControls').hidden=!AUTOAVAL_ADMIN_TOKEN;
  if(!AUTOAVAL_ADMIN_TOKEN){supervisionEl('supervisionStatus').textContent='';return;}
  const button=supervisionEl('supervisionRefresh');button.disabled=true;
  supervisionEl('supervisionStatus').textContent='Carregando as avaliações dos residentes…';
  try{
    const result=await supervisionApi({acao:'listar'});
    if(request!==supervisionState.request)return;
    if(!Array.isArray(result.avaliacoes))throw new Error('O serviço não retornou a lista de avaliações.');
    supervisionState.data=result.avaliacoes;
    fillSupervisionFilters();filterSupervision();
    supervisionEl('supervisionStatus').textContent='Consulta atualizada. Avaliações salvas já aparecem aqui; o PDF fica disponível após a emissão pelo preceptor.';
  }catch(error){
    if(request!==supervisionState.request)return;
    if(error.accessDenied)signOutSupervision();
    supervisionEl('supervisionStatus').textContent=error.accessDenied?error.message:'Não foi possível carregar as avaliações. '+error.message+' Use Atualizar para tentar novamente.';
  }finally{if(request===supervisionState.request)button.disabled=false;}
}

function fillSupervisionFilters(){
  const fields=[['supervisionResident',supervisionResidentKey,e=>(e.residente||'Nome não informado')+' · '+e.ano,'Todos os residentes'],
    ['supervisionPreceptor',supervisionPreceptorKey,e=>e.preceptor||'Não identificado no registro','Todos os preceptores'],
    ['supervisionYear',e=>e.ano,e=>e.ano,'Todos os anos'],['supervisionModule',e=>e.modulo,e=>e.modulo,'Todos os módulos'],
    ['supervisionPeriod',e=>e.periodo,e=>e.periodo,'Todos os períodos']];
  for(const [id,key,label,all] of fields){
    const select=supervisionEl(id), previous=select.value;
    const options=new Map(supervisionState.data.map(e=>[String(key(e)||''),String(label(e)||'')]));options.delete('');
    select.innerHTML='<option value="">'+all+'</option>'+[...options].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([value,text])=>'<option value="'+supervisionEscape(value)+'">'+supervisionEscape(text)+'</option>').join('');
    if(options.has(previous))select.value=previous;
  }
}

function filterSupervision(reset=true){
  if(reset){supervisionState.limit=20;closeSupervisionPdf();}
  const resident=supervisionEl('supervisionResident').value,preceptor=supervisionEl('supervisionPreceptor').value;
  const year=supervisionEl('supervisionYear').value,module=supervisionEl('supervisionModule').value,period=supervisionEl('supervisionPeriod').value;
  const start=supervisionEl('supervisionStart').value,end=supervisionEl('supervisionEnd').value;
  supervisionState.filtered=supervisionState.data.filter(e=>(!resident||supervisionResidentKey(e)===resident)&&(!preceptor||supervisionPreceptorKey(e)===preceptor)&&(!year||e.ano===year)&&(!module||e.modulo===module)&&(!period||e.periodo===period)&&(!(start||end)||/^\d{4}-\d{2}-\d{2}$/.test(e.data))&&(!start||e.data>=start)&&(!end||e.data<=end));
  if(start&&end&&start>end){supervisionEl('supervisionSummary').textContent='A data inicial deve ser anterior ou igual à data final.';supervisionEl('supervisionList').innerHTML='';supervisionEl('supervisionMore').hidden=true;return;}
  const filtered=supervisionState.filtered;
  supervisionEl('supervisionSummary').textContent=filtered.length+' avaliação(ões) · '+new Set(filtered.map(supervisionResidentKey)).size+' residente(s) · '+filtered.filter(e=>e.fichaDisponivel).length+' PDF(s) disponíveis';
  supervisionEl('supervisionList').innerHTML=filtered.length?filtered.slice(0,supervisionState.limit).map(e=>{
    const index=supervisionState.data.indexOf(e),items=Array.isArray(e.itens)?e.itens:[];
    const criteria=supervisionCriteria.map((criterion,i)=>{
      const item=items.find(item=>item&&item.codigo==='I'+String(i+1).padStart(2,'0')) || (items[i]&&!items[i].codigo?items[i]:null);
      return '<tr><td><strong>'+criterion[0]+'</strong><br>'+supervisionEscape(item?.texto||criterion[1])+'</td><td>'+supervisionScore(item?.escore)+'</td></tr>';
    }).join('');
    return '<article class="card supervision-evaluation"><h3>'+supervisionEscape(e.residente||'Nome não informado')+'</h3><p>'+supervisionEscape(e.ano)+' · '+supervisionEscape(supervisionDate(e.data))+'</p><p><b>Módulo:</b> '+supervisionEscape(e.modulo||'Não informado')+'<br><b>Período:</b> '+supervisionEscape(e.periodo||'Não informado')+'<br><b>Preceptor:</b> '+supervisionEscape(e.preceptor||'Não identificado no registro')+'</p><div class="supervision-score">Nota final: <strong>'+supervisionScore(e.media)+' / 10</strong> · '+supervisionEscape(e.conceito)+'</div><details><summary>Ver critérios e comentários</summary><table><caption>Notas por critério</caption><thead><tr><th scope="col">Critério avaliado</th><th scope="col">Nota</th></tr></thead><tbody>'+criteria+'</tbody></table><p class="supervision-muted">— = nota não registrada. Não é estimada a partir da média.</p><p><b>Conhecimentos:</b> '+supervisionScore(e.conhecimentos)+' · <b>Habilidades:</b> '+supervisionScore(e.habilidades)+' · <b>Atitudes:</b> '+supervisionScore(e.atitudes)+'</p><p class="supervision-comment"><b>Observações do preceptor:</b><br>'+supervisionEscape(e.observacoes||'Sem observações registradas.')+'</p></details>'+(e.fichaDisponivel?'<div class="supervision-actions"><button class="btn btn-primary" data-supervision-pdf onclick="openSupervisionPdf('+index+',false)">Visualizar PDF</button><button class="btn btn-secondary" data-supervision-pdf onclick="openSupervisionPdf('+index+',true)">Baixar PDF</button></div>':'<p class="supervision-muted">PDF ainda não emitido pelo preceptor.</p>')+'</article>';
  }).join(''):'<div class="card supervision-muted">'+(supervisionState.data.length?'Nenhuma avaliação corresponde aos filtros.':'Nenhuma avaliação recebida ainda.')+'</div>';
  supervisionEl('supervisionMore').hidden=filtered.length<=supervisionState.limit;
}

function resetSupervisionFilters(){
  document.querySelectorAll('#supervisionFilters select,#supervisionFilters input').forEach(input=>input.value='');filterSupervision();
}
function moreSupervision(){supervisionState.limit+=20;filterSupervision(false);}

async function openSupervisionPdf(index,download){
  if(supervisionState.pdfBusy)return;
  const evaluation=supervisionState.data[index];if(!evaluation?.fichaDisponivel)return;
  closeSupervisionPdf();const request=supervisionState.pdfRequest;
  supervisionState.pdfBusy=true;
  document.querySelectorAll('[data-supervision-pdf]').forEach(button=>button.disabled=true);
  supervisionEl('supervisionStatus').textContent='Carregando a ficha PDF…';
  try{
    const result=await supervisionApi({acao:'baixar',id:evaluation.id});
    if(request!==supervisionState.pdfRequest)return;
    if(result.id!==evaluation.id||!result.pdfBase64)throw new Error('Cópia da ficha indisponível.');
    const bytes=Uint8Array.from(atob(result.pdfBase64),c=>c.charCodeAt(0));
    if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('Cópia da ficha inválida.');
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const name=String(result.nome||'ficha-avaliacao.pdf').replace(/[\\/:*?"<>|]/g,'-');
    if(download){const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    else{
      supervisionState.pdfUrl=url;
      supervisionEl('supervisionPdfTitle').textContent=evaluation.residente+' · '+supervisionDate(evaluation.data);
      supervisionEl('supervisionPdfDownload').href=url;supervisionEl('supervisionPdfDownload').download=name;
      supervisionEl('supervisionPdfFrame').src=url;supervisionEl('supervisionPdfPreview').hidden=false;
      supervisionEl('supervisionPdfPreview').scrollIntoView({behavior:'smooth',block:'start'});
    }
    supervisionEl('supervisionStatus').textContent='Ficha carregada: a mesma cópia disponibilizada ao residente.';
  }catch(error){
    if(request!==supervisionState.pdfRequest)return;
    if(error.accessDenied)signOutSupervision();
    supervisionEl('supervisionStatus').textContent=error.message;
  }finally{
    if(request===supervisionState.pdfRequest){supervisionState.pdfBusy=false;document.querySelectorAll('[data-supervision-pdf]').forEach(button=>button.disabled=false);}
  }
}
window.addEventListener('beforeunload',()=>{if(supervisionState.pdfUrl)URL.revokeObjectURL(supervisionState.pdfUrl);});
window.addEventListener('DOMContentLoaded',()=>{if(location.hash==='#supervisao')showScreen('supervisao');});
