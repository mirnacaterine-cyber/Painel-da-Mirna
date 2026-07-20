# Implantação privada — GitHub + Vercel

## 1. GitHub

1. Abra o repositório existente `mirnacaterine-cyber/Painel-da-Mirna`.
2. **Antes de enviar este upgrade, altere a visibilidade para privado.**
3. Substitua a versão 1.0 pelos arquivos deste projeto na branch `main`.
4. Não envie `.env`, `data/`, `node_modules/` nem credenciais.
5. Aguarde o workflow **Validar Painel da Mirna** ficar verde.

## 2. Vercel

1. Importe o repositório privado na equipe da Mirna.
2. Mantenha a raiz do projeto na pasta principal.
3. Não é necessário definir comando de build para a interface estática.
4. Conecte um banco Neon/Postgres.
5. Conecte um Vercel Blob com acesso privado.
6. Crie uma variável `PAINEL_API_TOKEN` com uma senha longa e exclusiva.
7. Confirme que `DATABASE_URL` e a credencial do Blob foram adicionadas pelo projeto.
8. Faça um novo deploy.
9. Habilite proteção de acesso antes de usar dados pessoais.

## 3. Primeiro acesso

1. Abra a implantação protegida.
2. Clique em **⚙**.
3. Informe o mesmo token configurado em `PAINEL_API_TOKEN`.
4. Informe a cidade.
5. Cole o endereço secreto iCal do Google Agenda.
6. Salve e teste uma anotação, um evento e um arquivo pequeno.

## 4. Verificações

- `/api/health` deve responder com `database: true` e `files: true`.
- O cabeçalho deve mostrar **Nuvem pronta** após o token ser informado.
- O backup JSON nunca deve conter o token ou o endereço iCal.
- Um arquivo de teste deve aparecer na Biblioteca, baixar e excluir normalmente.

## Limites desta versão

- Upload na Vercel: até 4 MB por arquivo.
- Upload no servidor local: até 50 MB por arquivo.
- O iCal é leitura. Eventos novos são salvos no painel e abertos preenchidos no Google Agenda para confirmação.
