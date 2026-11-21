// Lançamentos administrativos usam o cadastro central e a revisão conferida no servidor.
(function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const labels={'':'Sem registro',P:'Presença',A:'Falta (ausência)',T:'Atraso'};
  const weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const validMonth=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const dates=month=>{
    if(!validMonth(month))return [];
    const [year,m]=month.split('-').map(Number);
    return Array.from({length:new Date(Date.UTC(year,m,0)).getUTCDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
  };
  const weekday=day=>new Date(day+'T12:00:00Z').getUTCDay();
  const br=day=>day.split('-').reverse().join('/');
  window.addEventListener('DOMContentLoaded',()=>{
    const root=document.getElementById('adminAttendanceEditor');if(!root)return;
    root.className='frequency-records';
    root.innerHTML=`<section class="card"><h2>Lançar frequência pela supervisão</h2>
      <p>Selecione qualquer residente do cadastro central, mesmo sem ficha emitida. Confira os dias da escala antes de registrar presenças ou faltas. Os PDFs já emitidos permanecem como foram emitidos.</p>
      <div data-access><button data-login>Entrar com Google</button></div>
      <div data-controls hidden><div class="frequency-actions"><button data-refresh>Carregar cadastro central</button></div>
      <p data-count></p><div class="frequency-filters">
        <label>Residente para lançamento<select data-resident><option value="">Selecione o residente</option></select></label>
        <label>Mês do lançamento<input data-month type="month"></label></div>
      <div data-month-controls hidden>
        <div class="frequency-actions"><button data-pdf>Baixar PDF da frequência salva</button></div>
        <p>O PDF usa os registros já salvos deste residente no mês. Alterações ainda em revisão precisam ser salvas antes do download. O campo de assinatura fica vazio para assinatura posterior.</p>
        <div class="frequency-filters"><label>De<input data-start type="date"></label><label>Até<input data-end type="date"></label>
        <label>Dias a selecionar<select data-days><option value="weekdays">Segunda a sexta</option><option value="all">Todos os dias, incluindo fins de semana</option></select></label>
        <button data-select>Selecionar período</button><button data-unselect>Desmarcar dias</button></div>
        <p>O período do mês atual termina hoje, pela data de Manaus. Sábados e domingos só entram quando selecionados. Marque ou desmarque os dias conforme a escala.</p>
        <div class="frequency-filters"><label>Situação a aplicar<select data-value><option value="">Selecione a situação</option><option value="P">Presença</option><option value="A">Falta (ausência)</option><option value="T">Atraso</option></select></label>
        <label>Turnos<select data-shifts><option value="both">Manhã e tarde</option><option value="morning">Manhã</option><option value="afternoon">Tarde</option></select></label>
        <button data-apply>Aplicar aos dias selecionados</button></div>
        <p data-selection role="status"></p><div data-calendar class="attendance-calendar"></div>
        <button data-review>Revisar lançamento</button>
        <section data-preview hidden class="attendance-review"><h3>Conferir antes de salvar</h3><p data-summary></p>
        <div data-changes></div><p>Salvar altera somente os turnos listados do residente selecionado. Os outros residentes e os outros meses são preservados.</p>
        <label><input data-confirm type="checkbox"> Conferi o residente, as datas e os turnos, inclusive a substituição de registros anteriores.</label>
        <div class="frequency-actions"><button data-save disabled>Salvar frequência no cadastro central</button></div></section>
      </div></div><p data-status role="status" aria-live="polite"></p></section>`;
    const el=name=>root.querySelector('[data-'+name+']');
    let central=null,revision='',roster=[],draft={},baseline={},selected=new Set(),pending=null,request=0,busy=false;
    const pdfUrls=new Set();
    const credential=()=>AUTOAVAL_ADMIN_TOKEN;
    const resident=()=>roster.find(r=>r.key===el('resident').value);
    const esc=value=>escapeHtml(value);
    const same=(a,b)=>(a??'')===(b??'');
    function invalidate(){pending=null;el('preview').hidden=true;el('confirm').checked=false;el('save').disabled=true;}
    function setBusy(value){busy=value;root.querySelectorAll('button,select,input').forEach(e=>e.disabled=value||!!((e.dataset.day||e.dataset.date)&&(e.dataset.day||e.dataset.date)>today()));if(!value)el('save').disabled=!pending||!el('confirm').checked;}
    function reset(){
      for(const url of pdfUrls)URL.revokeObjectURL(url);pdfUrls.clear();
      request++;central=null;revision='';roster=[];draft={};baseline={};selected.clear();invalidate();
      el('calendar').innerHTML='';el('count').textContent='';el('selection').textContent='';el('status').textContent='';
      el('resident').innerHTML='<option value="">Selecione o residente</option>';el('month-controls').hidden=true;
      el('controls').hidden=true;el('access').hidden=!!credential();
      // Uma escrita em andamento continua bloqueada até receber a resposta; não é reenviada.
      if(!busy)setBusy(false);
    }
    async function load(){
      if(busy)return;
      reset();const version=request,token=credential();if(!token)return;
      el('access').hidden=true;el('controls').hidden=false;setBusy(true);el('status').textContent='Consultando todos os residentes no cadastro central…';
      try{
        const result=await supervisionApi({acao:'consultar'},'cadastros_admin');
        if(version!==request||token!==credential())return;
        if(!result.app?.residentes||typeof result.revisao!=='string'||!result.revisao)throw new Error('O serviço não retornou um cadastro central com revisão.');
        central=clone(result.app);revision=result.revisao;
        for(const year of ['R1','R2','R3'])for(const [id,r] of Object.entries(central.residentes[year]||{})){
          if(!r||!String(r.name||'').trim())continue;
          roster.push({key:JSON.stringify([year,id]),year,id,name:r.name});
        }
        roster.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.year.localeCompare(b.year));
        el('resident').innerHTML='<option value="">Selecione o residente</option>'+roster.map(r=>'<option value="'+esc(r.key)+'">'+esc(r.name+' · '+r.year)+'</option>').join('');
        el('count').textContent=roster.length+' residentes cadastrados (R1, R2 e R3).';
        adminAttendanceRecords?.setResidents(roster.map(r=>({residenteId:r.id,residente:r.name,ano:r.year})));
        el('month').max=today().slice(0,7);if(!el('month').value)el('month').value=today().slice(0,7);
        el('status').textContent=roster.length?'Cadastro carregado. Selecione o residente e o mês.':'Nenhum residente cadastrado. Confira o cadastro central.';
      }catch(e){if(version!==request||token!==credential())return;if(e.accessDenied)signOutSupervision();el('status').textContent='Não foi possível carregar o cadastro. '+e.message;}
      finally{setBusy(false);}
    }
    function openMonth(){
      invalidate();selected.clear();draft={};baseline={};el('calendar').innerHTML='';el('month-controls').hidden=true;
      const r=resident(),month=el('month').value;if(!r||!validMonth(month)||!central)return;
      if(month>today().slice(0,7)){el('status').textContent='Selecione um mês que já começou.';return;}
      const attendance=central.residentes[r.year][r.id].attendance||{};
      for(const day of dates(month)){baseline[day]=clone(attendance[day]||{});draft[day]=clone(baseline[day]);}
      el('start').value=month+'-01';el('end').value=month===today().slice(0,7)?today():dates(month).at(-1);
      for(const field of ['start','end']){el(field).min=month+'-01';el(field).max=el('end').value;}
      el('month-controls').hidden=false;el('status').textContent='Confira o período e selecione os dias da escala.';render();
    }
    function changes(){
      return Object.keys(draft).flatMap(day=>['morning','afternoon'].filter(shift=>!same(draft[day][shift],baseline[day][shift])).map(shift=>({day,shift,before:baseline[day][shift]??'',after:draft[day][shift]??''})));
    }
    function render(){
      el('calendar').innerHTML='<table><caption>Frequência de '+esc(resident()?.name||'')+' · '+esc(el('month').value)+'</caption><thead><tr><th>Dia</th><th>Manhã</th><th>Tarde</th></tr></thead><tbody>'+Object.keys(draft).map(day=>{
        const future=day>today();
        return '<tr><td><label><input type="checkbox" data-day="'+day+'" '+(selected.has(day)?'checked ':'')+(future?'disabled':'')+'> '+br(day)+' · '+weekdays[weekday(day)]+'</label></td>'+['morning','afternoon'].map(shift=>'<td><select aria-label="'+(shift==='morning'?'Manhã':'Tarde')+' '+br(day)+'" data-date="'+day+'" data-shift="'+shift+'" '+(future?'disabled':'')+'>'+Object.entries(labels).map(([value,label])=>'<option value="'+value+'" '+(same(draft[day][shift],value)?'selected':'')+'>'+label+'</option>').join('')+'</select></td>').join('')+'</tr>';
      }).join('')+'</tbody></table>';
      el('selection').textContent=selected.size+' dia(s) selecionado(s). '+changes().length+' turno(s) alterado(s) para revisão.';
    }
    function selectPeriod(){
      invalidate();const start=el('start').value,end=el('end').value,month=el('month').value;
      if(!start||!end||start>end||!Object.hasOwn(draft,start)||!Object.hasOwn(draft,end)||end>today()){
        el('status').textContent='Escolha um período válido dentro do mês, sem datas futuras.';return;
      }
      selected=new Set(dates(month).filter(day=>day>=start&&day<=end&&(el('days').value==='all'||![0,6].includes(weekday(day)))));render();
    }
    function review(){
      invalidate();const r=resident(),list=changes();
      if(!r||!list.length){el('status').textContent='Altere ao menos um turno antes de revisar.';return;}
      if(list.some(c=>c.day>today())){el('status').textContent='Não é permitido lançar frequência futura.';return;}
      pending={resident:clone(r),month:el('month').value,list:clone(list),revision};
      const counts={};for(const c of list)counts[labels[c.after]]=(counts[labels[c.after]]||0)+1;
      el('summary').textContent=r.name+' · '+r.year+' · '+pending.month+': '+new Set(list.map(c=>c.day)).size+' dia(s), '+list.length+' turno(s). '+Object.entries(counts).map(([label,n])=>label+': '+n).join('; ')+'. '+list.filter(c=>c.before!=='').length+' registro(s) anterior(es) serão substituídos.';
      el('changes').innerHTML='<ul>'+list.map(c=>'<li>'+br(c.day)+' · '+(c.shift==='morning'?'Manhã':'Tarde')+': '+esc(labels[c.before]||c.before)+' → '+esc(labels[c.after])+'</li>').join('')+'</ul>';
      el('preview').hidden=false;el('status').textContent='Revise os lançamentos abaixo e confirme antes de salvar.';
    }
    async function save(){
      if(busy||!pending||!el('confirm').checked||!credential())return;
      const plan=clone(pending),token=credential(),version=request;
      if(plan.list.some(c=>c.day>today())){invalidate();el('status').textContent='Revise as datas novamente.';return;}
      setBusy(true);el('status').textContent='Conferindo a revisão do cadastro central…';let sent=false;
      try{
        const current=await supervisionApi({acao:'consultar'},'cadastros_admin');
        if(version!==request||token!==credential())return;
        if(current.revisao!==plan.revision){invalidate();throw new Error('O cadastro central mudou. Carregue o cadastro novamente e refaça o lançamento para preservar as alterações mais recentes.');}
        const app=clone(current.app),r=app?.residentes?.[plan.resident.year]?.[plan.resident.id];
        if(!r||r.name!==plan.resident.name)throw new Error('O cadastro do residente mudou. Carregue novamente.');
        if(!r.attendance)r.attendance={};
        for(const c of plan.list){
          if(!same(r.attendance[c.day]?.[c.shift],c.before))throw new Error('A frequência foi alterada por outra sessão. Carregue novamente.');
          if(!r.attendance[c.day])r.attendance[c.day]={};r.attendance[c.day][c.shift]=c.after||null;
        }
        el('status').textContent='Salvando a frequência no cadastro central…';sent=true;
        await supervisionApi({acao:'salvar',app,revisao:plan.revision},'cadastros_admin');
        // O cadastro local não é substituído; seus rascunhos e envios pendentes são preservados.
        window.ResidPedSecurity?.invalidateRevision();
        if(version!==request||token!==credential())return;
        invalidate();el('status').textContent='Conferindo os registros salvos…';
        const verified=await supervisionApi({acao:'consultar'},'cadastros_admin');
        if(version!==request||token!==credential())return;
        if(!verified.app?.residentes||!verified.revisao||!plan.list.every(c=>same(verified.app.residentes[plan.resident.year]?.[plan.resident.id]?.attendance?.[c.day]?.[c.shift],c.after)))throw new Error('O serviço não confirmou todos os turnos salvos. Carregue o cadastro e confira antes de tentar novamente.');
        central=clone(verified.app);revision=verified.revisao;openMonth();
        el('status').textContent='Frequência salva e conferida: '+plan.resident.name+', '+plan.month+', '+plan.list.length+' turno(s). Os PDFs anteriores não foram reemitidos.';
      }catch(e){
        if(version!==request||token!==credential())return;
        invalidate();if(e.accessDenied)signOutSupervision();
        el('status').textContent=(sent?'O envio precisa ser conferido no cadastro central antes de nova tentativa. ':'')+e.message;
      }finally{setBusy(false);}
    }
    async function downloadPdf(){
      const r=resident(),month=el('month').value;
      if(busy||!r||!credential()||!validMonth(month))return;
      if(changes().length){el('status').textContent='Salve os lançamentos ou carregue novamente o cadastro antes de baixar o PDF da frequência salva.';return;}
      const token=credential(),version=request;setBusy(true);el('status').textContent='Consultando os registros salvos para emitir o PDF…';
      try{
        const current=await supervisionApi({acao:'consultar'},'cadastros_admin');
        if(version!==request||token!==credential())return;
        if(!current.app?.residentes||!current.revisao)throw new Error('O serviço não retornou o cadastro central atualizado.');
        const data=AdminAttendancePDF.prepare(current.app,r,month,today(),AdminAttendancePDF.identity(token));
        const response=await fetch('../portal-preceptor/assets/uea-logo-verde.pdf');
        if(!response.ok)throw new Error('Não foi possível carregar a logo da UEA. Tente novamente.');
        const bytes=await AttendancePDF.create(data,r.id,new Uint8Array(await response.arrayBuffer()),{supervision:true});
        if(version!==request||token!==credential())return;
        const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));pdfUrls.add(url);
        const link=document.createElement('a');link.href=url;
        link.download=('frequencia-supervisao-'+r.name+'-'+month+'.pdf').replace(/[\\/:*?"<>|]/g,'-');
        document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>{URL.revokeObjectURL(url);pdfUrls.delete(url);},60000);
        central=clone(current.app);revision=current.revisao;openMonth();
        el('status').textContent='PDF gerado com a frequência salva de '+r.name+', '+month+'. Campo de assinatura vazio para assinatura posterior. Nenhum registro foi alterado.';
      }catch(e){if(version!==request||token!==credential())return;if(e.accessDenied)signOutSupervision();el('status').textContent='Não foi possível emitir o PDF. '+e.message;}
      finally{setBusy(false);}
    }
    el('pdf').onclick=downloadPdf;
    window.addEventListener('beforeunload',()=>{for(const url of pdfUrls)URL.revokeObjectURL(url);pdfUrls.clear();});
    el('login').onclick=()=>abrirLoginAutoavaliacoes();el('refresh').onclick=load;
    el('resident').onchange=el('month').onchange=openMonth;
    for(const name of ['start','end','days','value','shifts'])el(name).onchange=invalidate;
    el('select').onclick=selectPeriod;el('unselect').onclick=()=>{selected.clear();invalidate();render();};
    el('apply').onclick=()=>{
      invalidate();const value=el('value').value;
      if(!selected.size||!value){el('status').textContent='Selecione os dias e a situação a aplicar.';return;}
      for(const day of selected)if(day<=today())for(const shift of el('shifts').value==='both'?['morning','afternoon']:[el('shifts').value])draft[day][shift]=value;
      render();
    };
    el('calendar').onchange=event=>{
      invalidate();const target=event.target;
      if(target.dataset.day){if(target.checked)selected.add(target.dataset.day);else selected.delete(target.dataset.day);}
      else if(target.dataset.date&&target.dataset.date<=today())draft[target.dataset.date][target.dataset.shift]=target.value;
      el('selection').textContent=selected.size+' dia(s) selecionado(s). '+changes().length+' turno(s) alterado(s) para revisão.';
    };
    el('review').onclick=review;el('confirm').onchange=()=>{el('save').disabled=!pending||!el('confirm').checked;};el('save').onclick=save;
    function selectResident(key,month){
      if(busy||!credential()||!roster.some(item=>item.key===key))return;
      el('resident').value=key;
      el('month').value=month;
      openMonth();
    }
    window.supervisionAttendanceEditor={load,reset,selectResident};
  });
})();
