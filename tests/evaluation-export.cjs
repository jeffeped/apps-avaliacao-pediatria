// Executar com Node e Playwright disponíveis. Usa somente dados fictícios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');
const { PDFDocument, PDFName, PDFDict, PDFSignature } = require('../portal-preceptor/vendor/pdf-lib.min.js');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.EVALUATION_TEST_OUTPUT || path.join(root, '../../tmp/pdfs/export-tests'));
fs.mkdirSync(out, {recursive:true});
const html = fs.readFileSync(path.join(root, 'portal-preceptor/index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n');
new vm.Script(inline);
const criteria = Function('return '+html.match(/const EVALUATION_ITEMS=(\[.*\]);/)[1])();
const fixture = (name, year, date, obs='') => ({
  id:name+'-'+date,residenteId:'r-'+name,
  residente:name,ano:year,data:date,modulo:'Enfermaria de Pediatria',periodo:'Agosto de 2026',
  conhecimentos:0,habilidades:9,atitudes:8,media:'5.7',conceito:'Regular',observacoes:obs,
  itens:criteria.map((item,i)=>({codigo:'I'+String(i+1).padStart(2,'0'),texto:item[1],escore:i?8:0})).reverse()
});
let evaluations = [fixture('Ana de Souza','R1','2026-09-04','Observação com acentuação: ação, prevenção, família.'),
  fixture('Ana de Souza','R1','2026-08-04'),fixture('Bruno Lima','R2','2026-09-03')];
let apiFails=false, logoFails=false, apiCalls=0,publishFails=false;
const publications=[];
const server = http.createServer((req,res)=>{
  const requested = path.resolve(root, '.'+decodeURIComponent(req.url.split('?')[0]));
  if (!requested.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  const target = fs.existsSync(requested) && fs.statSync(requested).isDirectory() ? path.join(requested,'index.html') : requested;
  const contentType = {'.html':'text/html','.js':'application/javascript','.pdf':'application/pdf','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(target)] || 'text/plain';
  fs.readFile(target,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':contentType});res.end(error?'Not found':data);});
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const launch = {headless:true};
  if (process.env.BROWSER_EXECUTABLE) launch.executablePath=process.env.BROWSER_EXECUTABLE;
  const browser=await chromium.launch(launch);
  try {
    const context=await browser.newContext({viewport:{width:1200,height:900},serviceWorkers:'block'});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://accounts.google.com/**',route=>route.fulfill({contentType:'application/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}}}}'}));
    await page.route('https://script.google.com/**',async route=>{
      apiCalls++;
      const body=route.request().postDataJSON();
      let payload={ok:true};
      if (body.tipo==='exportacoes_preceptor') payload=apiFails?{ok:false,erro:'Falha simulada'}:{ok:true,avaliacoes:evaluations};
      if (body.tipo==='residentes_preceptor') payload={ok:true,residentes:[{id:'TESTE',nome:'Ana de Souza',ano:'R1',modulo:'Enfermaria'}]};
      if (body.tipo==='publicar_ficha_preceptor') {
        if(publishFails)payload={ok:false,erro:'Falha simulada ao disponibilizar'};
        else {publications.push(body.dados);payload={ok:true,disponivel:true};}
      }
      await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
    });
    await page.route('**/assets/uea-logo-verde.pdf',route=>logoFails?route.fulfill({status:503,body:'Falha simulada'}):route.continue());
    await page.goto('http://127.0.0.1:'+server.address().port+'/portal-preceptor/');
    await page.evaluate(()=>{
      document.getElementById('login').classList.add('hide');
      document.getElementById('app').classList.remove('hide');
      document.getElementById('name').textContent='Preceptor de demonstração';
      profile={papel:'preceptor',nome:'Preceptor de teste',email:'preceptor@example.test'};
      showView('avaliacao');
    });
    await page.getByText('3 avaliações selecionadas.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>EvaluationPDF.placeDate('2026-09-04')),'Manaus, 04 de setembro de 2026');
    assert.equal(await page.evaluate(()=>EvaluationPDF.placeDate('2026-08-04')),'Manaus, 04 de agosto de 2026');
    assert.equal(await page.evaluate(()=>EvaluationPDF.placeDate('')),'Manaus, ____ de __________________ de ______');
    await page.locator('#exportEvalResident').selectOption({label:'Ana de Souza · R1'});
    await page.getByText('2 avaliações selecionadas.',{exact:false}).waitFor();
    await page.locator('#exportEvaluation').selectOption('0');
    await page.getByText('1 avaliação selecionada.',{exact:false}).waitFor();

    const downloadPdf=page.waitForEvent('download');
    await page.locator('#exportEvaluationsPdf').click();
    const pdf=await downloadPdf;
    assert.match(pdf.suggestedFilename(),/^ficha-avaliacao-ana-de-souza-\d{4}-\d{2}-\d{2}\.pdf$/);
    await pdf.saveAs(path.join(out,'selected.pdf'));
    assert.equal(publications.length,1);
    assert.equal(Buffer.compare(Buffer.from(publications[0].pdfBase64,'base64'),fs.readFileSync(path.join(out,'selected.pdf'))),0,'O residente deve receber a mesma cópia do PDF individual');
    const downloadCsv=page.waitForEvent('download');
    await page.locator('#exportEvaluationsCsv').click();
    const csv=await downloadCsv;
    await csv.saveAs(path.join(out,'selected.csv'));
    const csvBytes=fs.readFileSync(path.join(out,'selected.csv'));
    assert.equal(csvBytes.subarray(0,3).toString('hex'),'efbbbf');
    const csvText=csvBytes.toString('utf8');
    assert.equal(csvText.split('\r\n').length,2);
    assert(csvText.includes('"0"')); assert(csvText.includes('Observação com acentuação'));
    assert(!csvText.includes('Bruno'));
    assert.equal(await page.evaluate(()=>csvCell('=SUM(A1:A2)')), '"\'=SUM(A1:A2)"');

    await page.locator('#exportEvalResident').selectOption('');
    const downloadAll=page.waitForEvent('download');
    await page.locator('#exportEvaluationsPdf').click();
    await (await downloadAll).saveAs(path.join(out,'all.pdf'));
    assert.equal(publications.length,4);
    for(const publication of publications.slice(1)) {
      const individual=await PDFDocument.load(Buffer.from(publication.pdfBase64,'base64'));
      assert.equal(individual.getPageCount(),1,'O residente nunca deve receber as fichas do lote inteiro');
    }
    publishFails=true;
    const downloadPending=page.waitForEvent('download');
    await page.locator('#exportEvaluationsPdf').click();
    await (await downloadPending).saveAs(path.join(out,'pending-copy.pdf'));
    await page.getByText('Não foi possível disponibilizar 3 ficha(s)',{exact:false}).waitFor();
    publishFails=false;

    logoFails=true;
    await page.locator('#exportEvaluationsPdf').click();
    await page.getByText('Não foi possível gerar o PDF.',{exact:false}).waitFor();
    assert.equal(await page.locator('#exportEvaluationsPdf').isEnabled(),true);
    logoFails=false;

    apiFails=true;
    await page.locator('#refreshEvaluationExports').click();
    await page.getByText('Não foi possível carregar as avaliações.',{exact:false}).waitFor();
    assert.equal(await page.locator('#exportEvaluationsPdf').isDisabled(),true);
    assert.equal(await page.locator('#exportEvaluationsCsv').isDisabled(),true);
    apiFails=false; evaluations=[];
    await page.locator('#refreshEvaluationExports').click();
    await page.getByText('Você ainda não tem avaliações salvas para exportar.').waitFor();
    assert.equal(await page.locator('#exportEvaluationsPdf').isDisabled(),true);

    evaluations=[fixture('Residente de teste','R3','2026-09-01','W'.repeat(301))];
    await page.locator('#refreshEvaluationExports').click();
    await page.getByText('1 avaliação selecionada.',{exact:false}).waitFor();
    await page.locator('#exportEvaluationsPdf').click();
    await page.getByText('ultrapassa 300 caracteres.',{exact:false}).waitFor();
    const legacyCsv=page.waitForEvent('download');
    await page.locator('#exportEvaluationsCsv').click();
    await (await legacyCsv).saveAs(path.join(out,'legacy-comments.csv'));
    assert(fs.readFileSync(path.join(out,'legacy-comments.csv'),'utf8').includes('W'.repeat(301)));

    evaluations[0].observacoes='W'.repeat(300);
    await page.locator('#refreshEvaluationExports').click();
    await page.getByText('1 avaliação selecionada.',{exact:false}).waitFor();
    const downloadBrief=page.waitForEvent('download');
    await page.locator('#exportEvaluationsPdf').click();
    await (await downloadBrief).saveAs(path.join(out,'brief-comment.pdf'));
    evaluations[0].itens=[]; evaluations[0].observacoes='';
    await page.locator('#refreshEvaluationExports').click();
    await page.getByText('1 avaliação selecionada.',{exact:false}).waitFor();
    const downloadMissing=page.waitForEvent('download');
    await page.locator('#exportEvaluationsPdf').click();
    await (await downloadMissing).saveAs(path.join(out,'missing-scores.pdf'));

    // O campo precisa existir como assinatura vazia no formulário e na página.
    for (const [file,count] of [['selected.pdf',1],['all.pdf',3],['brief-comment.pdf',1],['missing-scores.pdf',1]]) {
      const pdfDoc = await PDFDocument.load(fs.readFileSync(path.join(out,file)));
      assert.equal(pdfDoc.getPageCount(),count,'Cada ficha deve ocupar uma única página A4');
      const fields = pdfDoc.getForm().getFields();
      assert.equal(fields.length,count);
      fields.forEach((field,index) => {
        assert(field instanceof PDFSignature);
        assert.equal(field.getName(),'assinatura_preceptor_'+(index+1));
        assert.equal(field.acroField.dict.get(PDFName.of('V')),undefined,'Não deve haver assinatura aplicada');
        const pages = pdfDoc.getPages().filter(p=>p.node.Annots()?.asArray().some(ref=>ref.toString()===field.ref.toString()));
        assert.equal(pages.length,1);
        assert.equal(field.acroField.dict.get(PDFName.of('P')).toString(),pages[0].ref.toString());
        assert.equal(pages[0].ref.toString(),pdfDoc.getPages()[index].ref.toString());
        assert(field.acroField.dict.lookup(PDFName.of('AP'),PDFDict).get(PDFName.of('N')));
      });
    }

    assert.equal(await page.locator('#evalObs').getAttribute('maxlength'),'300');
    const beforeInvalid=apiCalls;
    await page.evaluate(()=>document.getElementById('evalObs').value='W'.repeat(301));
    await page.locator('#saveEvaluation').click();
    await page.getByText('Use um comentário breve, com até 300 caracteres.').waitFor();
    assert.equal(apiCalls,beforeInvalid);
    await page.locator('#evalObs').fill('Comentário breve.');
    const before=apiCalls;
    await page.locator('#evalResident').selectOption('TESTE');
    await page.locator('#evalPeriod').fill('Setembro de 2026');
    await page.locator('#saveEvaluation').click();
    await page.waitForFunction(()=>document.getElementById('evalPeriod').value==='');
    await page.waitForFunction(()=>!document.getElementById('refreshEvaluationExports').disabled);
    assert.equal(apiCalls-before,2,'Salvar deve atualizar as avaliações exportáveis');

    await page.setViewportSize({width:390,height:844});
    await page.locator('#exportEvaluationsPdf').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'O portal deve caber na tela do celular');
    await page.screenshot({path:path.join(out,'mobile-export.png')});
    const residentPage=await context.newPage();
    await residentPage.route('https://accounts.google.com/**',route=>route.fulfill({contentType:'application/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}}}}'}));
    await residentPage.route('https://script.google.com/**',async route=>{
      const body=route.request().postDataJSON();
      const payload=body.dados.acao==='baixar'?{ok:true,id:publications[0].avaliacaoId,nome:'ficha.pdf',pdfBase64:publications[0].pdfBase64}:{ok:true,fichas:[{id:publications[0].avaliacaoId,data:'2026-09-04',modulo:'Pediatria',periodo:'Agosto',preceptor:'Preceptor de teste',media:8,conceito:'Bom'}]};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
    });
    await residentPage.goto('http://127.0.0.1:'+server.address().port+'/portal-residente/');
    await residentPage.evaluate(()=>{document.getElementById('login').classList.add('hidden');document.getElementById('app').classList.remove('hidden');showPage('avaliacoes',document.querySelector('[data-page="avaliacoes"]'));});
    await residentPage.getByRole('button',{name:'Visualizar ficha',exact:true}).click();
    await residentPage.waitForFunction(()=>document.getElementById('residentPdfFrame').src.startsWith('blob:'));
    const residentDownload=residentPage.waitForEvent('download');
    await residentPage.getByRole('link',{name:'Baixar PDF',exact:true}).click();
    await (await residentDownload).saveAs(path.join(out,'resident-copy.pdf'));
    assert.equal(Buffer.compare(fs.readFileSync(path.join(out,'resident-copy.pdf')),fs.readFileSync(path.join(out,'selected.pdf'))),0);
    await residentPage.getByRole('button',{name:'Fechar',exact:true}).click();
    assert.equal(await residentPage.locator('#residentPdfPreview').isVisible(),false);
    await residentPage.setViewportSize({width:390,height:844});
    assert.equal(await residentPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await residentPage.screenshot({path:path.join(out,'resident-evaluations-mobile.png')});
    assert.deepEqual(errors,[]);
    console.log('OK: uma página A4 por ficha, comentários até 300 caracteres, data e local, assinatura digital vazia, CSV completo, filtros, erros recuperáveis, atualização após salvar e celular.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
