/* Fichas geradas no navegador a partir das avaliações salvas. */
(function (root) {
  'use strict';

  function score(value) {
    if (value == null || String(value).trim() === '') return '-';
    const number = Number(String(value).replace(',', '.'));
    return Number.isFinite(number) ? number.toFixed(1).replace('.', ',') : '-';
  }

  function date(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(String(value || ''));
    return match ? match[3] + '/' + match[2] + '/' + match[1] : String(value || '-');
  }

  function placeDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(String(value || ''));
    const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return match && months[Number(match[2])-1] ? 'Manaus, '+match[3]+' de '+months[Number(match[2])-1]+' de '+match[1] :
      'Manaus, ____ de __________________ de ______';
  }

  async function create(evaluations, criteria, logoBytes, options = {}) {
    if (!evaluations.length) throw new Error('Não há avaliações para exportar.');
    for (const evaluation of evaluations) {
      if (String(evaluation.observacoes || '').trim().length > 300) {
        throw new Error('O comentário de '+evaluation.residente+' ultrapassa 300 caracteres. Use um comentário breve para a ficha em uma página. O CSV preserva o texto completo.');
      }
    }
    const { PDFDocument, PDFHexString, PDFName, PDFNumber, StandardFonts, rgb } = root.PDFLib;
    const doc = await PDFDocument.create();
    const form = doc.getForm();
    form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(1));
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const [logo] = await doc.embedPdf(logoBytes, [0]);
    const green = rgb(0, .38, .21), pale = rgb(.92, .96, .93);
    const ink = rgb(.13, .19, .17), muted = rgb(.36, .43, .39);
    const line = rgb(.79, .85, .81), white = rgb(1, 1, 1);
    const width = 595.28, height = 841.89, margin = 42, content = width - margin * 2;
    const bottom = 65;
    const supported = new Set(regular.getCharacterSet());
    const clean = value => Array.from(String(value == null ? '' : value).normalize('NFC'))
      .map(char => char === '\n' || supported.has(char.codePointAt(0)) ? char :
        /\s/.test(char) ? ' ' : '[U+' + char.codePointAt(0).toString(16).toUpperCase() + ']')
      .join('');
    const wrap = (value, maxWidth, size = 10, font = regular) => {
      const result = [];
      clean(value).split(/\r?\n/).forEach(paragraph => {
        let current = '';
        paragraph.split(/\s+/).filter(Boolean).forEach(word => {
          if (current && font.widthOfTextAtSize(current + ' ' + word, size) > maxWidth) {
            result.push(current); current = '';
          }
          // Quebra também palavras e identificadores sem espaços.
          for (const char of word) {
            if (font.widthOfTextAtSize(current + char, size) > maxWidth) {
              result.push(current); current = '';
            }
            current += char;
          }
          current += ' ';
        });
        result.push(current.trimEnd());
      });
      return result.length ? result : [''];
    };
    let page, y, evaluation, sheetPages;
    const text = (value, x, top, size = 10, font = regular, color = ink) => {
      page.drawText(clean(value), { x, y: height - top - size, size, font, color });
    };
    const rect = (x, top, w, h, color) => page.drawRectangle({x, y: height - top - h, width:w, height:h, color});
    const rule = top => page.drawLine({start:{x:margin,y:height-top},end:{x:width-margin,y:height-top},thickness:.6,color:line});
    const lines = (values, x, top, size = 10, font = regular, color = ink, leading = 14) => {
      values.forEach((value, index) => text(value, x, top + index * leading, size, font, color));
    };
    const ensureSpace = amount => {
      if (y + amount > height-bottom) throw new Error('Os textos da avaliação de '+evaluation.residente+' não cabem na ficha de uma página. Revise os campos extensos antes de exportar.');
    };
    const addPage = () => {
      page = doc.addPage([width, height]); sheetPages.push(page);
      page.drawPage(logo, {x:margin-5, y:height-94, width:135, height:135*logo.height/logo.width});
      text('RESIDÊNCIA MÉDICA EM PEDIATRIA', 208, 45, 9, bold, green);
      text('Ficha de avaliação', 208, 58, 21, bold, green);
      text('Portal do Preceptor · ResidPed UEA', 208, 84, 9, regular, muted);
      rule(105);
      y = 120;
      if (options.example) {
        text('EXEMPLO ILUSTRATIVO - DADOS FICTÍCIOS', margin, y, 8, bold, green); y += 23;
      }
      text('IDENTIFICAÇÃO DO RESIDENTE', margin, y, 8, bold, green);
      y += 17;
      const names = wrap(evaluation.residente || 'Não informado', content, 16, bold);
      lines(names, margin, y, 16, bold, ink, 20); y += names.length * 20 + 9;
      const fields = [
        ['Ano da residência', evaluation.ano], ['Data da avaliação', date(evaluation.data)],
        ['Módulo / setor', evaluation.modulo], ['Período avaliado', evaluation.periodo]
      ];
      for (let i = 0; i < fields.length; i += 2) {
        let rowHeight = 0;
        fields.slice(i, i + 2).forEach(([label, value], column) => {
          const x = margin + column * (content + 20) / 2;
          text(label.toUpperCase(), x, y, 7.5, bold, muted);
          const values = wrap(value || 'Não informado', (content-20)/2, 10);
          lines(values, x, y + 13); rowHeight = Math.max(rowHeight, values.length * 14 + 19);
        });
        y += rowHeight;
      }
      y += 6;
    };
    const tableHead = () => {
      rect(margin, y, content, 25, green);
      text('DOMÍNIO', margin+10, y+8, 8, bold, white);
      text('CRITÉRIO AVALIADO', margin+108, y+8, 8, bold, white);
      text('NOTA', width-margin-43, y+8, 8, bold, white);
      y += 25;
    };
    const signatureField = index => {
      // O mesmo objeto integra os campos do formulário e as anotações da página.
      // Sem /V: o campo permanece vazio, para assinatura posterior pelo preceptor.
      ensureSpace(90);
      y += 10;
      text(placeDate(evaluation.data), margin, y, 10, regular, ink);
      y += 22;
      const identityWidth = 276, fieldX = margin+296, fieldWidth = content-296;
      text('PRECEPTOR RESPONSÁVEL', margin, y, 9, bold, green);
      text('ASSINATURA DIGITAL', fieldX, y, 9, bold, green);
      const preceptor = options.preceptor || {};
      let nameLines, emailLines, identitySize = 10;
      for (; identitySize >= 7; identitySize -= .5) {
        nameLines = wrap(preceptor.nome || 'Nome do preceptor', identityWidth, identitySize, bold);
        emailLines = wrap(preceptor.email || 'E-mail do preceptor', identityWidth, identitySize-1);
        if ((nameLines.length+emailLines.length)*(identitySize+1)+2 <= 40) break;
      }
      if (identitySize < 7) throw new Error('O nome ou e-mail do preceptor é extenso demais para o campo de identificação.');
      lines(nameLines, margin, y+17, identitySize, bold, ink, identitySize+1);
      lines(emailLines, margin, y+19+nameLines.length*(identitySize+1), identitySize-1, regular, muted, identitySize+1);
      const fieldHeight = 40, fieldY = height-y-17-fieldHeight;
      const appearance = doc.context.register(doc.context.flateStream(
        'q 0.79 0.85 0.81 RG 0.6 w 0.3 0.3 '+(fieldWidth-.6)+' '+(fieldHeight-.6)+' re S Q',
        {Type:'XObject',Subtype:'Form',BBox:[0,0,fieldWidth,fieldHeight],Resources:{}}
      ));
      const field = doc.context.register(doc.context.obj({
        Type:'Annot',Subtype:'Widget',FT:'Sig',
        T:PDFHexString.fromText('assinatura_preceptor_'+(index+1)),
        TU:PDFHexString.fromText('Assinatura digital do preceptor - ficha '+(index+1)),
        Rect:[fieldX,fieldY,width-margin,fieldY+fieldHeight],
        P:page.ref,F:4,Ff:0,AP:{N:appearance}
      }));
      form.acroForm.addField(field);
      page.node.addAnnot(field);
      y += 57;
    };

    for (let index = 0; index < evaluations.length; index++) {
      evaluation = evaluations[index]; sheetPages = [];
      addPage(); tableHead();
      const items = Array.isArray(evaluation.itens) ? evaluation.itens : [];
      const byCode = new Map(items.filter(Boolean).map(item => [item.codigo, item]));
      const missing = criteria.some((_, i) => score((byCode.get('I'+String(i+1).padStart(2,'0')) || {}).escore) === '-');
      for (let i = 0; i < criteria.length; i++) {
        const item = byCode.get('I'+String(i+1).padStart(2,'0')) || {};
        const values = wrap(item.texto || criteria[i][1], content-172, 9);
        const domain = wrap(criteria[i][0], 90, 8.5, bold);
        const rowHeight = Math.max(values.length * 12, domain.length * 12) + 10;
        ensureSpace(rowHeight);
        if (i % 2 === 0) rect(margin, y, content, rowHeight, pale);
        lines(domain, margin+10, y+5, 8.5, bold, green, 12);
        lines(values, margin+108, y+5, 9, regular, ink, 12);
        const value = score(item.escore);
        text(value, width-margin-29-bold.widthOfTextAtSize(value,10)/2, y+5, 10, bold, green);
        y += rowHeight; rule(y);
      }
      y += 14;
      ensureSpace(70 + (missing ? 18 : 0));
      if (missing) {text('- = nota do critério não registrada nesta avaliação.', margin, y, 8, regular, muted); y += 18;}
      const domainWidth = content / 3;
      ['Conhecimentos', 'Habilidades', 'Atitudes'].forEach((label, i) => {
        const x = margin + i * domainWidth;
        text(label+': '+score(evaluation[label.toLowerCase()]), x, y, 9, bold, green);
      });
      y += 16;
      rect(margin, y, content, 43, pale);
      text('NOTA FINAL', margin+12, y+10, 9, bold, green);
      text(evaluation.conceito || 'Conceito não informado', margin+12, y+26, 9, regular, green);
      const final = score(evaluation.media) + ' / 10';
      text(final, width-margin-12-bold.widthOfTextAtSize(final,22), y+11, 22, bold, green);
      y += 53;
      const observations = String(evaluation.observacoes || '').trim();
      if (observations) {
        const observationLines = wrap(observations.replace(/\s+/g,' '), content, 9);
        ensureSpace(17 + observationLines.length*12 + 90);
        text('OBSERVAÇÕES DO PRECEPTOR', margin, y, 9, bold, green); y += 17;
        for (const value of observationLines) {
          text(value, margin, y, 9); y += 12;
        }
      }
      signatureField(index);
      sheetPages.forEach((sheetPage, sheetIndex) => {
        page = sheetPage; rule(height-45);
        text('UEA · Residência Médica em Pediatria', margin, height-34, 8, regular, muted);
        const footer = 'Ficha '+(index+1)+' de '+evaluations.length+' · Página '+(sheetIndex+1)+' de '+sheetPages.length;
        text(footer, width-margin-regular.widthOfTextAtSize(footer,8), height-34, 8, regular, muted);
      });
    }
    doc.setTitle(options.example ? 'Exemplo de ficha de avaliação - ResidPed UEA' : 'Fichas de avaliação - ResidPed UEA');
    doc.setAuthor('ResidPed UEA');
    doc.setSubject('Avaliação de residente em Pediatria');
    return doc.save();
  }

  root.EvaluationPDF = { create, score, date, placeDate };
})(typeof window === 'undefined' ? globalThis : window);
