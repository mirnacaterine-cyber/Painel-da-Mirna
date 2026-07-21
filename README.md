# Painel da Mirna 🌷

Painel pessoal, responsivo e sem dependências externas para reunir rotina, estudos, ballet e planos em um só lugar.

## O que já está pronto

- 10 atalhos para as áreas do Google Drive;
- revisão diária com reinício automático a cada novo dia;
- revisão semanal com reinício automático às segundas-feiras;
- Entrada rápida para tarefas, ideias e lembretes;
- salvamento local no navegador;
- exportação e importação de cópia de segurança em JSON;
- tema claro/escuro;
- funcionamento offline após a primeira visita em HTTPS;
- cabeçalhos de privacidade e bloqueio de indexação para Vercel.

## Abrir localmente

```bash
npm run dev
```

Depois abra `http://localhost:4173`.

## Publicar com GitHub + Vercel

1. Crie um repositório **privado** chamado `painel-da-mirna` no GitHub.
2. Dentro desta pasta, execute:

```bash
git init
git add .
git commit -m "feat: primeira versão do Painel da Mirna"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

3. Na Vercel, importe o repositório.
4. Mantenha o Framework Preset como **Other**; não há comando de build nem diretório de saída.
5. Antes de compartilhar o endereço, habilite proteção de acesso no projeto. O `vercel.json` já impede indexação por buscadores, mas não substitui autenticação.

## Privacidade

Os atalhos do Drive estão no arquivo `app-config.js`. Eles não concedem acesso sozinhos: o Google Drive continua exigindo as permissões da conta. Mesmo assim, este painel foi pensado para repositório privado e implantação protegida.

Checklists e anotações ficam no `localStorage` do navegador. Use **Exportar dados** periodicamente para manter uma cópia de segurança.

## Estrutura

- `index.html`: interface do painel;
- `styles.css`: identidade visual e responsividade;
- `app-config.js`: textos, listas e links das áreas;
- `app.js`: comportamento, checklists, Entrada e backup;
- `sw.js`: cache offline;
- `vercel.json`: cabeçalhos de segurança e privacidade.
