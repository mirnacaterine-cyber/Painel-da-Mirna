# Guia de uso — Painel da Mirna 🌷

## Abrir no computador

1. Abra um terminal na pasta do projeto.
2. Rode `npm install` na primeira vez.
3. Rode `node server.js`.
4. Deixe o terminal aberto.
5. Acesse `http://127.0.0.1:4242` no navegador.

## Conectar o Google Agenda

1. No painel, clique em **⚙**.
2. No Google Agenda pelo computador, abra **Configurações**.
3. Clique na agenda desejada na coluna esquerda.
4. Abra **Integrar agenda**.
5. Copie **Endereço secreto em formato iCal**.
6. Cole no painel e salve.

O endereço iCal é uma credencial privada de leitura. Não coloque esse link no GitHub, em mensagens públicas ou em capturas de tela.

## Adicionar um compromisso

1. Clique em **+ Novo evento**.
2. Informe título, data, horário, área, local e observações.
3. Deixe marcada a opção de abrir o Google Agenda quando quiser confirmar o evento também lá.
4. Clique em **Salvar evento**.

O painel guarda o evento imediatamente. O Google Agenda abre preenchido para a confirmação final, porque o link iCal usado para leitura não permite criar eventos diretamente.

## Guardar um arquivo

1. Vá até **Arquivos**.
2. Escolha ou arraste o arquivo.
3. Selecione o destino, como **01 — Ballet, GR & Aulas** ou **02 — Faculdade**.
4. Acrescente uma observação quando ajudar.
5. Clique em **Salvar arquivo**.

Sem nuvem, o arquivo fica no navegador ou no servidor local. Com Neon + Vercel Blob configurados, arquivos pequenos podem ser guardados no armazenamento privado da nuvem.

## Ouvir o briefing

1. Confirme a cidade em **⚙**.
2. Clique em **Ouvir meu dia**.
3. Ative **Falar o briefing na primeira interação do dia** para ouvir automaticamente uma vez por dia.

O briefing traz clima, agenda, Entrada, Ballet, GR, faculdade e uma frase de foco escolhida para a rotina da Mirna.

## Cópia de segurança

Use **Exportar dados** periodicamente. O JSON inclui a organização do painel, mas exclui link iCal, token e arquivos binários por segurança.
