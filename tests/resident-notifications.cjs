// Integração local: API Google e Firebase simuladas, sem mensagens a residentes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),drafts=require('../../../07_ANALISE_E_CODIGO/notification-drafts.cjs'),core=require('../portal-residente/notifications-core.js').create(drafts),{serialize}=require('../../../07_ANALISE_E_CODIGO/build-notification-catalog.cjs');
const out=path.resolve(root,'../../tmp/resident-notifications');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const target=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;if(file===path.join(root,'portal-residente','support-messages.js')){res.writeHead(200,{'Content-Type':'application/javascript'});res.end(serialize(drafts));return;}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'text/plain'});res.end(error?'Not found':data);});});
let remote=core.deliver(core.defaults(),new Date('2026-09-07T16:30:00Z')).state,active=false,configured=true,fail=false,hold=false,release,apiCalls=[],errors=[];
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},permissions:['notifications'],serviceWorkers:'allow'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await context.route('https://accounts.google.com/**',route=>route.fulfill({contentType:'application/javascript',body:`window.google={accounts:{id:{initialize(o){this.options=o},renderButton(el){const b=document.createElement('button');b.textContent='Entrer test';b.onclick=()=>this.options.callback({credential:'alfa'});el.appendChild(b)},disableAutoSelect(){}}}};`}));
    await context.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().endsWith('firebase-app.js')?`export function getApps(){return []}export function initializeApp(config,name){return {name}}`:`export async function isSupported(){return true}export function getMessaging(){return {}}export async function getToken(){return '${'a'.repeat(90)}'}`}));
    await context.route('https://script.google.com/**',async route=>{
      const body=route.request().postDataJSON();apiCalls.push(body);let result={ok:true};
      if(body.tipo==='perfil_residente')result.perfil={papel:'residente',nome:'Residente de teste',email:body.token+'@example.test',ano:'R1',id:'r1'};
      else if(body.tipo==='minha_escala')result={ok:true,atual:null};
      else if(body.tipo==='notificacoes_residente'){
        if(hold){hold=false;await new Promise(resolve=>release=resolve);}
        if(fail){await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:false,erro:'Falha simulada'})});return;}
        const d=body.dados;if(d.acao==='preferencias'){remote.preferences=d.preferencias;remote.pausedUntil=d.pausadoAte;}
        if(d.acao==='ativar')active=true;if(d.acao==='desativar')active=false;
        if(d.acao==='teste')remote.lastPushDate=core.localTime().day;
        result={ok:true,config:{configured,scheduled:configured,vapidKey:'A'.repeat(87),firebase:{apiKey:'fake',projectId:'resident-test',appId:'fake',messagingSenderId:'123'}},state:body.token==='beta'?core.defaults():remote,ativo:body.token==='beta'?false:active,dispositivoId:body.token==='beta'?'':active?'device-test':''};
      }else if(body.tipo==='fichas_residente'||body.tipo==='fichas_frequencia_residente')result.fichas=[];
      await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    });
    await page.goto(origin+'/portal-residente/');await page.getByText('Entrer test',{exact:true}).click();await page.waitForFunction(()=>window.ResidentPush?.status.available);
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.locator('[data-page="apoio"]').click();
    await page.locator('.support-message').waitFor();assert.equal(await page.locator('.support-message').count(),1);
    assert.equal(apiCalls.some(c=>c.dados.acao==='ativar'),false);
    await page.getByRole('button',{name:'Favoritar: Um passo possível',exact:true}).click();await page.getByText('Mensagem guardada nos favoritos.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Marcar como lida',exact:true}).click();await page.getByText('✓ Lida',{exact:true}).waitFor();assert.equal(await page.locator('#supportBell .support-count').isVisible(),false);
    await page.getByLabel('Exibir',{exact:true}).selectOption('library');assert.equal(await page.locator('.support-message').count(),8);
    await page.getByRole('button',{name:'Mostrar mais mensagens'}).click();assert.equal(await page.locator('.support-message').count(),16);
    await page.getByLabel('Filtrar por tema',{exact:true}).selectOption('movimento');assert.equal(await page.locator('.support-message').count(),8);
    await page.getByText('Personalizar lembretes',{exact:true}).click();
    await page.getByLabel('Horário de Manaus',{exact:true}).fill('22:00');await page.getByRole('button',{name:'Salvar preferências'}).click();await page.getByText('Escolha um horário de lembrete fora do período de silêncio.',{exact:true}).waitFor();
    await page.getByLabel('Horário de Manaus',{exact:true}).fill('14:00');await page.getByLabel('Frequência',{exact:true}).selectOption('three-week');
    await page.getByRole('button',{name:'Salvar preferências'}).click();await page.getByText('Preferências salvas para sua conta.',{exact:true}).waitFor();assert.equal(remote.preferences.time,'14:00');assert.equal(remote.preferences.frequency,'three-week');
    await page.getByRole('button',{name:'Pausar por 24 horas'}).click();await page.getByText('Novas mensagens pausadas por 24 horas em todos os seus aparelhos.',{exact:true}).waitFor();assert.ok(remote.pausedUntil>Date.now());
    await page.getByRole('button',{name:'Retomar mensagens'}).click();await page.getByText('Mensagens retomadas conforme suas preferências.',{exact:true}).waitFor();assert.equal(remote.pausedUntil,0);
    await page.getByRole('button',{name:'Ativar avisos no dispositivo',exact:true}).click();await page.getByText('Avisos ativados, inclusive com o aplicativo fechado. Você pode enviar um teste.',{exact:true}).waitFor();assert.equal(active,true);
    await page.getByRole('button',{name:'Enviar aviso de teste'}).click();await page.getByText('Mensagem de hoje aceita pelo serviço de envio. Limite diário utilizado.',{exact:true}).waitFor();assert.ok(apiCalls.some(c=>c.dados.acao==='teste'));assert.equal(await page.locator('#supportTest').isDisabled(),true);
    // Check a persistent worker with no portal window: a synthetic FCM envelope
    // reaches the real push listener and produces a real browser notification.
    const worker=context.serviceWorkers()[0];assert.ok(worker);
    await worker.evaluate(()=>caches.open('portal-preceptor-keep')); // activation must not erase sibling apps.
    await page.close();assert.equal(context.pages().length,0);
    const delivered=await worker.evaluate(async()=>{
      const reg=self.registration,day=ResidentNotificationsCore.localTime().day;
      await ResidentPushStore.set({id:'device-test',active:true,preferences:{...ResidentNotificationsCore.defaults().preferences,quietStart:'00:00',quietEnd:'00:00'},pausedUntil:0});
      const push={data:{type:'resident-support',deviceId:'device-test',messageId:'apoio-01',date:day,expiresAt:String(Date.now()+60000)}};
      self.dispatchEvent(new PushEvent('push',{data:JSON.stringify(push)}));
      for(let i=0;i<40;i++){const list=await reg.getNotifications({tag:'portal-residente-support'});if(list.length)return{count:list.length,title:list[0].title};await new Promise(r=>setTimeout(r,50));}
      return{count:0};
    });assert.equal(delivered.count,1);assert.match(delivered.title,/Um passo possível/);
    const claimChecks=await worker.evaluate(async()=>{
      const data={deviceId:'device-test',date:ResidentNotificationsCore.localTime().day,messageId:'apoio-01',expiresAt:String(Date.now()+60000)};
      const duplicate=await ResidentPushStore.claim(data),testBypass=await ResidentPushStore.claim({...data,messageId:'teste'}),wrong=await ResidentPushStore.claim({...data,deviceId:'other'}),expired=await ResidentPushStore.claim({...data,expiresAt:'1'});
      await ResidentPushStore.clear();const loggedOut=await ResidentPushStore.claim(data);return{duplicate,testBypass,wrong,expired,loggedOut};
    });assert.deepEqual(claimChecks,{duplicate:false,testBypass:false,wrong:false,expired:false,loggedOut:false});
    const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));await p.goto(origin+'/portal-residente/#para-voce');await p.getByText('Entrer test',{exact:true}).click();await p.waitForFunction(()=>window.ResidentPush?.status.available);await p.locator('#page-apoio').waitFor({state:'visible'});
    await p.getByLabel('Exibir',{exact:true}).selectOption('favorites');await p.locator('.support-message').waitFor();assert.equal(await p.locator('.support-message').count(),1);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:path.join(out,'para-voce-celular.png'),fullPage:true});
    await p.getByText('Personalizar lembretes',{exact:true}).click();await p.screenshot({path:path.join(out,'preferencias-celular.png'),fullPage:true});
    fail=true;await p.getByLabel('Horário de Manaus',{exact:true}).fill('15:00');await p.getByRole('button',{name:'Salvar preferências'}).click();await p.getByText('Não foi possível salvar. Falha simulada',{exact:true}).waitFor();assert.equal(remote.preferences.time,'14:00');fail=false;
    await p.getByRole('button',{name:'Desativar avisos no dispositivo',exact:true}).click();await p.getByText('Avisos deste aparelho desativados.',{exact:true}).waitFor();assert.equal(active,false);
    await p.evaluate(async()=>{await ResidentPush.logout();ResidentNotifications.reset();TOKEN='beta';PROFILE={papel:'residente',nome:'Beta',email:'beta@example.test',ano:'R1',id:'r2'};await ResidentNotifications.start(PROFILE);});
    await p.getByLabel('Exibir',{exact:true}).selectOption('favorites');assert.equal(await p.locator('.support-message').count(),0);assert.equal(await p.evaluate(()=>ResidentPush.status.active),false);
    hold=true;await p.evaluate(()=>{void ResidentNotifications.refresh(true);});await p.waitForTimeout(100);assert.equal(typeof release,'function');await p.evaluate(()=>{ResidentNotifications.reset();TOKEN='';PROFILE=null;});release();await p.waitForTimeout(200);assert.equal(await p.locator('#residentNotifications').innerText(),'');
    // A browser that offers no push API must still allow login, library and logout.
    const unsupported=await browser.newContext({serviceWorkers:'block'}),u=await unsupported.newPage();await u.addInitScript(()=>{Object.defineProperty(window,'Notification',{value:undefined,configurable:true});Object.defineProperty(window,'PushManager',{value:undefined,configurable:true});});
    await u.route('**/*',route=>{if(route.request().url().includes('accounts.google.com'))return route.fulfill({contentType:'application/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}}}}'});return route.continue();});
    await u.goto(origin+'/portal-residente/');await u.evaluate(async()=>{ResidentPush.reset();await ResidentPush.logout();});await unsupported.close();
    assert.deepEqual(errors,[]);console.log('OK: central, favoritos, filtros, leitura, preferências, pausa, opt-in push, teste, worker com todas as janelas fechadas, duplicatas, expiração, logout, falha, conta isolada, resposta atrasada e celular.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
