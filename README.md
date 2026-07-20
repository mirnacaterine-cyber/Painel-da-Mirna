# Painel da Mirna 🌷

Um painel pessoal, local-first e responsivo para reunir a rotina real da Mirna: agenda, arquivos, Ballet, Ginástica Rítmica, aulas, Direito, Dança, saúde, família e planos de longo prazo.

Esta versão não é um “Jarvis” genérico. Ela foi construída em torno das áreas, dos compromissos e das prioridades da Mirna, com um briefing diário falado e uma interface calma para não transformar organização em mais uma cobrança.

## O que está pronto

### Banco de dados e continuidade

- **IndexedDB no navegador**: funciona mesmo sem servidor e mantém checklists, Entrada, eventos, preferências, caches e arquivos locais.
- **SQLite local**: ao iniciar com `node server.js`, o painel sincroniza o estado e pode guardar arquivos no computador.
- **Nuvem opcional**: preparado para **Neon/Postgres** e **Vercel Private Blob**, protegido por um token pessoal.
- Exportação e restauração de backup em JSON, sem incluir link iCal, token ou arquivos binários.

### Arquivos com destino

O upload exige escolher uma área antes de salvar:

- 00 — Painel & Entrada;
- 01 — Ballet, GR & Aulas;
- 02 — Faculdade;
- 03 — Trabalho & Financeiro;
- 04 — Documentos Pessoais;
- 05 — Casinha compartilhada;
- 06 — Viagens & Festivais;
- 07 — Família & Memórias;
- 08 — Livros, Cursos & Referências;
- 99 — Arquivo Histórico.

A biblioteca permite filtrar, baixar e excluir arquivos. Sem servidor, eles ficam no navegador. Com o servidor local, ficam em `data/uploads`. Na Vercel, ficam em um Blob privado.

### Agenda integrada

- Lê o **Endereço secreto em formato iCal** do Google Agenda.
- Mescla eventos do Google com eventos criados no próprio painel.
- Mostra hoje e os próximos sete dias, agrupados por data.
- Exibe o próximo compromisso e a contagem regressiva.
- Entende eventos com fuso, UTC, dia inteiro, recorrências básicas e exceções.
- Ao criar um evento, salva primeiro no painel e pode abrir o Google Agenda já preenchido para confirmação.

O iCal é somente leitura. O painel não promete escrever diretamente no Google usando uma credencial que não permite isso.

### Radar de notícias

O radar usa Google News RSS e mantém apenas temas alinhados à vida da Mirna:

- Ballet & Dança;
- Ginástica Rítmica;
- Faculdade, Direito, Dança e UNIOESTE.

As manchetes são filtradas novamente no navegador para reduzir notícias genéricas ou sem relação real com os temas.

### Briefing diário falado

O botão **Ouvir meu dia** reúne, em português:

- dia da semana e data;
- previsão atual, máxima, mínima e chance de chuva;
- compromissos de hoje;
- itens pendentes na Entrada;
- principais manchetes do radar;
- uma frase de foco ligada a corpo, aulas, estudos, descanso e ao sonho da escola de ballet.

A leitura usa a voz do próprio navegador. Também existe a opção de falar automaticamente após a primeira interação do dia.

## Uso local

Requisitos: **Node.js 22 ou superior**.

```bash
npm install
npm run dev
```

Abra:

```text
http://127.0.0.1:4242
```

Deixe o terminal aberto enquanto usar a versão com SQLite, arquivos, agenda e notícias. Sem o terminal, a interface ainda preserva os dados no IndexedDB, mas as integrações externas não atualizam.

## Configuração da agenda

No painel, abra **⚙ Configurações** e informe um nome e o link iCal.

Caminho no Google Agenda pelo computador:

1. Abra **Configurações**.
2. Selecione a agenda na coluna esquerda.
3. Abra **Integrar agenda**.
4. Copie **Endereço secreto em formato iCal**.
5. Cole no painel e salve.

Esse endereço funciona como uma senha de leitura. Ele fica salvo somente no banco local do navegador e é removido de backups e da sincronização do estado. Para buscar os eventos, ele passa temporariamente pela antena local ou pela função do próprio projeto, sem ser enviado a uma IA.

## Publicação privada na Vercel

A versão em nuvem usa três peças:

1. o site e as funções em `/api` na Vercel;
2. um banco Neon/Postgres para o estado;
3. um Vercel Blob privado para arquivos.

### Variáveis necessárias

Crie no projeto da Vercel:

```text
DATABASE_URL=postgresql://...
PAINEL_API_TOKEN=troque-por-uma-senha-longa-e-unica
```

Ao conectar o Vercel Blob, a própria Vercel disponibiliza a credencial de armazenamento. O painel não precisa exibi-la no navegador.

Depois, no **⚙** do painel publicado, informe o mesmo valor de `PAINEL_API_TOKEN`. O token fica no IndexedDB daquele navegador e é enviado apenas às rotas privadas do próprio projeto.

### Passos de implantação

1. Use o repositório existente `Painel-da-Mirna` e altere a visibilidade para **privado**.
2. Envie os arquivos deste projeto, sem `.env`, `data/` nem `node_modules/`.
3. Confirme ou atualize a importação do repositório na Vercel.
4. Conecte um banco Neon/Postgres e um Blob com acesso privado.
5. Defina `PAINEL_API_TOKEN` nas variáveis de ambiente.
6. Faça um novo deploy.
7. Ative proteção de acesso no projeto antes de colocar informações pessoais na nuvem.

O esquema SQL também está disponível em `database/schema.sql`; as funções criam as tabelas automaticamente quando o banco é usado pela primeira vez.

## Privacidade e limites

- Nenhuma credencial privada está embutida no código.
- O link iCal e o token são excluídos do backup e do estado enviado ao banco remoto.
- Arquivos locais e o banco SQLite ficam em `data/`, que está ignorado pelo Git.
- A versão publicada exige o token nas rotas de estado e arquivos.
- Notícias e clima usam serviços externos; nenhuma dessas informações é enviada a uma IA.
- A versão em nuvem aceita arquivos de até **4 MB** por upload nesta implementação. O servidor local aceita até **50 MB**.
- Este projeto é pessoal. Mantenha o repositório privado e a implantação protegida.

Documentos complementares: [guia de uso](GUIA-DE-USO.md), [implantação privada](DEPLOY.md) e [estado do projeto](PROJECT_STATUS.md).

## Estrutura principal

```text
index.html                 interface
styles.css                 identidade visual e responsividade
app-config.js              áreas, textos, metas e radar da Mirna
app.js                     comportamento da interface
db.js                      IndexedDB local
calendar.js                parser iCal e integração com Google Agenda
server.js                  servidor local em 127.0.0.1:4242
server/local-store.js      SQLite e arquivos locais
server/cloud-store.js      Neon/Postgres e Vercel Private Blob
server/feed-utils.js       agenda e Google News RSS
api/                       funções para implantação na Vercel
database/schema.sql        esquema do banco em nuvem
tests/                     testes automatizados
scripts/                   auditoria e teste visual
```

## Validação

```bash
npm run validate
```

Esse comando verifica a estrutura e possíveis segredos e executa os testes de agenda, feeds e SQLite.

O teste visual completo é opcional e exige Chromium instalado:

```bash
npm run test:browser
```

Em outro caminho de instalação, informe o executável com `CHROMIUM=/caminho/do/chromium npm run test:browser`. As capturas são gravadas em `.artifacts/` por padrão.
