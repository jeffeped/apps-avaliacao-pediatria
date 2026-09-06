(function(){
  'use strict';
  const revisionKey='residped_cadastros_revisao_v1',legacyKey='residped_fila_legada_v1';
  let revision=localStorage.getItem(revisionKey)||'',running=null,loginForSync=false,lastError='',review=null;
  const clone=v=>JSON.parse(JSON.stringify(v)),isCadastro=t=>['residentes','preceptores','cadastros_admin'].includes(t);
  const token=()=>typeof AUTOAVAL_ADMIN_TOKEN==='string'?AUTOAVAL_ADMIN_TOKEN:'';
  function setRevision(value){revision=value||'';if(revision)localStorage.setItem(revisionKey,revision);else localStorage.removeItem(revisionKey);}
  function queue(){try{const a=JSON.parse(localStorage.getItem('residped_pendentes')||'[]');return Array.isArray(a)?a:[];}catch{return[];}}
  function saveQueue(a){localStorage.setItem('residped_pendentes',JSON.stringify(a));status();}
  function archive(items){if(!items.length)return;let old=[];try{old=JSON.parse(localStorage.getItem(legacyKey)||'[]');}catch{}localStorage.setItem(legacyKey,JSON.stringify([...old,...items]));}
  function archiveCadastros(){const a=queue();archive(a.filter(x=>isCadastro(x.tipo)));saveQueue(a.filter(x=>!isCadastro(x.tipo)));}
  function migrateQueue(){
    const kept=[],legacy=[];
    queue().forEach(item=>{
      if(item.securityVersion===1){kept.push(item);return;}
      // A fila anterior não registra a revisão que originou cada cadastro.
      // Preservá-la para conferência, sem transformar o estado antigo em uma escrita atual.
      if(isCadastro(item.tipo)||item.tipo==='ponto'||item.tipo==='batch'){legacy.push(item);return;}
      kept.push({...item,securityVersion:1,queueId:crypto.randomUUID()});
    });archive(legacy);saveQueue(kept);if(legacy.length)status('Alterações da versão anterior foram preservadas para conferência. Use Baixar alterações preservadas e confira o cadastro central.');
  }
  function status(message){
    if(message!==undefined)lastError=message;
    const button=document.getElementById('btn-sync'),text=document.getElementById('security-sync-status');
    if(button){button.textContent=!token()?'Entrar para sincronizar':running?'Sincronizando…':queue().length?queue().length+' pendente(s)':'Sincronizar';button.onclick=sync;}
    if(text)text.textContent=lastError||(!token()?'Entre com a conta da coordenação para sincronizar.':!revision?'Confira o cadastro central antes da primeira alteração neste aparelho.':queue().length?'Há alterações locais aguardando sincronização.':'Sincronização protegida por login e controle de versão.');
  }
  async function api(tipo,dados,rev){
    const credential=token();if(!credential){const e=new Error('Entre com a conta da coordenação.');e.codigo='ACESSO_NEGADO';throw e;}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(getScriptUrl(),{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({tipo,dados,token:credential,...(rev?{revisao:rev}:{})}),signal:controller.signal});
      const result=await response.json();
      if(token()!==credential){const e=new Error('A sessão foi encerrada. Entre novamente para conferir o resultado.');e.codigo='SESSAO_ENCERRADA';throw e;}
      if(!result.ok||(result.erros&&result.erros.length)){const e=new Error(result.erro||'Parte do envio não foi concluída. Confira os registros.');e.codigo=result.codigo||'ENVIO_INCOMPLETO';throw e;}
      return result;
    }finally{clearTimeout(timer);}
  }
  function enqueue(tipo,dados){
    if(tipo==='ponto'){status('O ponto deve ser registrado no Portal do Residente.');return null;}
    const a=queue(),entry={tipo:isCadastro(tipo)?'cadastros_admin':tipo,dados:clone(isCadastro(tipo)?APP:dados),revisao:revision,securityVersion:1,queueId:crypto.randomUUID(),ts:Date.now()};
    if(isCadastro(tipo)){const older=a.filter(x=>isCadastro(x.tipo));archive(older);saveQueue([...a.filter(x=>!isCadastro(x.tipo)),entry]);}
    else saveQueue([...a,entry]);
    return entry.queueId;
  }
  async function flush(){
    if(running)return running;if(!token())return false;
    running=(async()=>{
      let complete=true;
      while(queue().length){
        const first=queue()[0];
        try{
          if(first.tipo==='cadastros_admin'){
            if(!first.revisao){const e=new Error('Confira os cadastros antes de publicar as alterações locais.');e.codigo='CONFLITO_REVISAO';throw e;}
            const result=await api('cadastros_admin',{acao:'salvar',app:first.dados,revisao:first.revisao});
            setRevision(result.revisao);
            const next=queue().filter(x=>x.queueId!==first.queueId);
            next.forEach(x=>{if(x.tipo==='cadastros_admin'&&x.revisao===first.revisao)x.revisao=revision;});
            saveQueue(next);
          }else{
            await api(first.tipo,first.dados);
            saveQueue(queue().filter(x=>x.queueId!==first.queueId));
          }
          lastError='';
        }catch(error){
          complete=false;
          if(error.codigo==='ACESSO_NEGADO'){AUTOAVAL_ADMIN_TOKEN='';}
          if(error.codigo==='CONFLITO_REVISAO')setRevision('');
          status(error.name==='AbortError'?'O envio não foi confirmado. Confira o cadastro central antes de tentar novamente.':error.message);
          break;
        }
      }
      return complete;
    })();
    status();try{return await running;}finally{running=null;status();}
  }
  async function sync(){
    if(!token()){loginForSync=true;abrirLoginAutoavaliacoes();status();return false;}
    if(!revision){await reviewCadastros();return false;}
    if(!queue().length){
      enqueue('residentes',APP);
      const avaliacoes=loadArr('avaliacoes'),autoavaliacoes=loadArr('autoavaliacoes');
      if(avaliacoes.length||autoavaliacoes.length)enqueue('batch',{avaliacoes,autoavaliacoes});
    }
    const ok=await flush();showToast(ok?'Sincronização concluída.':lastError,ok?'s':'e');return ok;
  }
  function flatten(app){
    const result=new Map();
    ['R1','R2','R3'].forEach(ano=>{
      const p=(app.programas||{})[ano]||{};
      result.set(ano+' — módulo',[p.moduloName||'Sem módulo',p.startDate||'',p.endDate||'',p.morning||'',p.afternoon||''].join(' · '));
      Object.entries((app.residentes||{})[ano]||{}).forEach(([id,r])=>{
        const name=ano+' — '+id;result.set(name,[r.name||'',r.email||'Sem e-mail'].join(' · '));
        Object.entries(r.attendance||{}).forEach(([day,a])=>result.set(name+' — frequência '+day,'Manhã: '+(a.morning||'sem registro')+'; tarde: '+(a.afternoon||'sem registro')));
      });
    });
    result.set('Vínculos de preceptores',String(app.preceptores||'').split(/\r?\n/).filter(Boolean).sort().join('\n')||'Nenhum');
    return result;
  }
  function closeReview(){if(review){review.remove();review=null;}}
  function addText(parent,tag,text){const el=document.createElement(tag);el.textContent=text;parent.appendChild(el);return el;}
  async function reviewCadastros(){
    if(!token()){loginForSync=true;abrirLoginAutoavaliacoes();return;}
    if(running){status('Aguarde o envio em andamento antes de conferir o cadastro.');return;}
    try{
      const central=await api('cadastros_admin',{acao:'consultar'});
      if(!central.app||typeof central.revisao!=='string')throw new Error('O serviço precisa ser atualizado para a sincronização protegida.');
      const local=clone(APP),localText=JSON.stringify(local),left=flatten(central.app),right=flatten(local),keys=[...new Set([...left.keys(),...right.keys()])].filter(k=>left.get(k)!==right.get(k));
      closeReview();review=document.createElement('div');review.className='modal-ov show';review.setAttribute('role','dialog');review.setAttribute('aria-modal','true');review.setAttribute('aria-label','Conferir cadastros');
      const box=document.createElement('div');box.className='modal';box.style.cssText='max-width:780px;max-height:90vh;overflow:auto';review.appendChild(box);
      addText(box,'h2','Conferir cadastros');
      addText(box,'p',keys.length?keys.length+' diferença(s) entre o cadastro central e este aparelho. Confira antes de escolher qual versão usar.':'Os cadastros de identificação e frequência conferidos são equivalentes.');
      const list=document.createElement('div');list.style.cssText='max-height:45vh;overflow:auto;margin:12px 0';box.appendChild(list);
      keys.forEach(k=>{const item=document.createElement('section');item.style.cssText='padding:10px;border-bottom:1px solid #ddd;white-space:pre-wrap;overflow-wrap:anywhere';addText(item,'strong',k);addText(item,'p','Central: '+(left.get(k)||'Não consta'));addText(item,'p','Neste aparelho: '+(right.get(k)||'Não consta'));list.appendChild(item);});
      const message=addText(box,'p','As versões locais substituídas e os envios anteriores ficam preservados neste aparelho para conferência.');message.setAttribute('role','status');
      const use=addText(box,'button','Usar cadastro central');use.className='btn btn-primary';
      const publish=addText(box,'button','Publicar as alterações locais conferidas');publish.className='btn btn-secondary';
      const cancel=addText(box,'button','Voltar sem alterar');cancel.className='btn btn-secondary';cancel.onclick=closeReview;
      use.onclick=()=>{
        if(JSON.stringify(APP)!==localText){message.textContent='O cadastro local mudou. Feche e confira novamente.';return;}
        archive([{tipo:'cadastro_local_antes_da_conferencia',dados:local,ts:Date.now()}]);archiveCadastros();
        APP={...APP,...clone(central.app)};saveApp();setRevision(central.revisao);closeReview();status('Cadastro central carregado.');location.reload();
      };
      publish.onclick=async()=>{
        if(JSON.stringify(APP)!==localText){message.textContent='O cadastro local mudou. Feche e confira novamente.';return;}
        use.disabled=publish.disabled=cancel.disabled=true;
        try{
          const result=await api('cadastros_admin',{acao:'salvar',app:local,revisao:central.revisao});
          archiveCadastros();setRevision(result.revisao);closeReview();status('Alterações conferidas e publicadas.');showToast('Cadastro sincronizado.','s');
        }catch(e){if(e.codigo==='CONFLITO_REVISAO')setRevision('');message.textContent=e.message;use.disabled=publish.disabled=cancel.disabled=false;}
      };
      document.body.appendChild(review);
    }catch(e){status(e.message);showToast(e.message,'e');}
  }
  function exportPreserved(){
    let preserved=[];try{preserved=JSON.parse(localStorage.getItem(legacyKey)||'[]');}catch{}
    const blob=new Blob([JSON.stringify({salvoEm:new Date().toISOString(),cadastroLocal:APP,filaAtual:queue(),preservados:preserved},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='residped-alteracoes-preservadas.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function logoutSync(){
    AUTOAVAL_ADMIN_TOKEN='';AUTOAVAL_ADMIN_DATA=[];loginForSync=false;closeReview();
    if(typeof signOutSupervision==='function')signOutSupervision();
    if(window.google&&google.accounts)google.accounts.id.disableAutoSelect();
    status('Sessão encerrada. As alterações locais permanecem preservadas.');
  }
  const originalLogin=receberLoginAutoavaliacoes;
  window.receberLoginAutoavaliacoes=async response=>{await originalLogin(response);status();if(loginForSync){loginForSync=false;await sync();}};
  window.getPendentes=queue;window.setPendentes=saveQueue;window.addPendente=enqueue;
  window.atualizarStatusSync=status;window.processarFila=flush;window.syncData=sync;
  window.enviarParaSheets=async(tipo,dados)=>{const id=enqueue(tipo,dados);if(!id)return false;await flush();return !queue().some(x=>x.queueId===id);};
  window.sincronizarAuto=window.enviarParaSheets;
  window.registrarPonto=async()=>showToast('Registre o ponto no Portal do Residente, com sua conta Google.','e');
  window.ResidPedSecurity={review:reviewCadastros,sync,logout:logoutSync,exportPreserved,status,flatten};
  function init(){migrateQueue();[['security-review',reviewCadastros],['security-login',()=>{loginForSync=true;abrirLoginAutoavaliacoes();}],['security-logout',logoutSync],['security-preserved',exportPreserved]].forEach(([id,fn])=>{const b=document.getElementById(id);if(b)b.onclick=fn;});status();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
