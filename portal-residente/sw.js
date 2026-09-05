importScripts('./support-messages.js','./notifications-core.js','./push-store.js');
const CACHE='portal-residente-v8';
const FILES=['../shared/attendance-records.js','../shared/attendance-records.css','./','./index.html','./manifest.webmanifest','./icon.svg','./evaluation-records.js','./support-messages.js','./notifications-core.js','./notifications.css','./notifications.js','./push-store.js','./push-client.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('portal-residente-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.hostname.includes('accounts.google.com')||url.hostname.includes('script.google.com'))return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))))});

// FCM sends a data-only Web Push envelope; this worker handles both foreground
// and background delivery, without displaying a second SDK notification.
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload;try{payload=event.data.json();}catch{return;}
    const data=payload&&payload.data;if(!data||data.type!=='resident-support')return;
    const message=ResidentSupportMessages.messages.find(m=>m.id===data.messageId);
    if(!message||!await ResidentPushStore.claim(data))return;
    await self.registration.showNotification('ResidPed · '+message.title,{body:message.body,icon:new URL('./icon.svg',self.registration.scope).href,tag:'portal-residente-support',data:{type:'resident-support'},renotify:false});
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    clients.filter(client=>client.url.startsWith(self.registration.scope)).forEach(client=>client.postMessage({type:'resident-support-received'}));
  })());
});
self.addEventListener('notificationclick',event=>{
  if(!event.notification.data||event.notification.data.type!=='resident-support')return;
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(c=>c.url.startsWith(self.registration.scope));
    if(client){await client.focus();client.postMessage({type:'open-resident-support'});}
    else await self.clients.openWindow(new URL('./#para-voce',self.registration.scope).href);
  })());
});
