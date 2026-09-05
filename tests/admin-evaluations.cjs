// Testes locais com dados sintéticos e API simulada; nenhuma avaliação real é enviada.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {chromium}=require('playwright');
const {PDFDocument}=require('../portal-preceptor/vendor/pdf-lib.min.js');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../tmp/supervisao-tests');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(root,'residentes/index.html'),'utf8');
new vm.Script([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
const fixture=(id,residente,ano,preceptor,modulo,data,periodo,pdf)=>({id,residenteId:'r-'+residente,residente,ano,preceptorId:'p-'+preceptor,preceptor,modulo,data,periodo,fichaDisponivel:pdf,media:0,conceito:'Insatisfatório',conhecimentos:0,habilidades:8,atitudes:9,observacoes:'Observação de teste: atenção e comunicação.',itens:[{codigo:'I01',texto:'Critério de teste',escore:0},{codigo:'I02',escore:8}]});
const originals=[fixture('a1','Residente Alfa','R1','Preceptor Um','Pediatria','2026-09-04','Setembro',true),fixture('a2','Residente Beta','R2','Preceptor Dois','Neonatologia','2026-08-04','Agosto',false),fixture('a3','Residente Alfa','R1','Preceptor Dois','Pediatria','2026-07-04','Julho',true)];
originals[2].media=null;originals[2].observacoes='<img src=x onerror="window.injectionExecuted=true">';
let evaluations=originals,deny=false,fail=false,delayNextList=false,releaseList;
const calls=[],errors=[];
const server=http.createServer((req,res)=>{
  const target=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;
  fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain'});res.end(error?'Not found':bytes);});
});
(async()=>{
  const pdf=await PDFDocument.create();pdf.addPage([595,842]);const bytes=Buffer.from(await pdf.save()),base64=bytes.toString('base64');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try{
    const context=await browser.newContext({viewport:{width:1200,height:1000},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
    await page.route('https://accounts.google.com/**',route=>route.fulfill({contentType:'application/javascript',body:`window.google={accounts:{id:{initialize(o){this.options=o},renderButton(el){const b=document.createElement('button');b.textContent='Confirmar conta de teste';b.onclick=()=>this.options.callback({credential:'admin-test-token'});el.appendChild(b)},disableAutoSelect(){}}}};`}));
    await page.route('https://script.google.com/**',async route=>{
      const body=route.request().postDataJSON();calls.push(body);
      let result={ok:true,autoavaliacoes:[]};
      if(body.tipo==='avaliacoes_admin'){
        assert.equal(body.token,'admin-test-token');
        if(body.dados.acao==='listar'&&delayNextList){delayNextList=false;await new Promise(resolve=>releaseList=resolve);}
        result=deny?{ok:false,codigo:'ACESSO_NEGADO',erro:'Acesso exclusivo da supervisão cadastrada.'}:fail?{ok:false,erro:'Falha de conexão simulada'}:body.dados.acao==='baixar'?{ok:true,id:body.dados.id,pdfBase64:base64,nome:'ficha-teste.pdf'}:{ok:true,avaliacoes:evaluations};
      }
      await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/residentes/#supervisao');
    await page.locator('#splash').waitFor({state:'hidden'});
    assert.equal(await page.locator('#supervisionAccess').isVisible(),true);assert.equal(calls.filter(c=>c.tipo==='avaliacoes_admin').length,0);
    const login=async()=>{await page.getByRole('button',{name:'Entrar com Google',exact:true}).click();await page.getByRole('button',{name:'Confirmar conta de teste',exact:true}).click();};
    await login();await page.getByText('3 avaliação(ões) · 2 residente(s) · 2 PDF(s) disponíveis',{exact:true}).waitFor();
    assert.equal(await page.locator('.supervision-evaluation').count(),3);
    const first=page.locator('.supervision-evaluation').first();await first.locator('summary').click();
    assert.equal(await first.locator('tbody tr').count(),9);assert.equal(await first.locator('tbody tr').first().locator('td').last().innerText(),'0,0');
    assert.equal(await first.locator('tbody tr').nth(2).locator('td').last().innerText(),'—');
    assert.match(await first.locator('.supervision-score').innerText(),/0,0 \/ 10/);
    await page.locator('.supervision-evaluation').nth(2).locator('summary').click();
    assert.equal(await page.locator('.supervision-comment img').count(),0);assert.equal(await page.evaluate(()=>window.injectionExecuted),undefined);
    assert.match(await page.locator('.supervision-evaluation').nth(2).locator('.supervision-score').innerText(),/— \/ 10/);
    assert.match(await page.locator('.supervision-evaluation').nth(1).innerText(),/PDF ainda não emitido/);
    await page.getByLabel('Residente',{exact:true}).selectOption({label:'Residente Alfa · R1'});
    await page.getByLabel('Preceptor',{exact:true}).selectOption({label:'Preceptor Dois'});assert.equal(await page.locator('.supervision-evaluation').count(),1);
    assert.match(await page.locator('.supervision-evaluation').innerText(),/04\/07\/2026/);
    await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByText('Consulta atualizada.',{exact:false}).waitFor();assert.equal(await page.locator('.supervision-evaluation').count(),1);
    await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
    await page.getByLabel('Ano da residência',{exact:true}).selectOption('R2');await page.getByLabel('Módulo',{exact:true}).selectOption('Neonatologia');await page.getByLabel('Período avaliado',{exact:true}).selectOption('Agosto');assert.equal(await page.locator('.supervision-evaluation').count(),1);
    await page.getByLabel('Avaliações desde',{exact:true}).fill('2026-09-01');assert.equal(await page.locator('.supervision-evaluation').count(),0);
    await page.getByLabel('Até',{exact:true}).fill('2026-08-01');assert.match(await page.locator('#supervisionSummary').innerText(),/data inicial/);
    await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
    await first.getByRole('button',{name:'Visualizar PDF',exact:true}).click();await page.locator('#supervisionPdfPreview').waitFor({state:'visible'});
    assert.match(await page.locator('#supervisionPdfFrame').getAttribute('src'),/^blob:/);
    assert.equal(calls.filter(c=>c.dados?.acao==='baixar').at(-1).dados.id,'a1');
    const downloadPromise=page.waitForEvent('download');await page.locator('#supervisionPdfDownload').click();const download=await downloadPromise;const downloadPath=path.join(out,'ficha-recebida.pdf');await download.saveAs(downloadPath);assert.deepEqual(fs.readFileSync(downloadPath),bytes);
    await page.getByRole('button',{name:'Fechar PDF',exact:true}).click();assert.equal(await page.locator('#supervisionPdfFrame').getAttribute('src'),'about:blank');
    await page.setViewportSize({width:390,height:844});await page.locator('.tab-btn[data-screen="supervisao"]').click();await page.getByText('Consulta atualizada.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,'supervisao-celular.png'),fullPage:true});
    fail=true;await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByText('Não foi possível carregar as avaliações.',{exact:false}).waitFor();assert.equal(await page.locator('.supervision-evaluation').count(),0);fail=false;
    evaluations=[];await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByText('Nenhuma avaliação recebida ainda.',{exact:true}).waitFor();
    evaluations=Array.from({length:23},(_,i)=>({...originals[0],id:'pagination-'+i}));await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByText('23 avaliação(ões)',{exact:false}).waitFor();assert.equal(await page.locator('.supervision-evaluation').count(),20);await page.getByRole('button',{name:'Mostrar mais avaliações',exact:true}).click();assert.equal(await page.locator('.supervision-evaluation').count(),23);
    evaluations=originals;deny=true;await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByText('Acesso exclusivo da supervisão cadastrada.',{exact:true}).waitFor();assert.equal(await page.locator('#supervisionAccess').isVisible(),true);assert.equal(await page.locator('.supervision-evaluation').count(),0);deny=false;
    await login();await page.getByText('3 avaliação(ões)',{exact:false}).waitFor();
    delayNextList=true;await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByText('Carregando as avaliações dos residentes…',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Sair da supervisão',exact:true}).click();assert.equal(typeof releaseList,'function');releaseList();
    await page.waitForResponse(response=>response.url().includes('script.google.com')&&response.request().postDataJSON().dados?.acao==='listar');
    assert.equal(await page.locator('#supervisionAccess').isVisible(),true);assert.equal(await page.locator('.supervision-evaluation').count(),0);
    assert.equal(await page.evaluate(()=>AUTOAVAL_ADMIN_TOKEN),'');assert.equal(await page.evaluate(()=>supervisionState.data.length),0);
    assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('Residente Alfa'))),false);
    assert.deepEqual(errors,[]);
    console.log('OK: login compartilhado da coordenação, filtros combinados, notas zero e ausentes, detalhes seguros, PDF idêntico, celular, paginação, falhas, expiração e limpeza da sessão.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
