# Estado do projeto — Painel da Mirna 2.0

## Concluído no código

- Interface responsiva e personalizada para a Mirna.
- IndexedDB local-first.
- SQLite local e armazenamento de arquivos por destino.
- Camada opcional Neon/Postgres + Vercel Private Blob.
- Agenda iCal com recorrências, exceções, fuso e eventos locais.
- Criação de eventos com abertura preenchida no Google Agenda.
- Radar de Ballet, Dança, Ginástica Rítmica, Direito, Dança e UNIOESTE.
- Clima e briefing diário falado em português.
- Backup sem segredos.
- Auditoria de credenciais.
- 10 testes automatizados e teste visual desktop/celular.
- Workflow de validação no GitHub.

## Estado das contas conectadas em 20/07/2026

- O repositório `mirnacaterine-cyber/Painel-da-Mirna` já existe.
- A versão que está no GitHub ainda é a 1.0, não este upgrade 2.0.
- O repositório aparece como **público**. Como o painel contém atalhos e informações pessoais, ele deve ser alterado para **privado** antes do envio da versão 2.0.
- Há uma implantação de produção na Vercel com proteção de acesso, também baseada na versão anterior.

## Próximos passos externos

1. Tornar o repositório privado.
2. Substituir o conteúdo atual pelos arquivos deste pacote ou usar o bundle Git.
3. Confirmar que o workflow do GitHub ficou verde.
4. Conectar Neon/Postgres e Vercel Blob privado.
5. Definir `PAINEL_API_TOKEN`.
6. Fazer o redeploy e validar `/api/health`.

Nenhuma credencial real foi incluída no upgrade 2.0.
