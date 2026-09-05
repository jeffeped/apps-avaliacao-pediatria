# Aplicativos de Avaliação em Pediatria – UEA

Publicação dos aplicativos de frequência e avaliação:

- `residentes/`: ResidPed UEA
- `internos/`: InternoPed UEA
- `portal-residente/`: Portal individual do residente
- `portal-preceptor/`: Portal do preceptor

Os aplicativos são páginas estáticas instaláveis no celular e armazenam os dados localmente no navegador, com sincronização opcional via Google Apps Script.

Os dois portais também podem ser instalados: abra o respectivo endereço no navegador do celular e escolha **Adicionar à tela inicial** (ou **Instalar aplicativo**). O acesso e os envios continuam exigindo conexão com a internet e login Google.

No portal do preceptor, a aba **Avaliar residente** inclui **Exportar avaliações salvas**, com filtros por residente e avaliação. Os mesmos filtros se aplicam ao CSV compatível com Excel e ao PDF. Cada avaliação ocupa uma única página A4 com identificação do residente, nove critérios, notas dos domínios, nota final registrada e comentário breve, quando preenchido (até 300 caracteres). Ao final de cada ficha há um campo vazio de assinatura digital do preceptor, do tipo PDF `/Sig`, para assinar posteriormente em um leitor compatível. A exportação não aplica uma assinatura. Ao selecionar várias avaliações, o arquivo reúne uma página por ficha. Notas individuais ausentes são indicadas por `-`, sem serem estimadas a partir da média. Registros antigos com comentários acima do limite precisam de uma versão breve para o PDF; o CSV mantém o texto completo. O gerador informa quando algum texto não cabe na página, sem cortar conteúdo ou criar páginas de continuação.

O PDF é gerado no navegador com a biblioteca local `portal-preceptor/vendor/pdf-lib.min.js` (1.17.1, licença MIT incluída). A logo vetorial verde em `portal-preceptor/assets/uea-logo-verde.pdf` foi extraída da segunda página do arquivo `uea_logo_horizontal_todas_as_cores.pdf` fornecido pela coordenação. Publique também as pastas `assets/` e `vendor/`, os arquivos `evaluation-pdf.js` e `evaluation-exports.js` e a versão atualizada de `sw.js`. Esta funcionalidade usa a rota autenticada `exportacoes_preceptor` já existente e não exige alteração no Google Apps Script.

Antes da assinatura, a ficha apresenta o local **Manaus** e a data da avaliação por extenso, por exemplo **Manaus, 04 de setembro de 2026**. A data acompanha o registro exportado; não é substituída pela data do download.

O teste `node tests/evaluation-export.cjs` requer Node.js e Playwright. É possível indicar um navegador instalado em `BROWSER_EXECUTABLE` e uma pasta de resultados em `EVALUATION_TEST_OUTPUT`. O teste usa dados fictícios e simula a API, sem enviar avaliações reais; cobre os filtros, os downloads de PDF e CSV, falhas recuperáveis, comentários de até 300 caracteres, uma página por ficha, campos vazios de assinatura digital, atualização após salvar e a tela de celular.
