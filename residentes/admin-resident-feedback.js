// Consultas autenticadas, somente em memória. Não altera respostas ou fichas.
function createSupervisionFeedback(id,modules){
  const root=document.getElementById(id),escape=supervisionEscape;
  const title=modules?'Avaliação dos módulos':'Autoavaliações dos residentes';
  const fields=modules?[['modulo','Módulo'],['ano','Ano da residência'],['periodo','Período avaliado']]:[['residente','Residente'],['ano','Ano da residência'],['periodo','Período / autoavaliação']];
  const state={data:[],limit:20,request:0};
  root.innerHTML='<div class="sec-hdr verde"><h2>'+title+'</h2><p>'+(modules?'Respostas anônimas enviadas pelos residentes':'Competências e reflexões enviadas pelos residentes')+'</p></div><div class="card"><p class="supervision-muted">'+(modules?'A identificação do residente não acompanha estas respostas. Consulte as dez notas e os comentários de cada avaliação. Escala de 1 a 5.':'Consulte todos os envios, inclusive os anteriores. As competências seguem o ano da residência. Escala de 1 a 4.')+'</p></div><div class="card" data-access><p class="supervision-muted">Entre com a conta Google autorizada da supervisão.</p><button class="btn btn-primary" data-login>Entrar com Google</button></div><div class="card" data-controls hidden><div class="supervision-toolbar"><button class="btn btn-primary" data-refresh>Atualizar</button><button class="btn btn-secondary" data-logout>Sair da supervisão</button></div><div class="supervision-filters">'+fields.map(([key,label])=>'<div class="fg"><label for="'+id+'-'+key+'">'+label+'</label><select id="'+id+'-'+key+'" data-filter="'+key+'"><option value="">Todos</option></select></div>').join('')+'</div><button class="btn btn-secondary" data-clear style="margin-top:12px">Limpar filtros</button></div><p class="feedback-status" role="status" aria-live="polite" data-status></p><p class="feedback-summary" role="status" aria-live="polite" data-summary></p><div data-list></div><button class="btn btn-secondary feedback-more" data-more hidden>Mostrar mais respostas</button>';
  const el=selector=>root.querySelector(selector);
  const score=value=>value==null?'—':escape(value);
  function reset(){
    state.request++;state.data=[];state.limit=20;
    el('[data-list]').innerHTML='';el('[data-status]').textContent='';el('[data-summary]').textContent='';
    el('[data-controls]').hidden=true;el('[data-access]').hidden=false;el('[data-more]').hidden=true;el('[data-refresh]').disabled=false;
    root.querySelectorAll('[data-filter]').forEach(select=>select.innerHTML='<option value="">Todos</option>');
  }
  async function load(){
    const selected=Object.fromEntries([...root.querySelectorAll('[data-filter]')].map(select=>[select.dataset.filter,select.value]));
    reset();const request=state.request,token=AUTOAVAL_ADMIN_TOKEN;
    el('[data-access]').hidden=!!token;el('[data-controls]').hidden=!token;
    if(!token)return;
    el('[data-refresh]').disabled=true;el('[data-status]').textContent='Carregando respostas…';
    try{
      const result=await supervisionApi({acao:'listar'},modules?'avaliacoes_modulos_admin':'autoavaliacoes_admin');
      if(request!==state.request || token!==AUTOAVAL_ADMIN_TOKEN)return;
      const data=result[modules?'avaliacoesModulos':'autoavaliacoes'];
      if(!Array.isArray(data))throw new Error('O serviço não retornou as respostas.');
      state.data=data;
      for(const [key] of fields){
        const values=[...new Set(data.map(item=>String(item[key]||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
        const select=el('[data-filter="'+key+'"]');
        select.innerHTML='<option value="">Todos</option>'+values.map(value=>'<option value="'+escape(value)+'">'+escape(value)+'</option>').join('');
        if(values.includes(selected[key]))select.value=selected[key];
      }
      render();el('[data-status]').textContent='Consulta atualizada.';
    }catch(error){
      if(request!==state.request || token!==AUTOAVAL_ADMIN_TOKEN)return;
      if(error.accessDenied)signOutSupervision();
      el('[data-status]').textContent=error.accessDenied?error.message:'Não foi possível carregar as respostas. '+error.message+' Use Atualizar para tentar novamente.';
    }finally{if(request===state.request)el('[data-refresh]').disabled=false;}
  }
  function render(more=false){
    if(!more)state.limit=20;
    const selected=[...root.querySelectorAll('[data-filter]')].map(select=>[select.dataset.filter,select.value]);
    const data=state.data.filter(item=>selected.every(([key,value])=>!value||String(item[key]||'')===value));
    el('[data-summary]').textContent=data.length+' '+(modules?'avaliação(ões) anônima(s)':'autoavaliação(ões)')+' · exibindo '+Math.min(data.length,state.limit);
    el('[data-list]').innerHTML=data.slice(0,state.limit).map(item=>{
      const table='<table><caption>Notas por '+(modules?'critério':'competência')+'</caption><thead><tr><th scope="col">'+(modules?'Critério':'Competência')+'</th><th scope="col">Nota</th></tr></thead><tbody>'+(item.respostas||[]).map(answer=>'<tr><td>'+escape(answer[modules?'criterio':'competencia'])+'</td><td>'+score(answer.nota)+'</td></tr>').join('')+'</tbody></table><p class="supervision-muted">— = nota não registrada ou fora da escala do instrumento.</p>';
      const comments=modules?[['Pontos positivos',item.positivos],['O que melhorar',item.melhorias],['Dificuldades importantes',item.dificuldades],['Sugestões',item.sugestoes]]:[['Reflexão do residente',item.reflexao]];
      return '<article class="card supervision-feedback"><h3>'+escape(item[modules?'modulo':'residente']||'Não informado')+'</h3><p>'+escape(item.ano)+' · '+escape(item.periodo||'Período não informado')+'</p>'+(modules?'<p class="feedback-anonymous">Resposta anônima</p>':'<p>Data: '+escape(supervisionDate(item.data))+'</p><div class="supervision-score">Média das competências: <strong>'+(item.media==null?'—':Number(item.media).toFixed(1).replace('.',','))+' / 4</strong></div>')+'<details><summary>Ver notas e '+(modules?'comentários':'reflexão')+'</summary>'+table+comments.map(([label,value])=>'<p class="supervision-comment"><b>'+label+':</b><br>'+escape(value||'Não informado.')+'</p>').join('')+'</details></article>';
    }).join('') || '<div class="card supervision-muted">'+(state.data.length?'Nenhuma resposta corresponde aos filtros.':'Nenhuma resposta recebida ainda.')+'</div>';
    el('[data-more]').hidden=data.length<=state.limit;
  }
  el('[data-login]').onclick=abrirLoginAutoavaliacoes;
  el('[data-refresh]').onclick=load;el('[data-logout]').onclick=signOutSupervision;
  el('[data-clear]').onclick=()=>{root.querySelectorAll('[data-filter]').forEach(select=>select.value='');render();};
  root.querySelectorAll('[data-filter]').forEach(select=>select.onchange=()=>render());
  el('[data-more]').onclick=()=>{state.limit+=20;render(true);};
  return {load,reset};
}
const supervisionFeedback={
  autoavaliacoes:createSupervisionFeedback('supervisionSelfPanel',false),
  modulos:createSupervisionFeedback('supervisionModulesPanel',true)
};
function resetSupervisionFeedback(){Object.values(supervisionFeedback).forEach(controller=>controller.reset());}
