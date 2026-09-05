# Aplicativos de Avaliação em Pediatria – UEA

Publicação dos aplicativos de frequência e avaliação:

- `residentes/`: ResidPed UEA
- `internos/`: InternoPed UEA
- `portal-residente/`: Portal individual do residente
- `portal-preceptor/`: Portal do preceptor

Os aplicativos são páginas estáticas instaláveis no celular e armazenam os dados localmente no navegador, com sincronização opcional via Google Apps Script.

Os dois portais também podem ser instalados: abra o respectivo endereço no navegador do celular e escolha **Adicionar à tela inicial** (ou **Instalar aplicativo**). O acesso e os envios continuam exigindo conexão com a internet e login Google.

No aplicativo administrativo `residentes/`, a aba **Supervisão** reúne as avaliações salvas na planilha central, inclusive antes da emissão do PDF. O acesso usa a conta Google já autorizada em `ADMIN_EMAILS`, compartilhando o login da consulta de autoavaliações. A consulta oferece filtros por residente, ano, preceptor, módulo, período e datas, além de notas por critério, nota final e comentários. Os resultados são exibidos em grupos de 20, com **Mostrar mais avaliações**. A área também pode ser aberta pelo Dashboard ou por `residentes/#supervisao`.

**Visualizar PDF** e **Baixar PDF** entregam os mesmos bytes da cópia emitida pelo preceptor e disponibilizada ao residente. Avaliações sem ficha continuam visíveis e informam que o PDF ainda não foi emitido. Registros antigos sem autoria ou notas por critério não recebem dados estimados. O histórico local do aplicativo permanece identificado como registros deste aparelho.

A supervisão consulta a rota autenticada `avaliacoes_admin`, que verifica `ADMIN_EMAILS` a cada listagem e download. O serviço deve incluir `07_ANALISE_E_CODIGO/Supervisao.gs`, além de `Code.gs` e `Fichas.gs`; o diagnóstico informa versão 3.2 e `recursos.avaliacoesSupervisao: true`. No frontend, publique `residentes/admin-evaluations.js`, `admin-evaluations.css`, `index.html` e `sw.js`. Os registros consultados e o token permanecem somente em memória e são removidos ao sair da supervisão.

No portal do preceptor, a aba **Avaliar residente** inclui **Exportar avaliações salvas**, com filtros por residente e avaliação. Os mesmos filtros se aplicam ao CSV compatível com Excel e ao PDF. Cada avaliação ocupa uma única página A4 com identificação do residente, nove critérios, notas dos domínios, nota final registrada e comentário breve, quando preenchido (até 300 caracteres). Ao final de cada ficha há um campo vazio de assinatura digital do preceptor, do tipo PDF `/Sig`, para assinar posteriormente em um leitor compatível. A exportação não aplica uma assinatura. Ao selecionar várias avaliações, o arquivo reúne uma página por ficha. Notas individuais ausentes são indicadas por `-`, sem serem estimadas a partir da média. Registros antigos com comentários acima do limite precisam de uma versão breve para o PDF; o CSV mantém o texto completo. O gerador informa quando algum texto não cabe na página, sem cortar conteúdo ou criar páginas de continuação.

O PDF inclui automaticamente o nome e o e-mail do preceptor autenticado, ao lado do campo de assinatura. Essa identificação não preenche nem assina o campo digital.

Ao emitir o PDF, o portal disponibiliza uma cópia privada na aba **Minhas avaliações** do residente, com visualização e download. Mesmo em uma exportação em lote, cada residente recebe somente sua ficha individual. O servidor verifica a autoria da avaliação e usa o código do residente registrado nela para determinar o destinatário. Cópias sem vínculo válido não são publicadas; se houver falha, o download local continua disponível e o portal informa a pendência. As avaliações emitidas antes desta função precisam ser exportadas novamente para disponibilizar a cópia.

O PDF é gerado no navegador com a biblioteca local `portal-preceptor/vendor/pdf-lib.min.js` (1.17.1, licença MIT incluída). A logo vetorial verde em `portal-preceptor/assets/uea-logo-verde.pdf` foi extraída da segunda página do arquivo `uea_logo_horizontal_todas_as_cores.pdf` fornecido pela coordenação. Publique também as pastas `assets/` e `vendor/`, os arquivos `evaluation-pdf.js`, `evaluation-exports.js`, `portal-residente/evaluation-records.js` e os dois `sw.js` atualizados.

O serviço Google Apps Script deve conter a versão atualizada de `07_ANALISE_E_CODIGO/Code.gs` e as funções de `07_ANALISE_E_CODIGO/Fichas.gs`, com as rotas autenticadas `publicar_ficha_preceptor` e `fichas_residente`. Publique uma nova versão na implantação existente antes de atualizar os portais. As cópias ficam em uma pasta privada do Drive, identificada pela propriedade `FICHAS_AVALIACAO_FOLDER_ID`, e na aba de controle **Fichas de avaliação**. O portal entrega os bytes somente ao residente vinculado, após conferir a integridade do arquivo; não são criados links públicos de compartilhamento.

Antes da assinatura, a ficha apresenta o local **Manaus** e a data da avaliação por extenso, por exemplo **Manaus, 04 de setembro de 2026**. A data acompanha o registro exportado; não é substituída pela data do download.

O teste `node tests/evaluation-export.cjs` requer Node.js e Playwright. É possível indicar um navegador instalado em `BROWSER_EXECUTABLE` e uma pasta de resultados em `EVALUATION_TEST_OUTPUT`. O teste usa dados fictícios e simula a API, sem enviar avaliações reais; cobre os filtros, os downloads de PDF e CSV, falhas recuperáveis, comentários de até 300 caracteres, uma página por ficha, campos vazios de assinatura digital, identificação do preceptor, cópias individuais em lote, igualdade entre a cópia emitida e a recebida, visualização no portal do residente, atualização após salvar e as telas de celular.

O teste `node tests/admin-evaluations.cjs` usa os mesmos requisitos e uma API simulada. Cobre login da coordenação, filtros combinados, paginação, notas zero e ausentes, conteúdo escapado, PDF idêntico, layout no celular, falhas, acesso negado e limpeza da sessão mesmo com uma consulta pendente. Os testes de autorização e integridade do serviço ficam em `07_ANALISE_E_CODIGO/tests/fichas.cjs`, executados a partir da raiz do projeto.
