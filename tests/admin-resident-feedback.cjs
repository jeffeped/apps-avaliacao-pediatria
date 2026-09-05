// API simulada e dados sintéticos: nenhuma resposta é enviada ao serviço real.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../tmp/supervision-feedback');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const target=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain'});res.end(err?'Not found':data);});});
const autos=Array.from({length:23},(_,i)=>({id:'a'+i,residente:i===0?'Beta':'Alfa',ano:i===0?'R2':'R1',data:'2026-09-05',periodo:i===0?'Julho':'1ª autoavaliação · Setembro',media:2.5,reflexao:'Reflexão completa\n<img src=x onerror="window.injectionExecuted=true">',respostas:[{competencia:'Competência 1',nota:1},{competencia:'Competência 2',nota:4},{competencia:'Competência 3',nota:null}]}));
let modules=[{ano:'R1',modulo:'Pediatria',periodo:'Agosto',respostas:Array.from({length:10},(_,i)=>({criterio:'Critério '+(i+1),nota:i%5+1})),positivos:'Pontos positivos integrais',melhorias:'Melhoria\nSem cortes',dificuldades:'Dificuldade completa',sugestoes:'Sugestão completa'},{ano:'R2',modulo:'Neonatologia',periodo:'Setembro',respostas:[{criterio:'Critério 1',nota:null}],positivos:'',melhorias:'',dificuldades:'',sugestoes:''}];
let fail=false,deny=false,delayed=false,release;const errors=[],calls=[];
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:1000},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://accounts.google.com/**',r=>r.fulfill({contentType:'application/javascript',body:`window.google={accounts:{id:{initialize(o){this.options=o},renderButton(el){const b=document.createElement('button');b.textContent='Confirmar teste';b.onclick=()=>this.options.callback({credential:'admin-test'});el.appendChild(b)},disableAutoSelect(){}}}};`}));
  await page.route('https://script.google.com/**',async route=>{
   const body=route.request().postDataJSON();calls.push(body);assert.equal(body.token,'admin-test');
   if(delayed){delayed=false;await new Promise(resolve=>release=resolve);}
   const result=deny?{ok:false,codigo:'ACESSO_NEGADO',erro:'Acesso exclusivo da supervisão cadastrada.'}:fail?{ok:false,erro:'Falha simulada'}:{ok:true,autoavaliacoes:autos,avaliacoesModulos:modules,avaliacoes:[]};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/residentes/#supervisao');await page.locator('#splash').waitFor({state:'hidden'});
  const self=page.locator('#supervisionSelfPanel'),mod=page.locator('#supervisionModulesPanel');
  await page.getByRole('button',{name:'Autoavaliações',exact:true}).click();assert.equal(calls.length,0);
  const login=async()=>{await page.getByRole('button',{name:'Entrar com Google',exact:true}).click();await page.getByRole('button',{name:'Confirmar teste',exact:true}).click();};
  await login();await self.getByText('Consulta atualizada.',{exact:true}).waitFor();
  assert.equal(await self.locator('.supervision-feedback').count(),20);await self.getByRole('button',{name:'Mostrar mais respostas'}).click();assert.equal(await self.locator('.supervision-feedback').count(),23);
  await self.getByLabel('Residente',{exact:true}).selectOption('Beta');assert.equal(await self.locator('.supervision-feedback').count(),1);
  await self.getByText('Ver notas e reflexão',{exact:true}).click();assert.equal(await self.locator('tbody tr').count(),3);assert.equal(await self.locator('tbody tr').last().locator('td').last().innerText(),'—');
  assert.ok((await self.innerText()).includes('05/09/2026'));assert.ok((await self.innerText()).includes('<img src=x'));assert.equal(await page.evaluate(()=>window.injectionExecuted),undefined);
  await self.getByLabel('Ano da residência',{exact:true}).selectOption('R1');await self.getByText('Nenhuma resposta corresponde aos filtros.',{exact:true}).waitFor();
  await self.getByRole('button',{name:'Limpar filtros'}).click();assert.equal(await self.locator('.supervision-feedback').count(),20);
  await page.getByRole('button',{name:'Avaliação dos módulos',exact:true}).click();await mod.getByText('Consulta atualizada.',{exact:true}).waitFor();assert.equal(await self.locator('.supervision-feedback').count(),0);
  await mod.getByLabel('Módulo',{exact:true}).selectOption('Pediatria');assert.equal(await mod.locator('.supervision-feedback').count(),1);
  await mod.getByText('Ver notas e comentários',{exact:true}).click();assert.equal(await mod.locator('tbody tr').count(),10);
  for(const value of ['Pontos positivos integrais','Melhoria\nSem cortes','Dificuldade completa','Sugestão completa'])assert.ok((await mod.innerText()).includes(value));
  assert.equal(await mod.getByLabel('Residente',{exact:true}).count(),0);assert.equal(await mod.getByText('Resposta anônima',{exact:true}).count(),1);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'modulos-celular.png'),fullPage:true});
  fail=true;await mod.getByRole('button',{name:'Atualizar',exact:true}).click();await mod.getByText('Não foi possível carregar as respostas.',{exact:false}).waitFor();assert.equal(await mod.locator('.supervision-feedback').count(),0);fail=false;
  modules=[];await mod.getByRole('button',{name:'Atualizar',exact:true}).click();await mod.getByText('Nenhuma resposta recebida ainda.',{exact:true}).waitFor();
  deny=true;await mod.getByRole('button',{name:'Atualizar',exact:true}).click();await mod.getByText('Acesso exclusivo da supervisão cadastrada.',{exact:true}).waitFor();assert.equal(await mod.locator('[data-access]').isVisible(),true);deny=false;
  await page.getByRole('button',{name:'Autoavaliações',exact:true}).click();await login();await self.getByText('Consulta atualizada.',{exact:true}).waitFor();
  delayed=true;await self.getByRole('button',{name:'Atualizar',exact:true}).click();await self.getByText('Carregando respostas…',{exact:true}).waitFor();
  await self.getByRole('button',{name:'Sair da supervisão',exact:true}).click();assert.equal(typeof release,'function');
  const response=page.waitForResponse(r=>r.url().includes('script.google.com'));release();await response;await page.waitForTimeout(100);
  assert.equal(await self.locator('.supervision-feedback').count(),0);assert.equal(await self.locator('[data-access]').isVisible(),true);
  assert.equal(await page.evaluate(()=>AUTOAVAL_ADMIN_TOKEN),'');assert.equal(await page.evaluate(()=>Object.values(localStorage).some(value=>value.includes('Reflexão completa'))),false);
  assert.ok(calls.some(c=>c.tipo==='avaliacoes_modulos_admin'));assert.ok(calls.some(c=>c.tipo==='autoavaliacoes_admin'));assert.deepEqual(errors,[]);
  console.log('OK: duas áreas, login compartilhado, filtros, histórico paginado, notas e comentários completos, anonimato, celular, falha/expiração e resposta atrasada após sair.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
