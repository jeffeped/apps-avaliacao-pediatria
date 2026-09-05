let residentEvaluationFiles=[],residentPdfUrl='',residentPdfBusy=false,residentFilesRequest=0;

async function loadResidentEvaluations() {
  const request=++residentFilesRequest, list=document.getElementById('residentEvaluationList');
  const button=document.getElementById('refreshResidentEvaluations');
  list.innerHTML='<p class="note">Carregando suas fichas de avaliação…</p>'; button.disabled=true;
  try {
    const result=await api('fichas_residente',{acao:'listar'});
    if (request!==residentFilesRequest) return;
    residentEvaluationFiles=result.fichas||[];
    list.innerHTML=residentEvaluationFiles.length?residentEvaluationFiles.map((file,index)=>{
      const value=file.media==null||String(file.media).trim()===''?null:Number(String(file.media).replace(',','.'));
      const score=value!=null&&Number.isFinite(value)?value.toFixed(1).replace('.',','):'—';
      return '<article class="card resident-evaluation"><h3>'+escHtml(file.modulo||'Avaliação de residência')+'</h3><p>'+escHtml(file.periodo)+' · '+escHtml(period(file.data))+'</p><p><b>Preceptor:</b> '+escHtml(file.preceptor)+'</p><div class="resident-evaluation-score">Nota final: <strong>'+score+' / 10</strong> · '+escHtml(file.conceito)+'</div><div class="actions"><button class="btn primary" data-ficha="'+index+'" onclick="openResidentEvaluation('+index+',false)">Visualizar ficha</button><button class="btn secondary" data-ficha="'+index+'" onclick="openResidentEvaluation('+index+',true)">Baixar PDF</button></div></article>';
    }).join(''):'<div class="card"><p class="note">Nenhuma ficha disponível ainda. As avaliações aparecem aqui quando o preceptor emite o PDF.</p></div>';
  } catch(error) {
    if (request!==residentFilesRequest) return;
    residentEvaluationFiles=[];
    list.innerHTML='<div class="error">Não foi possível carregar suas fichas. '+escHtml(error.message)+' Tente atualizar a lista.</div>';
  } finally {if(request===residentFilesRequest)button.disabled=false;}
}

function closeResidentEvaluation() {
  document.getElementById('residentPdfFrame').src='about:blank';
  document.getElementById('residentPdfPreview').classList.add('hidden');
  document.getElementById('residentPdfDownload').removeAttribute('href');
  if(residentPdfUrl){URL.revokeObjectURL(residentPdfUrl);residentPdfUrl='';}
}

async function openResidentEvaluation(index,download) {
  if(residentPdfBusy)return;
  const file=residentEvaluationFiles[index];if(!file)return;
  residentPdfBusy=true;
  document.querySelectorAll('[data-ficha]').forEach(button=>button.disabled=true);
  try {
    const result=await api('fichas_residente',{acao:'baixar',id:file.id});
    if(result.id!==file.id||!result.pdfBase64)throw new Error('Cópia da ficha indisponível.');
    const bytes=Uint8Array.from(atob(result.pdfBase64),char=>char.charCodeAt(0));
    if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('Cópia da ficha inválida.');
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const name=String(result.nome||'ficha-avaliacao.pdf').replace(/[\\/:*?"<>|]/g,'-');
    if(download){
      const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    } else {
      closeResidentEvaluation();residentPdfUrl=url;
      const link=document.getElementById('residentPdfDownload');link.href=url;link.download=name;
      document.getElementById('residentPdfTitle').textContent=(file.modulo||'Ficha de avaliação')+' · '+period(file.data);
      document.getElementById('residentPdfFrame').src=url;
      const preview=document.getElementById('residentPdfPreview');preview.classList.remove('hidden');preview.scrollIntoView({behavior:'smooth',block:'start'});
    }
  } catch(error){toast(error.message,true);}
  finally{residentPdfBusy=false;document.querySelectorAll('[data-ficha]').forEach(button=>button.disabled=false);}
}

window.addEventListener('beforeunload',()=>{if(residentPdfUrl)URL.revokeObjectURL(residentPdfUrl);});
