let savedEvaluations = [], evaluationExportsLoading = false, evaluationPdfBusy = false;
let evaluationExportsRequest = 0;
const evaluationResidentKey = evaluation => JSON.stringify([evaluation.residente, evaluation.ano]);

async function loadEvaluationExports() {
  const request = ++evaluationExportsRequest;
  const residentSelect = document.getElementById('exportEvalResident');
  const resident = residentSelect.value;
  evaluationExportsLoading = true;
  savedEvaluations = [];
  updateEvaluationExportStatus();
  try {
    const result = await api('exportacoes_preceptor');
    if (request !== evaluationExportsRequest) return;
    savedEvaluations = (result.avaliacoes || []).filter(Boolean);
    const residents = new Map(savedEvaluations.map(a => [evaluationResidentKey(a), a]));
    residentSelect.innerHTML = '<option value="">Todos os residentes</option>' +
      Array.from(residents).sort((a,b) => a[1].residente.localeCompare(b[1].residente, 'pt-BR'))
        .map(([key,a]) => '<option value="'+escAttr(key)+'">'+esc(a.residente)+' · '+esc(a.ano)+'</option>').join('');
    residentSelect.value = residents.has(resident) ? resident : '';
    evaluationExportsLoading = false;
    // A posição na lista pode mudar após salvar; a seleção individual é reiniciada.
    renderExportEvaluationOptions();
  } catch (error) {
    if (request !== evaluationExportsRequest) return;
    evaluationExportsLoading = false;
    updateEvaluationExportStatus();
    document.getElementById('evaluationExportStatus').textContent = 'Não foi possível carregar as avaliações. '+error.message+' Use Atualizar lista para tentar novamente.';
  }
}

function renderExportEvaluationOptions() {
  const resident = document.getElementById('exportEvalResident').value;
  document.getElementById('exportEvaluation').innerHTML = '<option value="">Todas as avaliações</option>' +
    savedEvaluations.map((a,index) => resident && evaluationResidentKey(a) !== resident ? '' :
      '<option value="'+index+'">'+esc([EvaluationPDF.date(a.data), a.residente, a.periodo, a.modulo].filter(Boolean).join(' · '))+'</option>').join('');
  updateEvaluationExportStatus();
}

function selectedExportEvaluations() {
  const resident = document.getElementById('exportEvalResident').value;
  const selected = document.getElementById('exportEvaluation').value;
  return savedEvaluations.filter((a,index) => (!resident || evaluationResidentKey(a) === resident) && (selected === '' || String(index) === selected));
}

function updateEvaluationExportStatus() {
  const count = selectedExportEvaluations().length;
  const busy = evaluationExportsLoading || evaluationPdfBusy;
  ['exportEvaluationsCsv','exportEvaluationsPdf'].forEach(id => document.getElementById(id).disabled = busy || !count);
  ['exportEvalResident','exportEvaluation'].forEach(id => document.getElementById(id).disabled = busy || !savedEvaluations.length);
  document.getElementById('refreshEvaluationExports').disabled = busy;
  document.getElementById('evaluationExportStatus').textContent = evaluationExportsLoading ? 'Carregando avaliações salvas…' :
    evaluationPdfBusy ? 'Preparando as fichas em PDF…' : !savedEvaluations.length ? 'Você ainda não tem avaliações salvas para exportar.' :
    count+(count === 1 ? ' avaliação selecionada' : ' avaliações selecionadas')+'. Os filtros valem para CSV e PDF.';
}

function exportarAvaliacoes() {
  if (evaluationExportsLoading || evaluationPdfBusy) return;
  const rows = selectedExportEvaluations().map(a => {
    const items = new Map((a.itens || []).filter(Boolean).map(item => [item.codigo, item.escore]));
    return [a.data,a.residente,a.ano,a.modulo,a.periodo,a.conhecimentos,a.habilidades,a.atitudes,a.media,a.conceito,
      ...EVALUATION_ITEMS.map((_,i) => items.get('I'+String(i+1).padStart(2,'0')) ?? ''),a.observacoes];
  });
  baixarCsv('avaliacoes-preceptor-'+manausDate()+'.csv',
    ['Data','Residente','Ano','Módulo','Período','Conhecimentos','Habilidades','Atitudes','Média final','Conceito',
      ...EVALUATION_ITEMS.map((_,i) => 'Item '+String(i+1).padStart(2,'0')),'Observações'],rows);
}

async function exportarAvaliacoesPdf() {
  if (evaluationExportsLoading || evaluationPdfBusy) return;
  const evaluations = selectedExportEvaluations();
  if (!evaluations.length) {toast('Não há avaliações para exportar.',true);return;}
  const button = document.getElementById('exportEvaluationsPdf'), label = button.textContent;
  let publicationNotice = '';
  evaluationPdfBusy = true; button.textContent = 'Gerando PDF…'; updateEvaluationExportStatus();
  try {
    if (!window.PDFLib || !window.EvaluationPDF) throw new Error('Recarregue o portal para carregar o gerador de PDF.');
    if (!profile || profile.papel!=='preceptor' || !String(profile.nome||'').trim() || !String(profile.email||'').trim()) throw new Error('Entre novamente para identificar o preceptor responsável.');
    const options={preceptor:{nome:String(profile.nome).trim(),email:String(profile.email).trim()}};
    const response = await fetch('./assets/uea-logo-verde.pdf');
    if (!response.ok) throw new Error('Não foi possível carregar a logo da UEA. Tente novamente.');
    const logoBytes=await response.arrayBuffer();
    const bytes = await EvaluationPDF.create(evaluations, EVALUATION_ITEMS, logoBytes, options);
    const failures=[];
    for (let i=0;i<evaluations.length;i++) {
      const evaluation=evaluations[i];
      document.getElementById('evaluationExportStatus').textContent='Disponibilizando ficha '+(i+1)+' de '+evaluations.length+' no portal do residente…';
      try {
        if (!evaluation.id || !evaluation.residenteId) throw new Error('O registro precisa estar vinculado ao cadastro do residente.');
        // Cada destinatário recebe somente a própria ficha, nunca o PDF do lote.
        const individual= evaluations.length===1 ? bytes : await EvaluationPDF.create([evaluation],EVALUATION_ITEMS,logoBytes,options);
        const pdfBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Não foi possível preparar a cópia.'));reader.readAsDataURL(new Blob([individual],{type:'application/pdf'}));});
        await api('publicar_ficha_preceptor',{avaliacaoId:evaluation.id,pdfBase64});
      } catch(error) {failures.push(evaluation.residente+': '+error.message);}
    }
    const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
    const link = document.createElement('a');
    const name = evaluations.length === 1 ? 'ficha-avaliacao-'+String(evaluations[0].residente).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,80) : 'fichas-avaliacoes-preceptor';
    link.href = url; link.download = name+'-'+manausDate()+'.pdf';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    publicationNotice=failures.length ? 'PDF gerado. Não foi possível disponibilizar '+failures.length+' ficha(s) ao residente. '+failures.join(' ')+' Emita novamente para tentar disponibilizar a cópia.' :
      'PDF gerado. '+evaluations.length+(evaluations.length===1?' ficha disponível no portal do residente.':' fichas disponíveis nos respectivos portais dos residentes.');
    toast(failures.length?'PDF gerado; há cópias pendentes para os residentes.':'PDF gerado e disponível para o residente.',failures.length>0);
  } catch (error) {
    toast('Não foi possível gerar o PDF. '+error.message, true);
  } finally {
    evaluationPdfBusy = false; button.textContent = label; updateEvaluationExportStatus();
    if (publicationNotice) document.getElementById('evaluationExportStatus').textContent=publicationNotice;
  }
}
