function createResidentTopics(root, request) {
  const doc = root.ownerDocument;
  let revision = 0;
  function element(tag, text, className) {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  async function load() {
    const version = ++revision;
    root.replaceChildren(element('p','Carregando os temas…','note'));
    let data;
    try { data = await request('temas_residente',{}); }
    catch {
      if (version !== revision) return;
      const retry = element('button','Tentar de novo','ghost');
      retry.type = 'button';
      retry.addEventListener('click',load);
      root.replaceChildren(element('p','Não foi possível carregar os temas. Se a sessão expirou, entre novamente.','error'),retry);
      return;
    }
    if (version !== revision) return;
    const title = element('h3','Conteúdos do '+data.ano);
    const stats = element('p','','note');
    stats.setAttribute('aria-live','polite');
    const updateStats = () => {
      const total = data.temas.length;
      stats.textContent = data.temas.filter(t=>t.li).length+' de '+total+' lidos · '+
        data.temas.filter(t=>t.discuti).length+' de '+total+' discutidos';
    };
    updateStats();
    root.replaceChildren(title,stats);
    const sections = new Map();
    for (const topic of data.temas) {
      if (!sections.has(topic.area)) {
        const group = element('details','','theme-group');
        group.open = sections.size === 0;
        group.append(element('summary',topic.area));
        root.append(group);
        sections.set(topic.area,group);
      }
      const row = element('div','','theme-row');
      const actions = element('div','','theme-actions');
      const status = element('small','','theme-status');
      status.setAttribute('role','status');
      const buttons = {};
      for (const [field,label] of [['li','Li'],['discuti','Discuti']]) {
        const button = element('button',label);
        button.type = 'button';
        button.setAttribute('aria-label',label+': '+topic.titulo);
        buttons[field] = button;
        actions.append(button);
        button.addEventListener('click',async ()=>{
          if (version !== revision) return;
          Object.values(buttons).forEach(b=>b.disabled=true);
          status.textContent='Salvando…';
          try {
            const result = await request('temas_residente',{acao:'salvar',tema:topic.id,campo:field,valor:!topic[field]});
            if (version !== revision) return;
            topic.li=result.li;topic.discuti=result.discuti;
            sync();updateStats();status.textContent='Salvo.';
          } catch {
            if (version === revision) status.textContent='Não foi possível confirmar. Tente novamente.';
          } finally { Object.values(buttons).forEach(b=>b.disabled=false); }
        });
      }
      function sync(){for(const [key,b] of Object.entries(buttons))b.setAttribute('aria-pressed',String(topic[key]===true));}
      sync();
      row.append(element('span',topic.titulo),actions,status);
      sections.get(topic.area).append(row);
    }
  }
  return {load,reset(){++revision;root.replaceChildren();}};
}