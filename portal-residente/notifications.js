(function(){
  'use strict';
  const core=window.ResidentNotificationsCore,catalog=window.ResidentSupportMessages;
  const byId=new Map(catalog.messages.map(m=>[m.id,m])),topics=new Map(catalog.topics.map(t=>[t.id,t]));
  const prefix='portal_support_v1_',tag='portal-residente-support';
  let accountKey='',state=core.defaults(),generation=0,timer=null,storageOK=true,view='inbox',filter='',limit=8,permissionBusy=false,lastSync=0,syncing=false,settingsBusy=false;
  const el=id=>document.getElementById(id);
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dateLabel=day=>day.split('-').reverse().join('/');
  function read(){
    if(!accountKey||!storageOK)return state;
    try{const raw=localStorage.getItem(accountKey);return core.normalize(raw?JSON.parse(raw):null);}
    catch(error){if(error instanceof SyntaxError)return core.defaults();storageOK=false;return state;}
  }
  function save(next){state=core.normalize(next);if(storageOK)try{localStorage.setItem(accountKey,JSON.stringify(state));}catch{storageOK=false;}}
  async function locked(action){
    const ticket=generation,key=accountKey;if(!key)return;
    const run=()=>{if(ticket!==generation||key!==accountKey)return;state=read();return action();};
    if(navigator.locks) return navigator.locks.request(key,run);
    return run();
  }
  async function change(action){await locked(()=>{action(state);save(state);});if(accountKey)render();}
  function activeAlerts(){return ResidentPush.status.active;}
  async function closeAlerts(){
    if(!('serviceWorker' in navigator))return;
    try{const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href).href);if(reg&&reg.getNotifications)(await reg.getNotifications({tag})).forEach(n=>n.close());}catch{}
  }
  function feedback(text,error=false){const target=el('supportFeedback');if(!target)return;target.textContent=text;target.style.color=error?'#8b1f1f':'#00613a';}
  async function mergeRemote(raw){
    if(!raw)return;const remote=core.normalize(raw);
    await change(s=>{const reads=new Set(s.history.filter(e=>e.read).map(e=>e.date+'|'+e.messageId));s.preferences=remote.preferences;s.pausedUntil=remote.pausedUntil;s.cursor=remote.cursor;s.lastDate=remote.lastDate;s.lastPushDate=remote.lastPushDate;s.history=remote.history.map(e=>({...e,read:reads.has(e.date+'|'+e.messageId)}));});
  }
  async function saveRemote(preferences,pausedUntil){
    if(settingsBusy)throw new Error('Aguarde o salvamento em andamento.');
    const ticket=generation;settingsBusy=true;
    try{const remote=await ResidentPush.update(preferences,pausedUntil);if(ticket===generation&&accountKey)await mergeRemote(remote);}
    finally{if(ticket===generation)settingsBusy=false;}
  }
  async function tick(force=false){
    if(!accountKey||document.visibilityState!=='visible'||syncing)return;
    const ticket=generation;
    syncing=true;
    try{
      if(ResidentPush.status.available){
        if(force||Date.now()-lastSync>300000){const remote=await ResidentPush.sync();if(ticket!==generation||!accountKey)return;await mergeRemote(remote);lastSync=Date.now();}
      }
      if(ticket!==generation||!accountKey)return;
      render();
    }catch{if(ticket===generation)feedback('Não foi possível atualizar as mensagens. Verifique sua conexão e entre novamente se a sessão expirou.',true);}
    finally{if(ticket===generation)syncing=false;}
  }
  function statusText(){
    const p=state.preferences;
    if(!catalog.messages.length)return 'As mensagens estão em revisão pela coordenação. Novos textos aparecem após aprovação.';
    if(!ResidentPush.status.configured)return 'Catálogo disponível. Os lembretes automáticos aguardam ativação pela coordenação.';
    if(!p.enabled)return 'Novas mensagens pausadas. Seu histórico e a biblioteca continuam disponíveis.';
    if(state.pausedUntil>Date.now())return 'Pausa até '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Manaus',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(state.pausedUntil))+' (Manaus).';
    if(!p.topics.length)return 'Escolha pelo menos um tema nas preferências para receber novas mensagens.';
    return(p.frequency==='daily'?'Todos os dias':'Segunda, quarta e sexta')+' a partir das '+p.time+' · Manaus · máximo de 1 mensagem por dia por residente.';
  }
  function markup(){
    el('residentNotifications').innerHTML=`<div class="support-area">
      <div class="card support-hero"><div class="support-eyebrow">Estudo · cuidado · equilíbrio</div><h2>Uma pausa para você</h2><p>Pequenos convites para aprender e cuidar de si. Escolha o que faz sentido para o seu momento.</p><div id="supportScheduleStatus" class="support-status"></div></div>
      <div id="supportStorageWarning" class="support-storage-warning hidden" role="status">O navegador não está salvando as preferências. Nesta sessão, você pode explorar as mensagens, mas histórico e favoritos podem se perder ao sair. Os avisos do dispositivo estão desativados.</div>
      <details class="card support-settings" id="supportSettings"><summary>Personalizar lembretes</summary>
        <form id="supportPreferences">
          <label class="support-check"><input id="supportEnabled" type="checkbox">Receber novas mensagens</label>
          <p class="support-hint">No máximo uma mensagem por dia por residente, somando todos os temas e aparelhos. O envio automático usa o aparelho com registro mais recente. Não acumulamos mensagens de dias anteriores.</p>
          <div class="support-grid"><div class="field"><label for="supportFrequency">Frequência</label><select id="supportFrequency"><option value="daily">Todos os dias</option><option value="three-week">3× por semana</option></select></div><div class="field"><label for="supportTime">Horário de Manaus</label><input id="supportTime" type="time" required></div></div><p class="support-hint">Na opção 3× por semana: segunda, quarta e sexta.</p>
          <fieldset><legend>Horário de silêncio</legend><div class="support-grid"><div class="field"><label for="supportQuietStart">Início do silêncio</label><input id="supportQuietStart" type="time" required></div><div class="field"><label for="supportQuietEnd">Fim do silêncio</label><input id="supportQuietEnd" type="time" required></div></div><p class="support-hint">Não há novos lembretes nesse intervalo. Horários iguais desativam o período de silêncio.</p></fieldset>
          <fieldset><legend>Temas que você quer receber</legend><div class="support-topic-options">${catalog.topics.map(t=>`<label class="support-check"><input type="checkbox" name="supportTopic" value="${t.id}">${t.icon} ${t.label}</label>`).join('')}</div></fieldset>
          <button type="submit" class="btn primary">Salvar preferências</button>
        </form>
        <div class="support-settings-actions"><button type="button" class="btn secondary" data-support-action="pause">Pausar por 24 horas</button><button type="button" class="btn secondary hidden" id="supportResume" data-support-action="resume">Retomar mensagens</button></div>
        <div class="support-browser"><h3>Receber com o aplicativo fechado</h3><p class="support-hint">Ative os avisos neste aparelho e permita as notificações. No iPhone ou iPad (iOS/iPadOS 16.4 ou posterior), adicione o portal à tela inicial e abra por esse ícone. A entrega depende da conexão e das configurações do dispositivo.</p><p id="supportBrowserStatus" class="support-hint"></p><div class="support-settings-actions"><button type="button" class="btn secondary" id="supportBrowserToggle" data-support-action="browser">Ativar avisos no dispositivo</button><button type="button" class="btn secondary hidden" id="supportTest" data-support-action="test">Enviar aviso de teste</button></div></div>
        <p class="support-hint">Horários, temas, histórico de envio e registro do dispositivo são salvos no serviço do programa para permitir os avisos. O Firebase processa a entrega. Favoritos e marcações de leitura ficam neste navegador. Essas escolhas não integram suas avaliações. Ao sair da conta, os avisos deste aparelho são desativados.</p>
        <p class="support-hint">O teste envia a mensagem aprovada do dia e utiliza o mesmo limite: depois dele, não haverá outro aviso naquele dia.</p>
      </details>
      <div id="supportFeedback" class="support-feedback" role="status" aria-live="polite"></div>
      <div class="support-toolbar"><h2>Suas mensagens</h2><button class="support-link" data-support-action="read-all">Marcar todas como lidas</button></div>
      <div class="support-filters"><div><label for="supportView">Exibir</label><select id="supportView"><option value="inbox">Recebidas</option><option value="favorites">Favoritas</option><option value="library">Explorar mensagens (${catalog.messages.length})</option></select></div><div><label for="supportTopicFilter">Filtrar por tema</label><select id="supportTopicFilter"><option value="">Todos os temas</option>${catalog.topics.map(t=>`<option value="${t.id}">${t.label}</option>`).join('')}</select></div></div>
      <p id="supportResultCount" class="support-hint" role="status" aria-live="polite"></p><div id="supportList"></div><button class="btn secondary support-more hidden" id="supportMore" data-support-action="more">Mostrar mais mensagens</button>
      <details class="support-sources"><summary>Sobre estas mensagens e referências</summary><p>Textos autorais de incentivo e sugestões gerais, sem metas obrigatórias. As referências orientam os temas de autocuidado, movimento e estratégias de estudo; não são citações literais nem avaliação individual de saúde.</p>${catalog.sources.map(s=>`<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a>`).join('')}</details>
    </div>`;
    el('supportPreferences').addEventListener('submit',savePreferences);
    el('residentNotifications').addEventListener('click',onAction);
    el('supportView').addEventListener('change',event=>{view=event.target.value;limit=8;renderList();});
    el('supportTopicFilter').addEventListener('change',event=>{filter=event.target.value;limit=8;renderList();});
    fillPreferences();
  }
  function fillPreferences(){const p=state.preferences;el('supportEnabled').checked=p.enabled;el('supportFrequency').value=p.frequency;el('supportTime').value=p.time;el('supportQuietStart').value=p.quietStart;el('supportQuietEnd').value=p.quietEnd;document.querySelectorAll('[name="supportTopic"]').forEach(input=>input.checked=p.topics.includes(input.value));}
  async function savePreferences(event){
    event.preventDefault();
    const p={enabled:el('supportEnabled').checked,frequency:el('supportFrequency').value,time:el('supportTime').value,quietStart:el('supportQuietStart').value,quietEnd:el('supportQuietEnd').value,topics:[...document.querySelectorAll('[name="supportTopic"]:checked')].map(input=>input.value)};
    if(![p.time,p.quietStart,p.quietEnd].every(core.validTime)){feedback('Informe horários válidos.',true);return;}
    if(p.enabled&&!p.topics.length){feedback('Escolha pelo menos um tema ou desative as novas mensagens.',true);return;}
    if(p.enabled&&core.inQuiet(core.minutes(p.time),p)){feedback('Escolha um horário de lembrete fora do período de silêncio.',true);return;}
    try{await saveRemote({...state.preferences,...p},state.pausedUntil);
      if(!accountKey)return;fillPreferences();feedback('Preferências salvas para sua conta.');
      if(!p.enabled)await closeAlerts();await tick();
    }catch(error){feedback('Não foi possível salvar. '+error.message,true);}
  }
  function renderBrowser(){
    const button=el('supportBrowserToggle');let description;
    const push=ResidentPush.status;
    if(push.loading)description='Verificando o serviço de envio…';
    else if(push.error)description=push.error;
    else if(!push.configured)description='O envio com o aplicativo fechado aguarda a configuração do Firebase e do agendamento pela coordenação.';
    else if(!ResidentPush.supported())description='Push indisponível neste navegador. No iPhone, instale o portal na tela inicial e abra por esse ícone.';
    else if(Notification.permission==='denied')description='Permissão bloqueada. Para habilitar, altere a permissão de notificações deste site no navegador.';
    else description=activeAlerts()?'Ativado neste aparelho, inclusive com o aplicativo fechado.':'Desativado neste aparelho. A permissão só será solicitada ao tocar em Ativar.';
    el('supportBrowserStatus').textContent=description;
    button.disabled=permissionBusy||push.loading||(!activeAlerts()&&(!push.configured||!ResidentPush.supported()||!storageOK||Notification.permission==='denied'));
    button.textContent=activeAlerts()?'Desativar avisos no dispositivo':'Ativar avisos no dispositivo';
    el('supportTest').classList.toggle('hidden',!activeAlerts());
    el('supportTest').disabled=state.lastPushDate>=core.localTime().day;
    el('supportTest').title=el('supportTest').disabled?'Limite diário já utilizado. Aguarde o próximo dia, no horário de Manaus.':'';
  }
  function render(){
    if(!accountKey||!el('supportList'))return;
    const unread=state.history.filter(item=>!item.read).length;
    document.querySelectorAll('[data-support-count]').forEach(badge=>{badge.textContent=unread;badge.classList.toggle('hidden',!unread);});
    el('supportBell').setAttribute('aria-label',unread?`Para você: ${unread} mensagens não lidas`:'Abrir mensagens para você');
    el('supportScheduleStatus').textContent=statusText();
    el('supportSummaryText').textContent=unread?`${unread===1?'Uma mensagem espera':unread+' mensagens esperam'} por você. Leia quando for um bom momento.`:'Inspiração para estudar e cuidar de si, no seu ritmo.';
    el('supportStorageWarning').classList.toggle('hidden',storageOK);
    el('supportResume').classList.toggle('hidden',state.pausedUntil<=Date.now()&&state.preferences.enabled);
    renderBrowser();renderList();
  }
  function renderList(){
    let rows=view==='library'?catalog.messages.map(message=>({message})):view==='favorites'?state.favorites.map(id=>({message:byId.get(id)})):[...state.history].reverse().map(entry=>({message:byId.get(entry.messageId),entry}));
    if(filter)rows=rows.filter(row=>row.message.topic===filter);
    el('supportResultCount').textContent=rows.length?`${Math.min(limit,rows.length)} de ${rows.length} ${rows.length===1?'mensagem':'mensagens'}`:'';
    el('supportList').innerHTML=rows.length?rows.slice(0,limit).map(({message:m,entry})=>{
      const topic=topics.get(m.topic),favorite=state.favorites.includes(m.id);
      return `<article class="card support-message ${entry&&!entry.read?'is-unread':''}"><div class="support-message-meta"><span class="support-topic">${topic.icon} ${escape(topic.label)}</span><span>${entry?dateLabel(entry.date)+(entry.read?'':' · Não lida'):'Para ler no seu tempo'}</span></div><h3>${escape(m.title)}</h3><p>${escape(m.body)}</p><p class="support-action"><strong>SE FIZER SENTIDO HOJE</strong>${escape(m.action)}</p><div class="support-message-actions"><button class="support-link" data-support-action="favorite" data-message="${m.id}" aria-pressed="${favorite}" aria-label="${favorite?'Remover dos favoritos':'Favoritar'}: ${escape(m.title)}">${favorite?'★ Salva nos favoritos':'☆ Guardar para reler'}</button>${entry&&!entry.read?`<button class="btn secondary" data-support-action="read" data-date="${entry.date}">Marcar como lida</button>`:entry?'<span class="support-read-label">✓ Lida</span>':''}</div></article>`;
    }).join(''):`<div class="card support-empty"><h3>${view==='favorites'?'Suas favoritas ficam aqui':view==='inbox'?'Um espaço no seu ritmo':'Nenhuma mensagem neste filtro'}</h3><p>${filter?'Nenhuma mensagem corresponde ao tema selecionado.':view==='favorites'?'Use “Guardar para reler” em uma mensagem que queira encontrar depois.':view==='inbox'?'As mensagens chegam conforme suas preferências. Você também pode explorar o catálogo a qualquer momento.':'Selecione outro tema para continuar.'}</p>${view!=='library'?'<button class="btn secondary" data-support-action="explore">Explorar mensagens</button>':''}</div>`;
    el('supportMore').classList.toggle('hidden',rows.length<=limit);
  }
  async function toggleBrowser(){
    if(permissionBusy)return;
    const ticket=generation;
    permissionBusy=true;renderBrowser();
    try{
      if(activeAlerts()){await ResidentPush.disable();if(ticket===generation)feedback(ResidentPush.status.error||'Avisos deste aparelho desativados.');}
      else{const remote=await ResidentPush.enable();if(ticket!==generation||!accountKey)return;await mergeRemote(remote);feedback('Avisos ativados, inclusive com o aplicativo fechado. Você pode enviar um teste.');}
    }catch(error){if(ticket===generation&&accountKey)feedback(error.message||'Não foi possível ativar os avisos.',true);}
    finally{if(ticket===generation){permissionBusy=false;if(accountKey)renderBrowser();}}
  }
  async function onAction(event){
    const button=event.target.closest('[data-support-action]');if(!button||!accountKey)return;
    const action=button.dataset.supportAction;
    try{
    if(action==='favorite'){
      const id=button.dataset.message;if(!byId.has(id))return;
      await change(s=>{s.favorites=s.favorites.includes(id)?s.favorites.filter(item=>item!==id):[...s.favorites,id];});
      feedback(state.favorites.includes(id)?'Mensagem guardada nos favoritos.':'Mensagem removida dos favoritos.');
    }else if(action==='read'){await change(s=>{s.history.forEach(item=>{if(item.date===button.dataset.date)item.read=true;});});}
    else if(action==='read-all'){await change(s=>{s.history.forEach(item=>item.read=true);});feedback('Todas as mensagens recebidas foram marcadas como lidas.');await closeAlerts();}
    else if(action==='pause'){await saveRemote(state.preferences,Date.now()+24*60*60*1000);feedback('Novas mensagens pausadas por 24 horas em todos os seus aparelhos.');await closeAlerts();}
    else if(action==='resume'){await saveRemote({...state.preferences,enabled:true,topics:state.preferences.topics.length?state.preferences.topics:core.defaults().preferences.topics},0);fillPreferences();feedback('Mensagens retomadas conforme suas preferências.');await tick();}
    else if(action==='browser')await toggleBrowser();
    else if(action==='test'){const remote=await ResidentPush.test();await mergeRemote(remote);feedback('Mensagem de hoje aceita pelo serviço de envio. Limite diário utilizado.');}
    else if(action==='explore'){view='library';filter='';limit=8;el('supportView').value=view;el('supportTopicFilter').value='';renderList();}
    else if(action==='more'){limit+=8;renderList();}
    }catch(error){feedback(error.message||'Não foi possível concluir. Tente novamente.',true);}
  }
  function open(){if(!accountKey)return;const button=document.querySelector('[data-page="apoio"]');showPage('apoio',button);button.scrollIntoView({block:'nearest',inline:'nearest'});tick(true);}
  async function start(profile){
    reset();if(!profile||profile.papel!=='residente'||!profile.email)return;
    accountKey=prefix+encodeURIComponent(profile.email.trim().toLowerCase());storageOK=true;state=read();view='inbox';filter='';limit=8;markup();render();
    const ticket=generation;const loading=ResidentPush.load(profile);render();
    if(location.hash==='#para-voce')open();
    const remote=await loading;if(ticket!==generation||!accountKey)return;
    await mergeRemote(remote);fillPreferences();lastSync=Date.now();render();timer=setInterval(tick,30000);
  }
  function reset(){
    generation++;clearInterval(timer);timer=null;accountKey='';state=core.defaults();permissionBusy=false;syncing=false;settingsBusy=false;ResidentPush.reset();
    if(el('residentNotifications')){el('residentNotifications').removeEventListener('click',onAction);el('residentNotifications').replaceChildren();}
    document.querySelectorAll('[data-support-count]').forEach(b=>{b.textContent='';b.classList.add('hidden');});
    closeAlerts();
  }
  window.addEventListener('storage',event=>{if(accountKey&&(event.key===accountKey||event.key===null)){state=read();render();}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick();});
  window.addEventListener('hashchange',()=>{if(location.hash==='#para-voce')open();});
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data&&event.data.type==='open-resident-support')open();else if(event.data&&event.data.type==='resident-support-received')tick(true);});
  window.ResidentNotifications={start,reset,open,refresh:tick};
})();
