(function(){
  'use strict';
  const years=['R1','R2','R3'];
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  const today=()=>new Intl.DateTimeFormat('sv-SE',{
    timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date());
  const shiftDate=(day,delta)=>{
    const date=new Date(day+'T12:00:00Z');
    date.setUTCDate(date.getUTCDate()+delta);
    return date.toISOString().slice(0,10);
  };
  function week(day){
    const weekday=new Date(day+'T12:00:00Z').getUTCDay();
    const start=shiftDate(day,-((weekday+6)%7));
    return [start,shiftDate(start,6)];
  }
  function attendanceCount(attendance,start,end){
    const totals={P:0,A:0,T:0};
    for(const [date,shifts] of Object.entries(attendance||{})){
      if(!datePattern.test(date)||date<start||date>end)continue;
      for(const shift of ['morning','afternoon']){
        const value=shifts?.[shift];
        if(Object.hasOwn(totals,value))totals[value]++;
      }
    }
    return totals;
  }
  function residentEvaluations(resident,evaluations){
    return evaluations.filter(e=>e.ano===resident.year&&(
      e.residenteId?e.residenteId===resident.id:e.residente===resident.name
    ));
  }
  function attendanceText(totals){
    if(!totals.P&&!totals.A&&!totals.T)return 'Sem registros salvos no período';
    return totals.P+' presença(s) · '+totals.A+' falta(s) · '+totals.T+' atraso(s)';
  }
  window.addEventListener('DOMContentLoaded',()=>{
    const root=supervisionEl('supervisionDashboardPanel');
    if(!root)return;
    root.innerHTML=`
      <div class="sec-hdr verde"><h2>Painel da Residência de Pediatria</h2><p>Visão semanal da supervisão</p></div>
      <section class="card residency-overview">
        <div data-login><p>Entre com a conta Google autorizada para consultar o cadastro e os registros da residência.</p>
          <button type="button" class="btn btn-primary">Entrar com Google</button></div>
        <div data-controls hidden>
          <div class="supervision-toolbar"><button type="button" class="btn btn-primary" data-refresh>Atualizar</button>
            <button type="button" class="btn btn-secondary" data-logout>Sair da supervisão</button></div>
          <div class="supervision-filters">
            <div class="fg"><label for="residencyWeek">Data na semana</label><input id="residencyWeek" type="date"></div>
            <div class="fg"><label for="residencyYear">Ano</label><select id="residencyYear"><option value="">Todos os anos</option><option>R1</option><option>R2</option><option>R3</option></select></div>
            <div class="fg"><label for="residencySearch">Residente</label><input id="residencySearch" type="search" placeholder="Buscar por nome"></div>
            <div class="fg"><label for="residencyAttendance">Frequência na semana</label><select id="residencyAttendance"><option value="">Todas as situações</option><option value="absent">Com falta registrada</option><option value="empty">Sem registros salvos</option></select></div>
          </div>
          <p class="supervision-muted">A frequência é contada por turno salvo. Para conferir os turnos esperados, consulte a escala do residente.</p>
        </div>
        <p data-status role="status"></p>
        <p data-summary role="status" hidden></p>
        <p data-epa class="supervision-muted" hidden><strong>Meta formativa do R2</strong> · uma EPA por mês, com progressão planejada de 1 a 5 pacientes conforme avaliação do preceptor.</p>
      </section>
      <div data-cards class="residency-grid"></div>`;

    const find=selector=>root.querySelector(selector);
    const date=supervisionEl('residencyWeek'),year=supervisionEl('residencyYear');
    const search=supervisionEl('residencySearch'),attendance=supervisionEl('residencyAttendance');
    const cards=find('[data-cards]'),summary=find('[data-summary]'),epa=find('[data-epa]');
    const status=find('[data-status]'),refresh=find('[data-refresh]');
    let request=0,app=null,evaluations=null;
    date.value=date.max=today();

    function reset(){
      request++;
      app=null;
      evaluations=null;
      cards.replaceChildren();
      epa.hidden=summary.hidden=true;
      summary.textContent=status.textContent='';
      find('[data-login]').hidden=!!AUTOAVAL_ADMIN_TOKEN;
      find('[data-controls]').hidden=!AUTOAVAL_ADMIN_TOKEN;
      refresh.disabled=false;
    }

    async function load(){
      reset();
      const token=AUTOAVAL_ADMIN_TOKEN;
      if(!token)return;
      const version=request;
      refresh.disabled=true;
      status.textContent='Carregando cadastro, frequência e avaliações…';
      const [roster,results]=await Promise.allSettled([
        supervisionApi({acao:'consultar'},'cadastros_admin'),
        supervisionApi({acao:'listar'})
      ]);
      if(version!==request||token!==AUTOAVAL_ADMIN_TOKEN)return;
      refresh.disabled=false;
      if([roster,results].some(result=>result.reason?.accessDenied)){
        signOutSupervision();
        status.textContent='A conta precisa de acesso à supervisão.';
        return;
      }
      if(!roster.value?.app?.residentes){
        status.textContent='Não foi possível carregar o cadastro central. Use Atualizar para tentar novamente.';
        return;
      }
      app=roster.value.app;
      evaluations=Array.isArray(results.value?.avaliacoes)?results.value.avaliacoes:null;
      status.textContent=evaluations?'':'Avaliações indisponíveis. Use Atualizar para tentar novamente.';
      render();
    }

    function render(){
      if(!app||!AUTOAVAL_ADMIN_TOKEN)return;
      const now=today();
      date.max=now;
      if(!date.value||date.value>now)date.value=now;
      const [start,end]=week(date.value);
      const through=end<now?end:now;
      const query=search.value.trim().toLocaleLowerCase('pt-BR');
      const roster=years.flatMap(group=>Object.entries(app.residentes[group]||{})
        .filter(([,resident])=>String(resident?.name||'').trim())
        .map(([id,resident])=>({id,year:group,name:resident.name,
          week:attendanceCount(resident.attendance,start,through),
          month:attendanceCount(resident.attendance,date.value.slice(0,7)+'-01',
            date.value.slice(0,7)===now.slice(0,7)?now:date.value.slice(0,7)+'-31')
        })));
      const visible=roster.filter(item=>(!year.value||item.year===year.value)
        &&item.name.toLocaleLowerCase('pt-BR').includes(query)
        &&(attendance.value!=='absent'||item.week.A>0)
        &&(attendance.value!=='empty'||!item.week.P&&!item.week.A&&!item.week.T))
        .sort((a,b)=>a.year.localeCompare(b.year)||a.name.localeCompare(b.name,'pt-BR'));
      epa.hidden=year.value!==''&&year.value!=='R2';
      summary.hidden=false;
      summary.textContent=supervisionDate(start)+' a '+supervisionDate(end)+' · '+visible.length+' de '+roster.length+
        ' residentes · '+visible.filter(item=>item.week.A>0).length+' com falta registrada na semana';

      cards.innerHTML=visible.length?visible.map((resident,index)=>{
        const records=residentEvaluations(resident,evaluations||[]);
        const last=records.filter(e=>datePattern.test(e.data)&&e.data<=through)
          .sort((a,b)=>b.data.localeCompare(a.data))[0];
        const module=app.programas?.[resident.year];
        const scheduled=module?.moduloName&&module.startDate&&module.endDate&&module.startDate<=end&&module.endDate>=start;
        const dateLabel=last?supervisionDate(last.data):evaluations?'Sem avaliação datada até o fim do período':'Consulta indisponível';
        return `<article class="card"><h3>${supervisionEscape(resident.name)} · ${resident.year}</h3>
          <dl>
            <dt>Módulo programado para a turma</dt><dd>${scheduled?supervisionEscape(module.moduloName):'Sem módulo confirmado para a semana'}</dd>
            <dt>Frequência na semana</dt><dd>${attendanceText(resident.week)}</dd>
            <dt>Frequência no mês selecionado</dt><dd>${attendanceText(resident.month)}</dd>
            <dt>Última avaliação até a semana consultada</dt><dd>${dateLabel}${last?.preceptor?' · '+supervisionEscape(last.preceptor):''}</dd>
          </dl>
          <div class="supervision-actions">
            <button type="button" class="btn btn-primary" data-frequency="${index}">Frequência e PDF</button>
            ${records.length?'<button type="button" class="btn btn-secondary" data-evaluations="'+index+'">Avaliações</button>':''}
          </div></article>`;
      }).join(''):'<p class="supervision-muted">Nenhum residente corresponde aos filtros.</p>';

      cards.querySelectorAll('[data-frequency]').forEach(button=>{
        button.onclick=async()=>{
          const resident=visible[Number(button.dataset.frequency)],month=date.value.slice(0,7);
          const token=AUTOAVAL_ADMIN_TOKEN;
          await selectSupervisionDocument('frequencia');
          if(supervisionDocument==='frequencia'&&token===AUTOAVAL_ADMIN_TOKEN){
            window.supervisionAttendanceEditor?.selectResident(JSON.stringify([resident.year,resident.id]),month);
          }
        };
      });
      cards.querySelectorAll('[data-evaluations]').forEach(button=>{
        button.onclick=async()=>{
          const resident=visible[Number(button.dataset.evaluations)],token=AUTOAVAL_ADMIN_TOKEN;
          await selectSupervisionDocument('avaliacoes');
          if(supervisionDocument!=='avaliacoes'||token!==AUTOAVAL_ADMIN_TOKEN)return;
          const records=residentEvaluations(resident,supervisionState.data);
          const record=records.find(e=>e.residenteId)||records[0];
          resetSupervisionFilters();
          if(record){
            supervisionEl('supervisionResident').value=supervisionResidentKey(record);
            supervisionEl('supervisionYear').value=resident.year;
            filterSupervision();
          }else{
            supervisionEl('supervisionYear').value=resident.year;
            filterSupervision();
            supervisionEl('supervisionStatus').textContent='Nenhuma avaliação disponível para o residente selecionado na nova consulta.';
          }
        };
      });
    }
    find('[data-login] button').onclick=abrirLoginAutoavaliacoes;
    find('[data-logout]').onclick=()=>signOutSupervision();
    refresh.onclick=load;
    for(const field of [date,year,attendance])field.onchange=render;
    search.oninput=render;
    window.residencyDashboard={load,reset};
  });
})();
