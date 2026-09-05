// Verifica somente dados sintéticos em memória e uma API simulada.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const {chromium}=require('playwright'),{PDFDocument,PDFName,PDFSignature}=require('../portal-preceptor/vendor/pdf-lib.min.js');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../tmp/pdfs/attendance-tests');fs.mkdirSync(out,{recursive:true});
globalThis.PDFLib=require('../portal-preceptor/vendor/pdf-lib.min.js');require('../portal-preceptor/evaluation-pdf.js');require('../portal-preceptor/attendance-pdf.js');
const logo=fs.readFileSync(path.join(root,'portal-preceptor/assets/uea-logo-verde.pdf'));
const resident={id:'r1',nome:'Residente de teste',ano:'R1',modulo:'Enfermaria de Pediatria'};
const fixture=mes=>({mes,emitidoEm:'2026-09-05',preceptor:{nome:'Preceptor de teste',email:'preceptor@example.test'},residentes:[resident,{id:'r2',nome:'Outro residente de teste',ano:'R1',modulo:resident.modulo}],registros:[{residenteId:'r1',data:mes+'-01',modulo:resident.modulo,periodo:'Dia completo',status:'P'},{residenteId:'r1',data:mes+'-02',modulo:resident.modulo,periodo:'Manhã',status:'A'},{residenteId:'r1',data:mes+'-03',modulo:resident.modulo,periodo:'Tarde',status:'T'},{residenteId:'r2',data:mes+'-01',modulo:resident.modulo,periodo:'Dia completo',status:'A'}]});
let current=fixture('2026-09'),fail=false,logoFail=false;const calls=[],errors=[];
const server=http.createServer((req,res)=>{
  const target=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.pdf':'application/pdf','.svg':'image/svg+xml'}[path.extname(file)]||'text/plain'});res.end(e?'Not found':b);});
});
(async()=>{
  for(const [mes,days] of [['2026-02',28],['2028-02',29],['2026-09',30],['2026-08',31]]){
    const data=fixture(mes),prepared=AttendancePDF.prepare(data,'r1');assert.equal(prepared.rows.length,days);assert.deepEqual(prepared.totals,{P:2,A:1,T:1,dias:3});
    assert.equal(prepared.rows[1].tarde,'-');assert.equal(prepared.rows[3].manha,'-');
    data.registros.push({...data.registros[0]});assert.deepEqual(AttendancePDF.prepare(data,'r1').totals,prepared.totals);
    const bytes=await AttendancePDF.create(data,'r1',logo),pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);
    assert.equal(pdf.getForm().getFields().length,1);const signature=pdf.getForm().getFields()[0];assert.ok(signature instanceof PDFSignature);assert.equal(signature.acroField.dict.has(PDFName.of('V')),false);
    const refs=pdf.getPages()[0].node.Annots();assert.equal(refs.size(),1);assert.equal(refs.get(0).toString(),signature.ref.toString());
    fs.writeFileSync(path.join(out,'mensal-'+days+'-dias.pdf'),bytes);
  }
  const invalid=fixture('2026-09');invalid.registros.push({...invalid.registros[0],status:'A'});assert.throws(()=>AttendancePDF.prepare(invalid,'r1'),/divergentes/);
  for(const changes of [{data:'2026-09-31'},{data:'2026-10-01'},{status:'Desconhecido'},{periodo:''},{modulo:'Outro módulo'}]){const data=fixture('2026-09');Object.assign(data.registros[0],changes);assert.throws(()=>AttendancePDF.prepare(data,'r1'));}
  await assert.rejects(AttendancePDF.create({...fixture('2026-09'),registros:[]},'r1',logo),/Não há frequência/);
  await assert.rejects(AttendancePDF.create({...fixture('2026-09'),preceptor:{}},'r1',logo),/identificar o preceptor/);
  await assert.rejects(AttendancePDF.create({...fixture('2026-08'),residentes:[{...resident,nome:'Nome extenso '.repeat(30)}]},'r1',logo),/extensa/);
  new vm.Script([...fs.readFileSync(path.join(root,'portal-preceptor/index.html'),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try{
    const context=await browser.newContext({viewport:{width:1100,height:950},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://accounts.google.com/**',r=>r.fulfill({contentType:'application/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}}}};'}));
    await page.route('https://script.google.com/**',async route=>{
      const body=route.request().postDataJSON();calls.push(body);let result={ok:true,residentes:[],registros:[]};
      if(body.tipo==='frequencia_mensal_preceptor')result=fail?{ok:false,erro:'Falha simulada'}:{ok:true,...current};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    });
    await page.route('**/assets/uea-logo-verde.pdf',r=>logoFail?r.fulfill({status:503,body:'Falha'}):r.continue());
    await page.goto('http://127.0.0.1:'+server.address().port+'/portal-preceptor/');
    await page.evaluate(()=>{profile={papel:'preceptor',nome:'Nome antigo no navegador',email:'preceptor@example.test'};document.getElementById('login').classList.add('hide');document.getElementById('app').classList.remove('hide');document.getElementById('attendancePdfMonth').value='2026-09';showView('frequencia');});
    await page.getByText('Selecione o residente para emitir a ficha mensal.',{exact:true}).waitFor();
    await page.getByLabel('Residente da ficha mensal',{exact:true}).selectOption('r1');await page.getByText('3 dia(s) com frequência salva no mês.',{exact:false}).waitFor();
    const before=calls.filter(c=>c.tipo==='frequencia_mensal_preceptor').length;
    // A ficha deve reconsultar o servidor e incluir a alteração salva após a listagem.
    current.registros.push({residenteId:'r1',data:'2026-09-04',modulo:resident.modulo,periodo:'Manhã',status:'P'});
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'↓ Baixar frequência mensal em PDF',exact:true}).click();await(await download).saveAs(path.join(out,'emitida-pelo-portal.pdf'));
    await page.getByText('Ficha mensal emitida com o nome e e-mail de Preceptor de teste.',{exact:true}).waitFor();assert.equal(calls.filter(c=>c.tipo==='frequencia_mensal_preceptor').length,before+1);assert.equal(calls.at(-1).dados.residenteId,'r1');
    assert.equal((await PDFDocument.load(fs.readFileSync(path.join(out,'emitida-pelo-portal.pdf')))).getPageCount(),1);
    assert.equal(calls.some(c=>c.tipo==='publicar_ficha_preceptor'||c.tipo==='frequencia_preceptor'&&c.dados.acao==='salvar'),false);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'frequencia-celular.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    logoFail=true;await page.getByRole('button',{name:'↓ Baixar frequência mensal em PDF',exact:true}).click();await page.getByText('Não foi possível emitir a ficha. Não foi possível carregar a logo da UEA.',{exact:true}).waitFor();logoFail=false;
    current.preceptor.email='outro@example.test';await page.getByRole('button',{name:'↓ Baixar frequência mensal em PDF',exact:true}).click();await page.locator('#attendancePdfStatus').filter({hasText:'A identificação da emissão mudou.'}).waitFor();current.preceptor.email='preceptor@example.test';
    fail=true;await page.getByRole('button',{name:'Atualizar mês',exact:true}).click();await page.getByText('Não foi possível carregar a frequência.',{exact:false}).waitFor();assert.equal(await page.locator('#exportAttendancePdf').isDisabled(),true);fail=false;
    current={...fixture('2026-09'),registros:[]};await page.getByRole('button',{name:'Atualizar mês',exact:true}).click();await page.locator('#attendancePdfResident').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('attendancePdfResident').disabled);await page.getByLabel('Residente da ficha mensal',{exact:true}).selectOption('r1');await page.getByText('Não há frequência salva para este residente no mês selecionado.',{exact:true}).waitFor();assert.equal(await page.locator('#exportAttendancePdf').isDisabled(),true);
    current=fixture('2026-08');await page.getByLabel('Mês de referência',{exact:true}).fill('2026-08');await page.getByText('3 dia(s) com frequência salva no mês.',{exact:false}).waitFor();assert.equal(calls.at(-1).dados.mes,'2026-08');
    assert.deepEqual(errors,[]);console.log('OK: meses de 28/29/30/31 dias em uma página, turnos e totais, duplicatas, conflitos, autenticação da emissão, reconsulta de dados salvos, assinatura vazia, celular e falhas recuperáveis.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
