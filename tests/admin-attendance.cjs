// DOM com dados fictícios e serviço simulado. Instale jsdom para executar.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
const initial={programas:{R1:{moduloName:'Módulo original'},R2:{},R3:{}},residentes:{R1:{},R2:{},R3:{}},preceptores:'Não alterar'};
for(let i=1;i<=17;i++){const year='R'+(i%3+1);initial.residentes[year]['id'+i]={id:'id'+i,name:'Residente '+String(i).padStart(2,'0'),email:'r'+i+'@example.test',attendance:{'2026-09-10':{morning:'P',afternoon:'T'}}};}
initial.residentes.R2.id1.attendance['2026-10-01']={morning:'P',afternoon:'T'};
let app=clone(initial),revision='r1',deny=false,conflict=false,failWrite=false,logoFails=false,delayRead=false,releaseRead,fixed='2026-11-18T20:00:00Z';
const calls=[],writes=[],errors=[],downloads=[],blobs=[];
const authToken='header.'+Buffer.from(JSON.stringify({name:'Supervisor de teste',email:'supervisor@example.test',email_verified:true})).toString('base64url')+'.signature';
const resource=bytes=>{const promise=Promise.resolve(Buffer.from(bytes));promise.abort=()=>{};return promise;};
class Loader extends ResourceLoader{
 fetch(url){
  if(url.startsWith('https://accounts.google.com'))return resource('window.google={accounts:{id:{disableAutoSelect(){}}}}');
  if(!url.startsWith('https://residped.test/'))return null;
  const name=new URL(url).pathname.slice(1),file=path.join(root,name);
  return fs.existsSync(file)?resource(fs.readFileSync(file)):null;
 }
}
const consoleForTests=new VirtualConsole();consoleForTests.on('jsdomError',e=>{if(e.type==='unhandled-exception')errors.push(e.message);});
const dom=new JSDOM(fs.readFileSync(path.join(root,'residentes/index.html'),'utf8'),{
 url:'https://residped.test/residentes/',runScripts:'dangerously',resources:new Loader(),virtualConsole:consoleForTests,
 beforeParse(w){
  w.TextDecoder=TextDecoder;w.Blob=Blob;w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:teste-'+blobs.length;};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,url:this.href});};
  const RealDate=w.Date;w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return new RealDate(fixed).getTime();}};
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async(url,options)=>{
   if(String(url).includes('uea-logo-verde.pdf')){const data=fs.readFileSync(path.join(root,'portal-preceptor/assets/uea-logo-verde.pdf'));return{ok:!logoFails,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}
   const body=JSON.parse(options.body);calls.push(clone(body));let result={ok:true,avaliacoes:[{id:'eval1',residenteId:'id1',residente:'Residente 01',ano:'R2',preceptor:'Preceptor de teste',data:'2026-09-30'}],autoavaliacoes:[],fichas:[]};
   if(body.tipo==='cadastros_admin'){
    assert.equal(body.token,authToken);
    if(delayRead){delayRead=false;await new Promise(resolve=>releaseRead=resolve);}
    if(deny)result={ok:false,codigo:'ACESSO_NEGADO',erro:'Conta sem autorização'};
    else if(body.dados.acao==='salvar'){
     writes.push(clone(body));
     if(failWrite)result={ok:false,erro:'Falha ao salvar'};
     else if(conflict||body.dados.revisao!==revision)result={ok:false,codigo:'CONFLITO_REVISAO',erro:'Revisão em conflito'};
     else{app=clone(body.dados.app);revision+='x';result={ok:true,revisao:revision};}
    }else result={ok:true,app:clone(app),revisao:revision};
   }
   return{ok:true,json:async()=>clone(result)};
  };
 }
});
const w=dom.window,doc=w.document;
const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw new Error('Tempo esgotado: '+predicate);};
const e=name=>doc.querySelector('#adminAttendanceEditor [data-'+name+']');
const click=name=>{assert.equal(e(name).disabled,false,'Controle habilitado: '+name);e(name).click();};
const change=(name,value)=>{const el=e(name);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
const open=month=>{change('resident',JSON.stringify(['R2','id1']));change('month',month);};
const prepare=()=>{change('days','all');click('select');change('value','A');click('apply');click('review');};
const save=async()=>{e('confirm').checked=true;e('confirm').dispatchEvent(new w.Event('change'));click('save');await wait(()=>!e('refresh').disabled);};
const refresh=async()=>{click('refresh');await wait(()=>!e('refresh').disabled);};
const edit=(day,shift,value)=>{const el=doc.querySelector('#adminAttendanceEditor [data-date="'+day+'"][data-shift="'+shift+'"]');el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
(async()=>{try{
 await wait(()=>typeof w.supervisionAttendanceEditor?.load==='function');assert.equal(calls.filter(x=>x.tipo==='cadastros_admin').length,0);
 await w.supervisionAttendanceEditor.load();assert.equal(e('controls').hidden,true);
 const panel=doc.getElementById('supervisionDashboardPanel');
 await w.selectSupervisionDocument('painel');
 assert.equal(panel.querySelectorAll('article').length,0);
 w.eval("AUTOAVAL_ADMIN_TOKEN="+JSON.stringify(authToken));
 await w.loadSupervision();
 assert.equal(panel.querySelectorAll('article').length,17);
 const filter=(id,value,event='change')=>{
  const field=doc.getElementById(id);field.value=value;field.dispatchEvent(new w.Event(event));
 };
 filter('residencyWeek','2026-10-01');filter('residencyYear','R2');
 filter('residencySearch','Residente 01','input');
 assert.equal(panel.querySelectorAll('article').length,1);
 assert.match(panel.querySelector('article').textContent,/1 presença\(s\) · 0 falta\(s\) · 1 atraso\(s\)/);
 assert.match(panel.querySelector('article').textContent,/30\/09\/2026 · Preceptor de teste/);
 filter('residencyAttendance','absent');assert.equal(panel.querySelectorAll('article').length,0);
 filter('residencyAttendance','');
 panel.querySelector('[data-evaluations]').click();
 await wait(()=>doc.getElementById('supervisionResident').value==='id1');
 assert.equal(doc.querySelectorAll('#supervisionList article').length,1);
 await w.selectSupervisionDocument('painel');
 panel.querySelector('[data-frequency]').click();
 await wait(()=>e('resident').value===JSON.stringify(['R2','id1']));
 assert.equal(e('month').value,'2026-10');
 assert.equal(panel.querySelectorAll('article').length,0);
 assert.equal(writes.length,0);
 assert.equal(e('resident').options.length,18);assert.equal(doc.querySelector('#adminAttendanceRecords [data-resident]').options.length,18);assert.equal(writes.length,0);
 open('2026-10');prepare();assert.match(e('summary').textContent,/31 dia\(s\), 62 turno\(s\)/);assert.match(e('summary').textContent,/2 registro\(s\) anterior/);assert.equal(e('save').disabled,true);
 const localBefore=w.localStorage.getItem('residped_v3');await save();assert.match(e('status').textContent,/Frequência salva e conferida/);assert.equal(writes.length,1);
 for(let day=1;day<=31;day++)assert.deepEqual(app.residentes.R2.id1.attendance['2026-10-'+String(day).padStart(2,'0')],{morning:'A',afternoon:'A'});
 const beforeExport=JSON.stringify(app),beforeWrites=writes.length;click('pdf');await wait(()=>!e('refresh').disabled);assert.match(e('status').textContent,/PDF gerado com a frequência salva/);assert.equal(downloads.length,1);assert.match(downloads[0].name,/2026-10\.pdf$/);assert.equal(blobs[0].type,'application/pdf');assert.equal(JSON.stringify(app),beforeExport);assert.equal(writes.length,beforeWrites);
 const expected=clone(initial);expected.residentes.R2.id1.attendance=clone(app.residentes.R2.id1.attendance);assert.deepEqual(app,expected);assert.equal(w.localStorage.getItem('residped_v3'),localBefore);
 open('2026-11');assert.equal(e('end').value,'2026-11-18');prepare();assert.match(e('summary').textContent,/18 dia\(s\), 36 turno\(s\)/);await save();assert.match(e('status').textContent,/Frequência salva e conferida/);assert.equal(writes.length,2);assert.equal(app.residentes.R2.id1.attendance['2026-11-19'],undefined);assert.equal(doc.querySelector('[data-day="2026-11-19"]').disabled,true);
 logoFails=true;click('pdf');await wait(()=>!e('refresh').disabled);assert.match(e('status').textContent,/logo da UEA/);assert.equal(downloads.length,1);logoFails=false;
 // Período inverso e futuro não produzem lançamentos.
 change('start','2026-11-18');change('end','2026-11-01');click('select');assert.match(e('status').textContent,/período válido/);
 open('2026-12');assert.equal(e('month-controls').hidden,true);
 open('2026-10');edit('2026-10-01','morning','P');click('pdf');assert.match(e('status').textContent,/Salve os lançamentos/);assert.equal(downloads.length,1);click('review');revision+='external';await save();assert.match(e('status').textContent,/O cadastro central mudou/);assert.equal(writes.length,2);
 await refresh();open('2026-10');edit('2026-10-01','morning','P');click('review');conflict=true;await save();assert.match(e('status').textContent,/Revisão em conflito/);assert.equal(app.residentes.R2.id1.attendance['2026-10-01'].morning,'A');conflict=false;
 await refresh();open('2026-10');change('days','weekdays');click('select');assert.equal(doc.querySelector('[data-day="2026-10-03"]').checked,false);
 edit('2026-10-01','morning','P');click('review');await save();assert.deepEqual(app.residentes.R2.id1.attendance['2026-10-01'],{morning:'P',afternoon:'A'});
 // Falha explícita não anuncia sucesso ou tenta reenviar automaticamente.
 await refresh();open('2026-10');edit('2026-10-02','morning','P');click('review');failWrite=true;await save();assert.match(e('status').textContent,/Falha ao salvar/);assert.equal(app.residentes.R2.id1.attendance['2026-10-02'].morning,'A');assert.equal(e('save').disabled,true);failWrite=false;
 fixed='2026-12-01T01:00:00Z';await refresh();assert.equal(e('month').max,'2026-11');fixed='2026-11-18T20:00:00Z';
 app.residentes.R2.id1.name='<img src=x onerror="window.injected=true">';await refresh();open('2026-10');assert.equal(doc.querySelectorAll('#adminAttendanceEditor img').length,0);
 // Consulta pendente descartada ao encerrar a sessão.
 delayRead=true;const loading=w.supervisionAttendanceEditor.load();await wait(()=>!!releaseRead);w.signOutSupervision();releaseRead();await loading;assert.equal(e('resident').options.length,1);assert.equal(e('controls').hidden,true);
 deny=true;w.eval("AUTOAVAL_ADMIN_TOKEN="+JSON.stringify(authToken));await w.supervisionAttendanceEditor.load();assert.equal(e('resident').options.length,1);assert.match(e('status').textContent,/Conta sem autorização/);
 assert.deepEqual(errors,[]);console.log('OK: painel semanal e atalhos; integração DOM; 17 residentes sem PDF; outubro inteiro; novembro até 18; turnos; fins de semana; outros residentes e meses preservados; revisão concorrente; falha de gravação; sessão e autorização; data de Manaus; nomes escapados.');
}finally{dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
