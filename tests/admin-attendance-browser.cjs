// Dados fictícios, relógio fixo e serviço simulado: nenhum lançamento real.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
const initial={programas:{R1:{moduloName:'Módulo original'},R2:{},R3:{}},residentes:{R1:{},R2:{},R3:{}},preceptores:'Não alterar'};
for(let i=1;i<=17;i++){const year='R'+(i%3+1);initial.residentes[year]['id'+i]={id:'id'+i,name:'Residente '+String(i).padStart(2,'0'),email:'r'+i+'@example.test',attendance:{'2026-09-10':{morning:'P',afternoon:'T'}}};}
initial.residentes.R2.id1.attendance['2026-10-01']={morning:'P',afternoon:'T'};
let app=clone(initial),revision='r1',writes=[],deny=false,conflict=false,failWrite=false,delayRead=false,releaseRead,late=false;
const server=http.createServer((req,res)=>{const target=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain'});res.end(e?'Not found':data);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium'});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-18T20:00:00Z')});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://accounts.google.com/**',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{id:{initialize(o){this.options=o},renderButton(el){const b=document.createElement('button');b.textContent='Confirmar conta de teste';b.onclick=()=>this.options.callback({credential:'admin-test-token'});el.appendChild(b)},disableAutoSelect(){}}}};`}));
  await page.route('https://script.google.com/**',async route=>{
   const body=route.request().postDataJSON();let result={ok:true,autoavaliacoes:[],avaliacoes:[],fichas:[]};
   if(body.tipo==='cadastros_admin'){
    assert.equal(body.token,'admin-test-token');
    if(delayRead){delayRead=false;late=true;await new Promise(resolve=>releaseRead=resolve);}
    if(deny)result={ok:false,codigo:'ACESSO_NEGADO',erro:'Conta sem autorização'};
    else if(body.dados.acao==='salvar'){
     writes.push(clone(body));
     if(failWrite)result={ok:false,erro:'Falha ao salvar'};
     else if(conflict||body.dados.revisao!==revision)result={ok:false,codigo:'CONFLITO_REVISAO',erro:'Revisão em conflito'};
     else {app=clone(body.dados.app);revision+='x';result={ok:true,revisao:revision};}
    }else result={ok:true,app:clone(app),revisao:revision};
   }
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/residentes/#supervisao');
  await page.clock.runFor(3000);await page.locator('#splash').waitFor({state:'hidden'});
  await page.locator('#supervisionAttendanceTab').click();
  const editor=page.locator('#adminAttendanceEditor');assert.equal(await editor.locator('[data-controls]').isVisible(),false);
  await editor.locator('[data-login]').click();await page.getByText('Confirmar conta de teste',{exact:true}).click();
  await editor.getByText('17 residentes cadastrados (R1, R2 e R3).',{exact:true}).waitFor();
  assert.equal(await editor.locator('[data-resident] option').count(),18);
  assert.equal(await page.locator('#adminAttendanceRecords [data-resident] option').count(),18);
  assert.equal(writes.length,0);
  const open=async month=>{await editor.locator('[data-resident]').selectOption(JSON.stringify(['R2','id1']));await editor.locator('[data-month]').fill(month);};
  const prepare=async()=>{await editor.locator('[data-days]').selectOption('all');await editor.locator('[data-select]').click();await editor.locator('[data-value]').selectOption('A');await editor.locator('[data-apply]').click();await editor.locator('[data-review]').click();};
  const save=async()=>{await editor.locator('[data-confirm]').check();await editor.locator('[data-save]').click();};
  await open('2026-10');await prepare();
  assert.match(await editor.locator('[data-summary]').innerText(),/31 dia\(s\), 62 turno\(s\)/);
  assert.match(await editor.locator('[data-summary]').innerText(),/2 registro\(s\) anterior/);
  assert.equal(writes.length,0);assert.equal(await editor.locator('[data-save]').isEnabled(),false);
  await page.evaluate(()=>{localStorage.setItem('residped_pendentes','[]');localStorage.setItem('residped_cadastros_revisao_v1','local-old');});
  const localBefore=await page.evaluate(()=>localStorage.getItem('residped_v3'));
  await save();await editor.getByText(/Frequência salva e conferida/).waitFor();
  assert.equal(writes.length,1);assert.equal(writes[0].dados.revisao,'r1');
  for(let day=1;day<=31;day++)assert.deepEqual(app.residentes.R2.id1.attendance['2026-10-'+String(day).padStart(2,'0')],{morning:'A',afternoon:'A'});
  const expected=clone(initial);expected.residentes.R2.id1.attendance=clone(app.residentes.R2.id1.attendance);assert.deepEqual(app,expected);
  assert.equal(await page.evaluate(()=>localStorage.getItem('residped_v3')),localBefore);
  assert.equal(await page.evaluate(()=>localStorage.getItem('residped_cadastros_revisao_v1')),null);
  await open('2026-11');assert.equal(await editor.locator('[data-end]').inputValue(),'2026-11-18');
  await prepare();assert.match(await editor.locator('[data-summary]').innerText(),/18 dia\(s\), 36 turno\(s\)/);
  await save();await editor.getByText(/Frequência salva e conferida/).waitFor();
  assert.equal(writes.length,2);assert.equal(app.residentes.R2.id1.attendance['2026-11-19'],undefined);
  assert.equal(await editor.locator('[data-day="2026-11-19"]').isDisabled(),true);
  // Revisão alterada antes do envio: não grava sobre dados recentes.
  await open('2026-10');await editor.locator('select[data-date="2026-10-01"][data-shift="morning"]').selectOption('P');await editor.locator('[data-review]').click();revision+='external';
  await save();await editor.getByText(/O cadastro central mudou/).waitFor();assert.equal(writes.length,2);
  // Conflito entre a conferência e a escrita é rejeitado pelo servidor.
  await editor.locator('[data-refresh]').click();await editor.getByText(/17 residentes cadastrados/).waitFor();await open('2026-10');
  await editor.locator('select[data-date="2026-10-01"][data-shift="morning"]').selectOption('P');await editor.locator('[data-review]').click();conflict=true;
  await save();await editor.getByText(/Revisão em conflito/).waitFor();assert.equal(app.residentes.R2.id1.attendance['2026-10-01'].morning,'A');conflict=false;
  // Turno individual; fins de semana não são selecionados na opção dias úteis.
  await editor.locator('[data-refresh]').click();await editor.getByText(/17 residentes cadastrados/).waitFor();await open('2026-10');
  await editor.locator('[data-days]').selectOption('weekdays');await editor.locator('[data-select]').click();assert.equal(await editor.locator('[data-day="2026-10-03"]').isChecked(),false);
  await editor.locator('select[data-date="2026-10-01"][data-shift="morning"]').selectOption('P');await editor.locator('[data-review]').click();await save();await editor.getByText(/Frequência salva e conferida/).waitFor();
  assert.deepEqual(app.residentes.R2.id1.attendance['2026-10-01'],{morning:'P',afternoon:'A'});
  // Data de Manaus evita a virada prematura do mês pelo UTC.
  await page.clock.setFixedTime(new Date('2026-12-01T01:00:00Z'));await editor.locator('[data-refresh]').click();await editor.getByText(/17 residentes cadastrados/).waitFor();assert.equal(await editor.locator('[data-month]').getAttribute('max'),'2026-11');
  await page.clock.setFixedTime(new Date('2026-11-18T20:00:00Z'));
  // Celular e conteúdo de nomes são renderizados como texto.
  app.residentes.R2.id1.name='<img src=x onerror="window.injected=true">';
  await editor.locator('[data-refresh]').click();await editor.getByText(/17 residentes cadastrados/).waitFor();await open('2026-10');assert.equal(await editor.locator('img').count(),0);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  fs.mkdirSync(path.join(root,'../../tmp/admin-attendance'),{recursive:true});await page.screenshot({path:path.join(root,'../../tmp/admin-attendance/mobile.png'),fullPage:true});
  // Encerrar a sessão durante uma consulta descarta a resposta e os nomes.
  delayRead=true;await editor.locator('[data-refresh]').click();await page.waitForFunction(()=>true);while(!late)await new Promise(r=>setTimeout(r,10));
  await page.evaluate(()=>signOutSupervision());releaseRead();await page.waitForLoadState('networkidle');
  assert.equal(await editor.locator('[data-resident] option').count(),1);assert.equal(await editor.locator('[data-controls]').isVisible(),false);
  // Rejeição de autorização não expõe a lista de residentes.
  deny=true;await editor.locator('[data-login]').click();await page.getByText('Confirmar conta de teste',{exact:true}).click();await editor.getByText(/Conta sem autorização/).waitFor();
  assert.equal(await editor.locator('[data-resident] option').count(),1);assert.equal(writes.length,4);assert.deepEqual(errors,[]);
  console.log('OK: 17 residentes sem PDF; outubro; novembro parcial; turnos; preservação; revisão e conflito; autorização; sessão; Manaus; celular.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
