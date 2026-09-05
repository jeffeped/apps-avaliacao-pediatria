(function(root){
  'use strict';
  function transaction(action){return new Promise((resolve,reject)=>{
    const request=indexedDB.open('resident-support-push',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),get=store.get('device');let result;
      get.onsuccess=()=>{try{const next=action(get.result||null);result=next.result;if(next.state!==undefined)store.put(next.state,'device');}catch(error){tx.abort();reject(error);}};
      tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error||new Error('Não foi possível salvar o dispositivo.'));};
    };
  });}
  root.ResidentPushStore={
    set(value){return transaction(old=>({state:{...value,lastDate:old&&old.id===value.id?old.lastDate||'':''},result:true}));},
    clear(){return transaction(()=>({state:{active:false},result:true}));},
    claim(data){return transaction(state=>{
      if(!state||!state.active||state.id!==data.deviceId||!Number.isFinite(Number(data.expiresAt))||Number(data.expiresAt)<Date.now())return{result:false};
      const p=state.preferences,core=root.ResidentNotificationsCore,t=core.localTime();
      if(!p.enabled||Date.now()<state.pausedUntil||core.inQuiet(t.minute,p)||data.date!==t.day||state.lastDate>=data.date)return{result:false};
      state.lastDate=data.date;return{state,result:true};
    });}
  };
})(typeof window==='object'?window:self);
