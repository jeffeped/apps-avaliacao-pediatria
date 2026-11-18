// Exportação com dados fictícios. Não consulta nem grava dados de residentes reais.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
globalThis.PDFLib=require('../portal-preceptor/vendor/pdf-lib.min.js');
require('../portal-preceptor/evaluation-pdf.js');require('../portal-preceptor/attendance-pdf.js');require('../residentes/admin-attendance-pdf.js');
const {PDFDocument,PDFName,PDFSignature}=PDFLib,logo=fs.readFileSync(path.resolve(__dirname,'../portal-preceptor/assets/uea-logo-verde.pdf'));
const selected={id:'r1',year:'R2',name:'Residente Fictício'},supervisor={nome:'Supervisor de Teste',email:'supervisor@example.test'};
const app={residentes:{R2:{r1:{name:selected.name,attendance:{}},r2:{name:'Outra pessoa',attendance:{'2026-10-01':{morning:'P',afternoon:'P'}}}}},programas:{R2:{moduloName:'Módulo atual não presumido no histórico'}}};
for(let i=1;i<=31;i++)app.residentes.R2.r1.attendance['2026-10-'+String(i).padStart(2,'0')]={morning:'A',afternoon:'A'};
for(let i=1;i<=18;i++)app.residentes.R2.r1.attendance['2026-11-'+String(i).padStart(2,'0')]={morning:'A',afternoon:'A'};
app.residentes.R2.r1.attendance['2026-11-02']={morning:'P',afternoon:null};
app.residentes.R2.r1.attendance['2026-11-30']={morning:'P',afternoon:'A'}; // futuro, não pode entrar no resumo
const token=claims=>'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
(async()=>{
 assert.deepEqual(AdminAttendancePDF.identity(token({...supervisor,name:supervisor.nome,email_verified:true})),supervisor);
 assert.throws(()=>AdminAttendancePDF.identity('token-invalido'),/Entre novamente/);
 assert.throws(()=>AdminAttendancePDF.identity(token({email:'x',email_verified:false})),/Entre novamente/);
 const before=JSON.stringify(app),out=fs.mkdtempSync(path.join(os.tmpdir(),'residped-pdf-'));
 for(const [month,turns] of [['2026-10',62],['2026-11',35]]){
  const data=AdminAttendancePDF.prepare(app,selected,month,'2026-11-18',supervisor);
  assert.equal(data.registros.length,turns);assert.equal(data.residentes.length,1);assert.equal(data.residentes[0].modulo,'');
  assert.equal(data.consultadoAte,month==='2026-10'?'2026-10-31':'2026-11-18');
  const sheet=AttendancePDF.prepare(data,'r1');assert.equal(sheet.totals.A,month==='2026-10'?62:34);assert.equal(sheet.totals.P,month==='2026-10'?0:1);
  if(month==='2026-11'){assert.equal(sheet.rows[1].tarde,'-');assert.equal(sheet.rows[29].manha,'-');}
  const bytes=await AttendancePDF.create(data,'r1',logo,{supervision:true}),doc=await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(),1);assert.equal(doc.getPages()[0].getSize().width,595.28);
  const fields=doc.getForm().getFields();assert.equal(fields.length,1);assert.ok(fields[0] instanceof PDFSignature);assert.equal(fields[0].getName(),'assinatura_supervisor_frequencia');assert.equal(fields[0].acroField.dict.has(PDFName.of('V')),false);
  assert.equal(doc.getAuthor(),supervisor.nome);assert.match(doc.getTitle(),/Residente Fictício/);assert.match(doc.getSubject(),/administrativa/);
  fs.writeFileSync(path.join(out,month+'.pdf'),bytes);
 }
 assert.equal(JSON.stringify(app),before);
 assert.throws(()=>AdminAttendancePDF.prepare(app,selected,'2026-12','2026-11-18',supervisor),/mês futuro/);
 assert.throws(()=>AdminAttendancePDF.prepare(app,selected,'2026-09','2026-11-18',supervisor),/Não há frequência/);
 assert.throws(()=>AdminAttendancePDF.prepare(app,{...selected,name:'Outro nome'},'2026-10','2026-11-18',supervisor),/cadastro/);
 const invalid=JSON.parse(JSON.stringify(app));invalid.residentes.R2.r1.attendance['2026-10-01'].morning='DESCONHECIDO';assert.throws(()=>AdminAttendancePDF.prepare(invalid,selected,'2026-10','2026-11-18',supervisor),/não reconhecida/);
 // O PDF do preceptor mantém o campo e a autoria originais.
 const legacy={mes:'2026-10',emitidoEm:'2026-11-18',preceptor:supervisor,residentes:[{id:'r1',nome:selected.name,ano:'R2',modulo:'Pediatria'}],registros:[{residenteId:'r1',data:'2026-10-01',modulo:'Pediatria',periodo:'Dia completo',status:'P'}]};
 const original=await PDFDocument.load(await AttendancePDF.create(legacy,'r1',logo));assert.equal(original.getForm().getFields()[0].getName(),'assinatura_preceptor_frequencia');assert.equal(original.getPageCount(),1);
 await assert.rejects(AttendancePDF.create({...legacy,preceptor:{}},'r1',logo),/identificar o preceptor/);
 console.log('OK: PDFs administrativos A4; faltas e turnos; novembro parcial; sem registros; outros residentes excluídos; identidade; assinatura vazia; nenhuma mutação; PDF do preceptor preservado.');
 console.log('PDFs sintéticos para conferência: '+out);
})().catch(e=>{console.error(e);process.exitCode=1;});
