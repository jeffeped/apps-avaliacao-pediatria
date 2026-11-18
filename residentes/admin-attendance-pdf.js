/* Exportação da frequência administrativa já salva. Nenhum dado é gravado. */
(function(root){
  'use strict';
  function identity(credential){
    try{
      const part=String(credential).split('.')[1];
      const encoded=part.replace(/-/g,'+').replace(/_/g,'/');
      const binary=atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'='));
      const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
      if(!String(claims.email||'').trim()||claims.email_verified===false)throw new Error('email');
      return{nome:String(claims.name||claims.email).trim(),email:String(claims.email).trim()};
    }catch{throw new Error('Entre novamente com Google para identificar a conta da supervisão que emite o PDF.');}
  }
  // Chamar somente após o servidor autorizar a consulta com o mesmo credential.
  function prepare(app,selected,month,issued,supervisor){
    const info=root.AttendancePDF.monthInfo(month);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(issued)||new Date(issued+'T12:00:00Z').toISOString().slice(0,10)!==issued)throw new Error('Data de emissão inválida.');
    if(month>issued.slice(0,7))throw new Error('Não é permitido emitir frequência de um mês futuro.');
    const resident=app?.residentes?.[selected.year]?.[selected.id];
    if(!resident||resident.name!==selected.name)throw new Error('O cadastro do residente mudou. Carregue novamente antes de emitir o PDF.');
    const end=month===issued.slice(0,7)?issued:month+'-'+String(info.days).padStart(2,'0');
    const records=[];
    for(let i=1;i<=info.days;i++){
      const day=month+'-'+String(i).padStart(2,'0');if(day>end)continue;
      const saved=resident.attendance?.[day]||{};
      for(const [slot,periodo] of [['morning','Manhã'],['afternoon','Tarde']]){
        const status=saved[slot];if(status==null||status==='')continue;
        if(!['P','A','T'].includes(status))throw new Error('Situação não reconhecida em '+day.split('-').reverse().join('/')+'. Confira a frequência antes de emitir.');
        records.push({residenteId:selected.id,data:day,modulo:'',periodo,status});
      }
    }
    if(!records.length)throw new Error('Não há frequência salva para este residente no mês selecionado.');
    // O cadastro de módulos é atual e não documenta, necessariamente, o mês histórico.
    return{mes:month,emitidoEm:issued,consultadoAte:end,supervisor,residentes:[{id:selected.id,nome:resident.name,ano:selected.year,modulo:''}],registros:records};
  }
  root.AdminAttendancePDF={identity,prepare};
})(typeof window==='undefined'?globalThis:window);
