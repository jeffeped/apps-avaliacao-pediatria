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
  evaluationPdfBusy = true; button.textContent = 'Gerando PDF…'; updateEvaluationExportStatus();
  try {
    if (!window.PDFLib || !window.EvaluationPDF) throw new Error('Recarregue o portal para carregar o gerador de PDF.');
    const response = await fetch('./assets/uea-logo-verde.pdf');
    if (!response.ok) throw new Error('Não foi possível carregar a logo da UEA. Tente novamente.');
    const bytes = await EvaluationPDF.create(evaluations, EVALUATION_ITEMS, await response.arrayBuffer());
    const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
    const link = document.createElement('a');
    const name = evaluations.length === 1 ? 'ficha-avaliacao-'+String(evaluations[0].residente).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,80) : 'fichas-avaliacoes-preceptor';
    link.href = url; link.download = name+'-'+manausDate()+'.pdf';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('PDF gerado com sucesso.');
  } catch (error) {
    toast('Não foi possível gerar o PDF. '+error.message, true);
  } finally {
    evaluationPdfBusy = false; button.textContent = label; updateEvaluationExportStatus();
  }
}
