(function(){
  'use strict';
  let confirmed=null,busy=false,loading=false,pending=null,request=0;
  function sameSession(value){return TOKEN===value&&PROFILE&&PROFILE.papel==='residente';}
  function apply(result){confirmed={pontos:result.pontos||[],aberto:result.aberto||null};savePoints(confirmed.pontos);}
  async function refresh(){
    const credential=TOKEN,id=++request;if(!credential||!PROFILE)return;
    loading=true;render();
    try{const result=await api('estado_ponto_residente',{});if(id===request&&sameSession(credential))apply(result);}
    catch(e){if(id===request&&sameSession(credential)){confirmed=null;toast('Não foi possível consultar o ponto: '+e.message,true);}}
    finally{if(id===request){loading=false;render();}}
  }
  function render(){
    if(!PROFILE)return;
    const open=confirmed&&confirmed.aberto,c=PROFILE.pontoConfig||{};
    document.getElementById('clock').textContent=nowManaus().hora.slice(0,5);
    document.getElementById('state').textContent=busy?'Aguardando confirmação do registro…':loading?'Consultando o ponto…':!confirmed?'Ponto indisponível. Atualize a consulta para tentar novamente.':open?'Entrada confirmada em '+String(open.data).split('-').reverse().join('/')+' às '+String(open.hora).slice(0,5):'Pronto para registrar a entrada';
    document.getElementById('place').textContent=c.nome?'Local: '+c.nome+' · raio de '+c.raio+' m':'O local do módulo precisa estar configurado pelo preceptor.';
    document.getElementById('checkin').disabled=busy||loading||!confirmed||!!open;
    document.getElementById('checkout').disabled=busy||loading||!confirmed||!open;
    const p=confirmed?confirmed.pontos.slice(-12).reverse():[];
    document.getElementById('history').innerHTML=p.length?p.map(x=>'<div class="record"><strong>'+(x.tipo==='entrada'?'Entrada':'Saída')+' · '+escHtml(String(x.hora).slice(0,5))+'</strong><br>'+escHtml(String(x.data).split('-').reverse().join('/'))+' · '+Math.round(Number(x.distancia))+' m do local<br>Precisão do GPS: '+Math.round(Number(x.precisao))+' m</div>').join(''):'<div class="note">'+(confirmed?'Nenhum ponto confirmado pelo servidor nesta versão. Os registros anteriores permanecem no histórico da coordenação.':'Aguardando consulta dos registros oficiais.')+'</div>';
  }
  async function register(tipo){
    if(busy||loading||!confirmed||!TOKEN)return;
    const credential=TOKEN;busy=true;render();
    try{
      if(!pending||pending.tipo!==tipo){const g=await getGeo();pending={id:crypto.randomUUID(),tipo,latitude:g.coords.latitude,longitude:g.coords.longitude,precisao:g.coords.accuracy};}
      if(!sameSession(credential))return;
      const result=await api('ponto_residente',pending);
      if(!sameSession(credential))return;
      apply(result);pending=null;toast(tipo==='entrada'?'Entrada confirmada pelo servidor.':'Saída confirmada pelo servidor.');
    }catch(e){
      if(sameSession(credential)){
        // A resposta pode se perder após a gravação. Consultar antes de nova tentativa.
        toast(e.message,true);await refresh();
        // Uma recusa explícita permite obter GPS novo; uma falha de rede conserva a mesma requisição.
        if(e.serverRejected)pending=null;
      }
    }finally{busy=false;render();}
  }
  const originalStart=start,originalLogout=logout;
  window.start=function(){confirmed=null;pending=null;request++;originalStart();refresh();};
  window.logout=async function(){request++;confirmed=null;pending=null;try{await originalLogout();}finally{TOKEN='';PROFILE=null;document.getElementById('app').classList.add('hidden');document.getElementById('login').classList.remove('hidden');}};
  window.renderPonto=render;window.registrar=register;
  window.ResidentPointSecurity={refresh};
  const button=document.createElement('button');button.type='button';button.textContent='Atualizar consulta do ponto';button.onclick=refresh;document.getElementById('history').before(button);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&TOKEN&&!busy)refresh();});
})();
