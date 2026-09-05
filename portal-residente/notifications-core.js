(function(root){
  'use strict';
  function create(catalog){
  const topicIds=catalog.topics.map(t=>t.id),messageIds=new Set(catalog.messages.map(m=>m.id));
  const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
  function defaults(){return{version:1,preferences:{enabled:true,frequency:'daily',time:'12:30',quietStart:'21:00',quietEnd:'07:00',topics:[...topicIds],browser:false},pausedUntil:0,lastDate:'',lastPushDate:'',cursor:0,history:[],favorites:[]};}
  function normalize(raw){
    const state=defaults();if(!raw||typeof raw!=='object'||Array.isArray(raw))return state;
    const p=raw.preferences&&typeof raw.preferences==='object'?raw.preferences:{};
    for(const key of ['enabled','browser'])if(typeof p[key]==='boolean')state.preferences[key]=p[key];
    if(['daily','three-week'].includes(p.frequency))state.preferences.frequency=p.frequency;
    for(const key of ['time','quietStart','quietEnd'])if(validTime(p[key]))state.preferences[key]=p[key];
    if(Array.isArray(p.topics))state.preferences.topics=topicIds.filter(id=>p.topics.includes(id));
    state.pausedUntil=Number.isFinite(raw.pausedUntil)&&raw.pausedUntil>0?raw.pausedUntil:0;
    state.cursor=Number.isSafeInteger(raw.cursor)&&raw.cursor>=0?raw.cursor:0;
    if(Array.isArray(raw.history)){
      const seen=new Set();
      state.history=raw.history.filter(item=>item&&validDate(item.date)&&messageIds.has(item.messageId)).filter(item=>{if(seen.has(item.date))return false;seen.add(item.date);return true;}).slice(-60).map(item=>({date:item.date,messageId:item.messageId,read:item.read===true}));
    }
    const dates=state.history.map(item=>item.date);if(validDate(raw.lastDate))dates.push(raw.lastDate);
    state.lastDate=dates.sort().pop()||'';
    if(validDate(raw.lastPushDate))state.lastPushDate=raw.lastPushDate;
    if(Array.isArray(raw.favorites))state.favorites=[...new Set(raw.favorites.filter(id=>messageIds.has(id)))];
    return state;
  }
  function localTime(date=new Date()){
    if(typeof Utilities==='object'){
      const day=Utilities.formatDate(date,'America/Manaus','yyyy-MM-dd'),time=Utilities.formatDate(date,'America/Manaus','HH:mm');
      return{day,minute:minutes(time),weekday:new Date(day+'T12:00:00Z').getUTCDay()};
    }
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).reduce((out,item)=>(out[item.type]=item.value,out),{});
    const day=p.year+'-'+p.month+'-'+p.day;
    return{day,minute:Number(p.hour)*60+Number(p.minute),weekday:new Date(day+'T12:00:00Z').getUTCDay()};
  }
  function inQuiet(minute,p){const start=minutes(p.quietStart),end=minutes(p.quietEnd);return start===end?false:start<end?minute>=start&&minute<end:minute>=start||minute<end;}
  function eligible(state,date=new Date()){
    const p=state.preferences,t=localTime(date);
    return p.enabled&&catalog.messages.some(m=>p.topics.includes(m.topic))&&date.getTime()>=state.pausedUntil&&t.day>state.lastDate&&(p.frequency==='daily'||[1,3,5].includes(t.weekday))&&t.minute>=minutes(p.time)&&!inQuiet(t.minute,p);
  }
  function nextMessage(state){
    const selected=state.preferences.topics.filter(id=>catalog.messages.some(m=>m.topic===id));if(!selected.length)return null;
    const topic=selected[state.cursor%selected.length],pool=catalog.messages.filter(m=>m.topic===topic);
    const lastSeen=id=>{for(let i=state.history.length-1;i>=0;i--)if(state.history[i].messageId===id)return i;return -1;};
    return pool.reduce((best,item)=>lastSeen(item.id)<lastSeen(best.id)?item:best);
  }
  function deliver(raw,date=new Date()){
    const state=normalize(raw);if(!eligible(state,date))return{state,entry:null};
    const message=nextMessage(state),entry={date:localTime(date).day,messageId:message.id,read:false};
    state.lastDate=entry.date;state.cursor++;state.history=[...state.history,entry].slice(-60);
    return{state,entry};
  }
  const api={defaults,normalize,localTime,inQuiet,eligible,deliver,nextMessage,validTime,minutes};
  return api;
  }
  if(typeof module==='object'&&module.exports){module.exports=create(require('./support-messages.js'));module.exports.create=create;}else root.ResidentNotificationsCore=create(root.ResidentSupportMessages);
})(typeof window==='object'?window:globalThis);
