/* Ficha mensal de frequência: dados salvos, uma página A4 por residente. */
(function(root){
  'use strict';
  const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const weekdays=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  function monthInfo(value){
    const match=/^(20\d{2})-(0[1-9]|1[0-2])$/.exec(String(value||''));
    if(!match)throw new Error('Selecione um mês válido.');
    const year=Number(match[1]),month=Number(match[2]);
    return {year,month,days:new Date(Date.UTC(year,month,0)).getUTCDate(),label:months[month-1]+' de '+year};
  }
  function prepare(data,residenteId){
    const info=monthInfo(data.mes),resident=(data.residentes||[]).find(r=>r.id===residenteId);
    if(!resident)throw new Error('Selecione um residente vinculado ao seu módulo.');
    const normalize=value=>String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const periods={'manha':['manha'],'tarde':['tarde'],'dia completo':['manha','tarde']};
    const statuses={p:'P',presente:'P',a:'A',falta:'A',ausente:'A',t:'T',atraso:'T'};
    const rows=Array.from({length:info.days},(_,i)=>({data:data.mes+'-'+String(i+1).padStart(2,'0'),dia:weekdays[new Date(Date.UTC(info.year,info.month-1,i+1)).getUTCDay()],manha:'-',tarde:'-'}));
    const byDate=new Map(rows.map(row=>[row.data,row]));let records=0;
    for(const record of data.registros||[]){
      if(record.residenteId!==residenteId)continue;
      const row=byDate.get(record.data);
      if(!row)throw new Error('Há um registro fora do mês ou com data inválida. Atualize a consulta.');
      if(normalize(record.modulo)!==normalize(resident.modulo))throw new Error('O módulo de um registro diverge do residente selecionado.');
      const slots=periods[normalize(record.periodo)],status=statuses[normalize(record.status)];
      if(!slots||!status)throw new Error('Revise o registro de '+record.data.split('-').reverse().join('/')+': período ou situação não reconhecidos.');
      for(const slot of slots){
        if(row[slot]!=='-'&&row[slot]!==status)throw new Error('Há lançamentos divergentes em '+record.data.split('-').reverse().join('/')+' ('+(slot==='manha'?'manhã':'tarde')+'). Solicite a revisão antes de emitir a ficha.');
        row[slot]=status;
      }
      records++;
    }
    const totals={P:0,A:0,T:0,dias:0};
    rows.forEach(row=>{if(row.manha!=='-'||row.tarde!=='-')totals.dias++;for(const slot of ['manha','tarde'])if(row[slot]!=='-')totals[row[slot]]++;});
    return {info,resident,rows,totals,records};
  }

  async function create(data,residenteId,logoBytes,options={}){
    const sheet=prepare(data,residenteId),{info,resident,rows,totals}=sheet;
    if(!sheet.records&&!options.template)throw new Error('Não há frequência salva para este residente no mês selecionado.');
    const preceptor=data.preceptor||{};
    if(!options.template&&(!String(preceptor.nome||'').trim()||!String(preceptor.email||'').trim()))throw new Error('Entre novamente para identificar o preceptor que emite a ficha.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(data.emitidoEm||''))throw new Error('Data de emissão indisponível. Atualize a consulta.');
    const {PDFDocument,PDFName,PDFNumber,PDFHexString,StandardFonts,rgb}=root.PDFLib;
    const doc=await PDFDocument.create(),form=doc.getForm();form.acroForm.dict.set(PDFName.of('SigFlags'),PDFNumber.of(1));
    const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
    const [logo]=await doc.embedPdf(logoBytes,[0]);
    const width=595.28,height=841.89,margin=42,content=width-margin*2,page=doc.addPage([width,height]);
    const green=rgb(0,.38,.21),pale=rgb(.92,.96,.93),ink=rgb(.13,.19,.17),muted=rgb(.36,.43,.39),line=rgb(.79,.85,.81),white=rgb(1,1,1);
    const supported=new Set(regular.getCharacterSet());
    const clean=value=>Array.from(String(value??'').normalize('NFC')).map(char=>char==='\n'||supported.has(char.codePointAt(0))?char:/\s/.test(char)?' ':'[U+'+char.codePointAt(0).toString(16).toUpperCase()+']').join('');
    const wrap=(value,w,size=10,font=regular)=>{
      const lines=[];let current='';
      for(const word of clean(value).replace(/\s+/g,' ').trim().split(' ')){
        if(current&&font.widthOfTextAtSize(current+' '+word,size)>w){lines.push(current);current='';}
        if(current)current+=' ';
        for(const char of word){if(font.widthOfTextAtSize(current+char,size)>w){lines.push(current);current='';}current+=char;}
      }
      if(current||!lines.length)lines.push(current);return lines;
    };
    const text=(value,x,top,size=10,font=regular,color=ink)=>page.drawText(clean(value),{x,y:height-top-size,size,font,color});
    const lines=(values,x,top,size=10,font=regular,color=ink,leading=14)=>values.forEach((value,i)=>text(value,x,top+i*leading,size,font,color));
    const rect=(x,top,w,h,color)=>page.drawRectangle({x,y:height-top-h,width:w,height:h,color});
    const rule=top=>page.drawLine({start:{x:margin,y:height-top},end:{x:width-margin,y:height-top},thickness:.6,color:line});
    page.drawPage(logo,{x:margin-5,y:height-94,width:135,height:135*logo.height/logo.width});
    text('RESIDÊNCIA MÉDICA EM PEDIATRIA',208,45,9,bold,green);
    text('Ficha de frequência',208,58,21,bold,green);
    text('Portal do Preceptor · ResidPed UEA',208,84,9,regular,muted);rule(105);
    let y=120;text('IDENTIFICAÇÃO DO RESIDENTE',margin,y,8,bold,green);y+=17;
    const names=wrap(resident.nome,content,16,bold);lines(names,margin,y,16,bold,ink,20);y+=names.length*20+9;
    const fields=[['Ano da residência',resident.ano],['Mês de referência',info.label],['Módulo / setor',resident.modulo],['Período da ficha','01/'+String(info.month).padStart(2,'0')+'/'+info.year+' a '+info.days+'/'+String(info.month).padStart(2,'0')+'/'+info.year]];
    for(let i=0;i<fields.length;i+=2){let rowHeight=0;fields.slice(i,i+2).forEach(([label,value],column)=>{const x=margin+column*(content+20)/2;const values=wrap(value||'Não informado',(content-20)/2);text(label.toUpperCase(),x,y,7.5,bold,muted);lines(values,x,y+13);rowHeight=Math.max(rowHeight,values.length*14+19);});y+=rowHeight;}y+=6;
    const rowHeight=Math.min(14,(height-65-y-22-152)/rows.length);
    if(rowHeight<11.5)throw new Error('A identificação é extensa demais para a ficha mensal em uma página. Revise os campos do cadastro.');
    const x=[margin,margin+88,margin+239,margin+375],colWidths=[88,151,136,content-375];
    rect(margin,y,content,22,green);['DATA','DIA DA SEMANA','MANHÃ','TARDE'].forEach((label,i)=>text(label,x[i]+(i<2?10:(colWidths[i]-bold.widthOfTextAtSize(label,8))/2),y+7,8,bold,white));y+=22;
    rows.forEach((row,i)=>{
      if(i%2===0)rect(margin,y,content,rowHeight,pale);
      text(row.data.slice(8)+'/'+row.data.slice(5,7),x[0]+10,y+(rowHeight-8.5)/2,8.5);
      text(row.dia,x[1]+10,y+(rowHeight-8.5)/2,8.5);
      [row.manha,row.tarde].forEach((status,j)=>text(status,x[j+2]+(colWidths[j+2]-bold.widthOfTextAtSize(status,9))/2,y+(rowHeight-9)/2,9,bold,status==='-'?muted:green));
      y+=rowHeight;rule(y);
    });
    y+=5;text('P = Presente · A = Falta · T = Atraso · - = Sem registro',margin,y,7.5,regular,muted);y+=10;
    text('Lançamentos de dia completo preenchem manhã e tarde.',margin,y,7.5,regular,muted);y+=14;
    rect(margin,y,content,32,pale);text('RESUMO DO MÊS',margin+10,y+5,8,bold,green);
    const count=(n,one,many)=>n+' '+(n===1?one:many);
    text('Dias com registro: '+totals.dias+'   |   Turnos: '+count(totals.P,'presença','presenças')+' · '+count(totals.A,'falta','faltas')+' · '+count(totals.T,'atraso','atrasos'),margin+10,y+18,9,bold,green);y+=42;
    text(root.EvaluationPDF.placeDate(data.emitidoEm),margin,y,10);y+=22;
    const fieldX=margin+296,fieldWidth=content-296;
    text('PRECEPTOR RESPONSÁVEL',margin,y,9,bold,green);text('ASSINATURA DIGITAL',fieldX,y,9,bold,green);
    let nameLines,emailLines,size=10;
    for(;size>=7;size-=.5){nameLines=wrap(preceptor.nome||'Nome do preceptor',276,size,bold);emailLines=wrap(preceptor.email||'E-mail do preceptor',276,size-1);if((nameLines.length+emailLines.length)*(size+1)+2<=40)break;}
    if(size<7)throw new Error('O nome ou e-mail do preceptor é extenso demais para o campo de identificação.');
    lines(nameLines,margin,y+17,size,bold,ink,size+1);lines(emailLines,margin,y+19+nameLines.length*(size+1),size-1,regular,muted,size+1);
    const fieldHeight=40,fieldY=height-y-17-fieldHeight;
    const appearance=doc.context.register(doc.context.flateStream('q 0.79 0.85 0.81 RG 0.6 w 0.3 0.3 '+(fieldWidth-.6)+' '+(fieldHeight-.6)+' re S Q',{Type:'XObject',Subtype:'Form',BBox:[0,0,fieldWidth,fieldHeight],Resources:{}}));
    const field=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Widget',FT:'Sig',T:PDFHexString.fromText('assinatura_preceptor_frequencia'),TU:PDFHexString.fromText('Assinatura digital do preceptor - frequência mensal'),Rect:[fieldX,fieldY,width-margin,fieldY+fieldHeight],P:page.ref,F:4,Ff:0,AP:{N:appearance}}));
    form.acroForm.addField(field);page.node.addAnnot(field);
    if(y+57>height-65)throw new Error('Os dados não cabem na ficha mensal de uma página.');
    rule(height-45);text('UEA · Residência Médica em Pediatria',margin,height-34,8,regular,muted);
    const footer='Frequência mensal · Página 1 de 1';text(footer,width-margin-regular.widthOfTextAtSize(footer,8),height-34,8,regular,muted);
    doc.setTitle('Ficha mensal de frequência - '+resident.nome+' - '+info.label);doc.setAuthor(options.template?'ResidPed UEA':preceptor.nome);doc.setSubject('Frequência mensal de residente em Pediatria');
    return doc.save();
  }
  root.AttendancePDF={monthInfo,prepare,create};
})(typeof window==='undefined'?globalThis:window);
