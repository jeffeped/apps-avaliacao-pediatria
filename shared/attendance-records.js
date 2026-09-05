// As cópias e a sessão ficam em memória. O servidor autoriza cada leitura.
function createAttendanceRecords(root,options){
  const state={items:[],request:0,pdfRequest:0,url:'',busy:false,limit:20};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const month=value=>/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)?new Date(value+'-15T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}):String(value||'Mês não informado');
  root.classList.add('frequency-records');
  root.innerHTML='<div class="card"><h2>'+ (options.admin?'Frequência mensal dos residentes':'Minha frequência')+'</h2><p>Fichas mensais emitidas pelos preceptores, com a logo da UEA e a identificação de quem emitiu.</p><div data-access hidden><p>Entre com a conta Google autorizada da supervisão.</p><button data-login>Entrar com Google</button></div><div data-controls hidden><div class="frequency-actions"><button data-refresh>Atualizar</button>'+(options.admin?'<button data-signout>Sair da supervisão</button>':'')+'</div><div class="frequency-filters"><label>Mês de referência<input data-month type="month"></label>'+(options.admin?'<label>Filtrar residente<select data-resident><option value="">Todos os residentes</option></select></label><label>Filtrar preceptor<select data-preceptor><option value="">Todos os preceptores</option></select></label>':'')+'<button data-clear>Limpar filtros</button></div></div></div><p data-status role="status" aria-live="polite"></p><p data-summary></p><div data-list></div><button data-more hidden>Mostrar mais fichas</button><div data-preview class="card" hidden><h3 data-title>Ficha de frequência</h3><div class="frequency-actions"><a data-download>Baixar PDF</a><button data-close>Fechar PDF</button></div><iframe data-frame title="Ficha mensal de frequência em PDF" src="about:blank"></iframe><p>Se a visualização não abrir no celular, use Baixar PDF.</p></div>';
  const el=name=>root.querySelector('[data-'+name+']');
  function close(){
    state.pdfRequest++;state.busy=false;
    el('frame').src='about:blank';el('preview').hidden=true;el('download').removeAttribute('href');
    if(state.url)URL.revokeObjectURL(state.url);state.url='';
    root.querySelectorAll('[data-file]').forEach(b=>b.disabled=false);
  }
  function reset(){
    state.request++;state.items=[];close();el('list').innerHTML='';el('summary').textContent='';el('status').textContent='';el('more').hidden=true;el('refresh').disabled=false;
    el('controls').hidden=true;el('access').hidden=!options.admin;
    root.querySelectorAll('select').forEach(select=>{select.selectedIndex=0;while(select.options.length>1)select.remove(1);});el('month').value='';
  }
  function filter(restart=true){
    if(restart){state.limit=20;close();}
    const items=state.items.filter(f=>(!el('month').value||f.mes===el('month').value)&&(!options.admin||(!el('resident').value||f.residenteId===el('resident').value)&&(!el('preceptor').value||f.preceptorId===el('preceptor').value)));
    el('summary').textContent=items.length+' ficha(s) disponível(is)';
    el('list').innerHTML=items.length?items.slice(0,state.limit).map(f=>'<article class="card"><h3>'+esc(options.admin?f.residente:month(f.mes))+'</h3><p><strong>Mês:</strong> '+esc(month(f.mes))+'<br><strong>Módulo:</strong> '+esc(f.modulo)+' · '+esc(f.ano)+'<br><strong>Preceptor:</strong> '+esc(f.preceptor)+'<br><strong>Emitida em:</strong> '+esc(f.emitidoEm.replace(/^(\d{4})-(\d{2})-(\d{2})/,'$3/$2/$1'))+'</p><div class="frequency-actions"><button data-file="'+state.items.indexOf(f)+'">Visualizar PDF</button><button data-file="'+state.items.indexOf(f)+'" data-save>Baixar PDF</button></div></article>').join(''):'<div class="card">'+(state.items.length?'Nenhuma ficha corresponde aos filtros.':'Ainda não há fichas de frequência emitidas. Elas aparecerão aqui após a emissão pelo preceptor.')+'</div>';
    el('more').hidden=items.length<=state.limit;
  }
  async function load(){
    const request=++state.request;close();state.items=[];el('list').innerHTML='';el('summary').textContent='';el('more').hidden=true;
    const allowed=options.authorized();el('access').hidden=!options.admin||allowed;el('controls').hidden=!allowed;
    if(!allowed){el('status').textContent='';return;}
    el('refresh').disabled=true;el('status').textContent='Carregando as fichas de frequência…';
    try{
      const response=await options.api({acao:'listar'});
      if(request!==state.request||!options.authorized())return;
      if(!Array.isArray(response.fichas))throw new Error('O serviço não retornou a lista de fichas.');
      state.items=response.fichas;
      if(options.admin)for(const [name,key,label,all] of [['resident','residenteId','residente','Todos os residentes'],['preceptor','preceptorId','preceptor','Todos os preceptores']]){
        const previous=el(name).value,choices=new Map(state.items.map(f=>[f[key],f[label]]));
        el(name).innerHTML='<option value="">'+all+'</option>'+[...choices].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([key,value])=>'<option value="'+esc(key)+'">'+esc(value)+'</option>').join('');
        if(choices.has(previous))el(name).value=previous;
      }
      filter();el('status').textContent='Consulta atualizada. Os PDFs são as cópias emitidas pelos preceptores.';
    }catch(error){if(request!==state.request)return;if(error.accessDenied)options.signout();el('status').textContent='Não foi possível carregar as fichas. '+error.message+' Tente atualizar novamente.';}
    finally{if(request===state.request)el('refresh').disabled=false;}
  }
  async function open(index,download){
    if(state.busy||!options.authorized())return;
    const item=state.items[index];if(!item)return;
    close();const request=state.pdfRequest;state.busy=true;
    root.querySelectorAll('[data-file]').forEach(b=>b.disabled=true);el('status').textContent='Carregando a ficha PDF…';
    try{
      const result=await options.api({acao:'baixar',id:item.id});
      if(request!==state.pdfRequest||!options.authorized())return;
      if(result.id!==item.id||!result.pdfBase64)throw new Error('Cópia da ficha indisponível.');
      const bytes=Uint8Array.from(atob(result.pdfBase64),c=>c.charCodeAt(0));
      if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('Cópia da ficha inválida.');
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      const name=String(result.nome||'frequencia-mensal.pdf').replace(/[\\/:*?"<>|]/g,'-');
      if(download){const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
      else{state.url=url;el('title').textContent=(options.admin?item.residente+' · ':'')+month(item.mes);el('download').href=url;el('download').download=name;el('frame').src=url;el('preview').hidden=false;el('preview').scrollIntoView({behavior:'smooth',block:'start'});}
      el('status').textContent='Ficha carregada: cópia emitida pelo preceptor.';
    }catch(error){if(request!==state.pdfRequest)return;if(error.accessDenied)options.signout();el('status').textContent=error.message;}
    finally{if(request===state.pdfRequest){state.busy=false;root.querySelectorAll('[data-file]').forEach(b=>b.disabled=false);}}
  }
  el('refresh').onclick=load;el('close').onclick=close;el('month').onchange=()=>filter();
  el('clear').onclick=()=>{root.querySelectorAll('select,input').forEach(e=>e.value='');filter();};
  el('more').onclick=()=>{state.limit+=20;filter(false);};
  if(options.admin){el('login').onclick=options.login;el('signout').onclick=options.signout;el('resident').onchange=el('preceptor').onchange=()=>filter();}
  el('list').onclick=event=>{const button=event.target.closest('[data-file]');if(button)open(Number(button.dataset.file),button.hasAttribute('data-save'));};
  window.addEventListener('beforeunload',close);
  return {load,reset,close};
}

let residentAttendanceRecords,adminAttendanceRecords;
window.addEventListener('DOMContentLoaded',()=>{
  const resident=document.getElementById('residentAttendanceRecords'),admin=document.getElementById('adminAttendanceRecords');
  if(resident)residentAttendanceRecords=createAttendanceRecords(resident,{authorized:()=>!!TOKEN&&PROFILE?.papel==='residente',api:dados=>api('fichas_frequencia_residente',dados)});
  if(admin)adminAttendanceRecords=createAttendanceRecords(admin,{admin:true,authorized:()=>!!AUTOAVAL_ADMIN_TOKEN,api:dados=>supervisionApi(dados,'frequencias_admin'),login:()=>abrirLoginAutoavaliacoes(),signout:()=>signOutSupervision()});
});
