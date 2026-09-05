(function(){
  'use strict';
  const key='resident-support-device-v1';
  let epoch=0,owner='',config=null,deviceId='',active=false,messaging=null,sdk=null,pending=false;
  const status={available:false,configured:false,active:false,loading:false,error:''};
  function metadata(){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
  function remember(){localStorage.setItem(key,JSON.stringify({email:owner,id:deviceId}));}
  function forget(){try{localStorage.removeItem(key);}catch{}}
  async function request(data,auth=TOKEN){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({tipo:'notificacoes_residente',dados:data,token:auth}),signal:controller.signal});const out=await r.json();if(!out.ok)throw new Error(out.erro||'Não foi possível acessar o serviço de notificações.');return out;}
    finally{clearTimeout(timeout);}
  }
  function supported(){return isSecureContext&&typeof Notification!=='undefined'&&'serviceWorker' in navigator&&typeof PushManager!=='undefined'&&'indexedDB' in window;}
  async function library(){
    if(!sdk){const [app,cloud]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging.js')]);sdk={...app,...cloud};}
    if(!await sdk.isSupported())throw new Error('Este navegador não oferece suporte a notificações push.');
    if(!messaging)messaging=sdk.getMessaging(sdk.getApps().find(a=>a.name==='resident-support')||sdk.initializeApp(config.firebase,'resident-support'));
    return sdk;
  }
  async function registration(){const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href).href);if(!reg||!reg.active)throw new Error('Recarregue o portal para concluir a preparação do dispositivo.');return reg;}
  async function localStop(){
    await ResidentPushStore.clear();
    if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href).href);if(reg){const subscription=await reg.pushManager.getSubscription();if(subscription&&!await subscription.unsubscribe())throw new Error('Não foi possível desativar os avisos neste dispositivo. Tente novamente.');if(reg.getNotifications)(await reg.getNotifications({tag:'portal-residente-support'})).forEach(n=>n.close());}}
    active=false;status.active=false;forget();
  }
  async function apply(result){
    if(!result.config||!result.state)throw new Error('Atualize o serviço do portal para habilitar as notificações.');
    config=result.config;deviceId=result.dispositivoId||'';active=result.ativo===true&&supported()&&Notification.permission==='granted';
    status.available=true;status.configured=!!(config&&config.configured&&config.scheduled);status.active=active;status.error='';
    if(active){remember();await ResidentPushStore.set({id:deviceId,active:true,preferences:result.state.preferences,pausedUntil:result.state.pausedUntil});}
    else if(supported())await ResidentPushStore.clear();
    return result.state;
  }
  async function load(profile){
    const ticket=++epoch,auth=TOKEN;owner=profile.email.trim().toLowerCase();status.loading=true;status.available=false;status.error='';
    try{
      const old=metadata();if(old&&old.email!==owner&&supported())await localStop();
      if(ticket!==epoch)return null;
      deviceId=old&&old.email===owner?old.id:'';
      const result=await request({acao:'consultar',dispositivoId:deviceId},auth);if(ticket!==epoch)return null;
      const remote=await apply(result);
      if(active){
        try{
          const cloud=await library(),reg=await registration();if(ticket!==epoch)return null;
          const fcmToken=await cloud.getToken(messaging,{vapidKey:config.vapidKey,serviceWorkerRegistration:reg});if(ticket!==epoch)return null;
          const refreshed=await request({acao:'ativar',fcmToken,dispositivoId:deviceId},auth);if(ticket!==epoch){await request({acao:'desativar',dispositivoId:refreshed.dispositivoId},auth).catch(()=>{});return null;}
          await apply(refreshed);
        }catch{if(ticket===epoch)status.error='Não foi possível verificar a renovação deste aparelho. Se os avisos pararem, desative e ative novamente.';}
      }
      return remote;
    }catch(error){if(ticket===epoch){status.error='O envio automático ainda está indisponível. '+error.message;status.active=false;}return null;}
    finally{if(ticket===epoch)status.loading=false;}
  }
  async function sync(){if(!status.available||pending)return null;const ticket=epoch;const result=await request({acao:'consultar',dispositivoId:deviceId});if(ticket!==epoch)return null;return apply(result);}
  async function update(preferences,pausedUntil){
    if(!status.available)throw new Error('O serviço de notificações precisa estar conectado para salvar horários e pausas.');
    const ticket=epoch,result=await request({acao:'preferencias',preferencias:preferences,pausadoAte:pausedUntil,dispositivoId:deviceId});if(ticket!==epoch)return null;return apply(result);
  }
  async function enable(){
    if(pending)return null;if(!status.configured)throw new Error('A coordenação ainda precisa configurar o envio automático.');
    if(!supported())throw new Error('Push indisponível neste navegador. No iPhone, instale o portal na tela inicial e abra por lá.');
    const ticket=epoch,auth=TOKEN;pending=true;
    try{
      const permission=await Notification.requestPermission();if(ticket!==epoch)return null;
      if(permission!=='granted')throw new Error('Permissão não concedida. As mensagens continuam disponíveis no portal.');
      const cloud=await library(),reg=await registration();if(ticket!==epoch)return null;
      const fcmToken=await cloud.getToken(messaging,{vapidKey:config.vapidKey,serviceWorkerRegistration:reg});
      if(ticket!==epoch)return null;
      if(!fcmToken)throw new Error('Não foi possível registrar este dispositivo.');
      const result=await request({acao:'ativar',fcmToken,dispositivoId:deviceId},auth);
      if(ticket!==epoch){await request({acao:'desativar',dispositivoId:result.dispositivoId},auth).catch(()=>{});return null;}
      return await apply(result);
    }catch(error){if(ticket===epoch&&!active)await localStop().catch(()=>{});throw error;}
    finally{if(ticket===epoch)pending=false;}
  }
  async function disable(){
    const id=deviceId,auth=TOKEN;
    await localStop();
    try{if(id&&status.available)await request({acao:'desativar',dispositivoId:id},auth);}
    catch{status.error='Avisos bloqueados neste aparelho. A remoção do registro no servidor ficou pendente até uma nova conexão.';}
    deviceId='';
  }
  async function test(){if(!active)throw new Error('Ative os avisos neste dispositivo antes de testar.');const ticket=epoch,result=await request({acao:'teste',dispositivoId:deviceId});if(ticket!==epoch)return null;return apply(result);}
  async function logout(){epoch++;pending=false;if(supported())await disable();owner='';}
  function reset(){epoch++;pending=false;owner='';config=null;deviceId='';active=false;status.available=false;status.configured=false;status.active=false;status.loading=false;}
  window.ResidentPush={status,supported,load,sync,update,enable,disable,test,logout,reset};
})();
