(() => {
  const root=document.getElementById('supervisionEpa3Panel');
  if(!root)return;
  const fields=[
    ['avaliacao','Avaliação e priorização','Avalia o RN, reconhece instabilidade e define prioridades.'],
    ['plano','Plano e segurança','Justifica a conduta, interpreta exames, prescreve com segurança e define quando reavaliar.'],
    ['comunicacao','Comunicação e continuidade','Explica o plano à família, colabora com a equipe e comunica pendências na passagem de plantão.'],
    ['profissionalismo','Profissionalismo','Reconhece seus limites e aciona o preceptor oportunamente.']
  ];
  const marks={adequado:'Adequado',desenvolver:'A desenvolver',nao_observado:'Não observado'};
  const scenarios={visita:'Visita',admissao:'Admissão',intercorrencia:'Intercorrência',prescricao:'Prescrição',passagem:'Passagem de plantão',outro:'Outro'};
  const levels={'1':'1 · Observação','2':'2 · Supervisão direta','3':'3 · Supervisão indireta','4':'4 · Autonomia na escala de referência','5':'5 · Supervisiona aprendizes','insuficiente':'Evidência insuficiente'};
  const options=(items)=>'<option value="">Selecione</option>'+Object.entries(items).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('');
  const escape=supervisionEscape;
  root.innerHTML='<div class="sec-hdr verde"><h2>EPA 3 · Devolutiva na UTIN</h2><p>Prestando assistência ao recém-nascido nas unidades de cuidados avançados</p></div>'+
    '<div class="card" data-epa-access><p>Entre com a conta Google autorizada da supervisão.</p><button class="btn btn-primary" data-epa-login>Entrar com Google</button></div>'+
    '<div class="card" data-epa-controls hidden><label for="epa3-ano">Ano da residência</label><select id="epa3-ano" data-epa-year><option value="R2">R2</option><option value="R3">R3</option></select><label for="epa3-residente">Residente</label><select id="epa3-residente" data-epa-resident></select><div class="supervision-toolbar"><button class="btn btn-secondary" data-epa-refresh>Atualizar cadastro</button><button class="btn btn-secondary" data-epa-logout>Sair da supervisão</button></div></div>'+
    '<p class="feedback-status" role="status" aria-live="polite" data-epa-status></p>'+
    '<form class="card" data-epa-form hidden>'+
    '<h3>Nova observação</h3><p class="supervision-muted">Síntese local da EPA 3 da SBP. Registre apenas o que foi observado. Não inclua nome, prontuário, leito, data de nascimento ou outros identificadores de paciente.</p>'+
    '<fieldset data-epa-fields style="border:0;min-width:0;padding:0">'+
    '<div class="fg"><label for="epa3-data">Data da observação</label><input id="epa3-data" type="date" required name="data"></div>'+
    '<div class="fg"><label for="epa3-cenario">Situação</label><select id="epa3-cenario" required name="cenario">'+options(scenarios)+'</select></div>'+
    fields.map(([k,label,hint])=>'<div class="fg"><label for="epa3-'+k+'">'+label+'</label><p id="epa3-hint-'+k+'" class="supervision-muted">'+hint+'</p><select id="epa3-'+k+'" aria-describedby="epa3-hint-'+k+'" name="'+k+'" required>'+options(marks)+'</select></div>').join('')+
    '<div class="fg"><label for="epa3-supervisao">Supervisão necessária nesta situação</label><select id="epa3-supervisao" name="supervisao" required>'+options(levels)+'</select><p class="supervision-muted">Um registro isolado não autoriza autonomia nem altera as regras de supervisão da UTIN.</p></div>'+
    '<div class="fg"><label for="epa3-forte">Ponto forte e evidência observada</label><textarea id="epa3-forte" name="forte" required maxlength="300"></textarea></div>'+
    '<div class="fg"><label for="epa3-ajuste">Ajuste combinado para a próxima observação</label><textarea id="epa3-ajuste" name="ajuste" required maxlength="300"></textarea></div>'+
    '<div class="fg"><label for="epa3-revisao">Data para reobservar</label><input id="epa3-revisao" type="date" required name="revisao"></div>'+
    '<label><input name="semIdentificadores" type="checkbox" required> Não incluí dados identificáveis do paciente.</label>'+
    '<div class="supervision-toolbar"><button class="btn btn-primary" type="submit">Salvar devolutiva</button></div></fieldset></form>'+
    '<div class="card" data-epa-history hidden><h3>Histórico do residente</h3><div data-epa-list></div></div>';
  const find=(s)=>root.querySelector(s);
  const status=find('[data-epa-status]'), controls=find('[data-epa-controls]'), access=find('[data-epa-access]');
  const form=find('[data-epa-form]'), fieldset=find('[data-epa-fields]'), resident=find('[data-epa-resident]');
  const history=find('[data-epa-history]'), list=find('[data-epa-list]'), year=find('[data-epa-year]');
  const manaustz=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit'});
  const date=()=>{const parts=Object.fromEntries(manaustz.formatToParts(new Date()).map(part=>[part.type,part.value]));return parts.year+'-'+parts.month+'-'+parts.day;};
  const api=(dados)=>supervisionApi({...dados,ano:year.value},'epa3_supervisao');
  let sequence=0, pending=null;
  function resetForm(){
    form.reset();fieldset.disabled=false;form.elements.data.value=date();form.elements.data.max=date();pending=null;
  }
  function reset(){
    ++sequence; resetForm();controls.hidden=form.hidden=history.hidden=true;access.hidden=false;
    list.replaceChildren();resident.replaceChildren();status.textContent='';
  }
  function handle(error){
    if(error.accessDenied)signOutSupervision();
    status.textContent=error.message;
  }
  async function load(){
    reset();const seq=sequence,token=AUTOAVAL_ADMIN_TOKEN;
    if(!token)return;
    const ano=year.value;
    access.hidden=true;controls.hidden=false;resident.disabled=true;status.textContent='Carregando cadastro do '+ano+'…';
    try{
      const result=await api({acao:'cadastro'});
      if(seq!==sequence||token!==AUTOAVAL_ADMIN_TOKEN)return;
      if(!Array.isArray(result.residentes)||(result.ano!==ano&&!(ano==='R2'&&result.ano===undefined)))throw new Error('O cadastro da EPA 3 para '+ano+' não está disponível.');
      resident.innerHTML='<option value="">Selecione</option>'+result.residentes.map(r=>'<option value="'+escape(r.id)+'">'+escape(r.nome)+'</option>').join('');
      resident.disabled=false;status.textContent=result.residentes.length?'':'Nenhum '+ano+' no cadastro central.';
    }catch(error){if(seq===sequence&&token===AUTOAVAL_ADMIN_TOKEN){controls.hidden=false;handle(error);}}
  }
  async function loadHistory(){
    const seq=++sequence,token=AUTOAVAL_ADMIN_TOKEN,id=resident.value;
    list.replaceChildren();history.hidden=!id;
    if(!id)return;
    list.textContent='Carregando histórico…';
    try{
      const {registros}=await api({acao:'historico',residenteId:id});
      if(seq!==sequence||token!==AUTOAVAL_ADMIN_TOKEN)return;
      if(!Array.isArray(registros)||registros.some(r=>r.residenteId!==id))throw new Error('Não foi possível conferir o histórico.');
      list.innerHTML=registros.map(r=>'<details class="supervision-feedback"><summary>'+escape(supervisionDate(r.data))+' · '+escape(scenarios[r.cenario]||r.cenario)+'</summary><p>Preceptor: '+escape(r.preceptor)+'</p><p>'+escape(levels[r.supervisao]||r.supervisao)+'</p><ul>'+
        fields.map(([key,label])=>'<li>'+escape(label)+': '+escape(marks[r.comportamentos?.[key]]||'Não informado')+'</li>').join('')+'</ul><p><strong>Ponto forte:</strong> '+escape(r.forte)+'</p><p><strong>Ajuste:</strong> '+escape(r.ajuste)+'</p><p><strong>Reobservar em:</strong> '+escape(supervisionDate(r.revisao))+'</p></details>').join('')||'<p>Nenhuma devolutiva registrada.</p>';
    }catch(error){if(seq===sequence&&token===AUTOAVAL_ADMIN_TOKEN){list.replaceChildren();handle(error);}}
  }
  year.onchange=load;
  resident.onchange=()=>{resetForm();status.textContent='';form.hidden=!resident.value;loadHistory();};
  find('[data-epa-login]').onclick=abrirLoginAutoavaliacoes;
  find('[data-epa-logout]').onclick=signOutSupervision;
  find('[data-epa-refresh]').onclick=load;
  form.onsubmit=async(event)=>{
    event.preventDefault();
    if(fieldset.disabled||!resident.value||!AUTOAVAL_ADMIN_TOKEN)return;
    const values=Object.fromEntries(new FormData(form));
    const {data,cenario,supervisao,forte,ajuste,revisao}=values;
    const payload={data,cenario,supervisao,forte,ajuste,revisao,semIdentificadores:values.semIdentificadores==='on',comportamentos:Object.fromEntries(fields.map(([key])=>[key,values[key]]))};
    if(!pending||pending.snapshot!==JSON.stringify(payload))pending={snapshot:JSON.stringify(payload),id:crypto.randomUUID()};
    const seq=sequence,token=AUTOAVAL_ADMIN_TOKEN,id=resident.value;
    fieldset.disabled=resident.disabled=year.disabled=true;status.textContent='Salvando devolutiva…';
    try{
      const result=await api({acao:'salvar',residenteId:id,registro:{...payload,id:pending.id}});
      if(seq!==sequence||token!==AUTOAVAL_ADMIN_TOKEN)return;
      if(result.registro?.id!==pending.id||result.registro?.residenteId!==id)throw new Error('Salvamento não confirmado. Reenvie sem alterar os campos para conferir.');
      resetForm();resident.disabled=false;status.textContent='Devolutiva salva.';loadHistory();
    }catch(error){if(seq===sequence&&token===AUTOAVAL_ADMIN_TOKEN){
      if(error.accessDenied||error.codigo)handle(error);
      else status.textContent='Salvamento não confirmado. Confira o histórico ou reenvie sem alterar os campos.';
    }}
    finally{year.disabled=false;if(seq===sequence&&token===AUTOAVAL_ADMIN_TOKEN)resident.disabled=fieldset.disabled=false;}
  };
  window.supervisionEpa3={load,reset};
})();
