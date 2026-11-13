# Perfil VIP Exclusivo — Edição Vercel Serverless

## Estrutura do Projeto (Pronta para Vercel)
- `vercel.json`: Configura as rotas `/admin`, `/api/*` e `/uploads/*` na Vercel.
- `api/index.js`: Backend Express Serverless stateless (sem perda de sessão).
- `views/admin.html`: Painel privado protegido por senha (fora da pasta `public/`).
- `public/index.html`: Página pública luxuosa servida na CDN da Vercel.
- `payments.js`: Integração pronta com a API PIX da Crownbot (`CROWNBOT_CHAVE`).
- `store.js`: Persistência gratuita na branch `data` do GitHub.

## Como publicar na Vercel
1. Suba todos estes arquivos na raiz da branch `main` do seu repositório `emilylinda322/meu-perfil-vip` (garanta que a branch `data` exista).
2. Na Vercel (`vercel.com`), clique em **Add New... -> Project** e importe o repositório `meu-perfil-vip`.
3. Na tela de configuração, abra **Environment Variables** e adicione:
   - `ADMIN_PASSWORD` = sua senha exclusiva do `/admin`
   - `TOKEN_SECRET` = uma frase longa e aleatória
   - `CROWNBOT_CHAVE` = sua chave da Crownbot (`cbk_...`)
   - `GITHUB_TOKEN` = seu token do GitHub com permissão `Contents: Read and write`
   - `GITHUB_REPO` = `emilylinda322/meu-perfil-vip`
   - `GITHUB_BRANCH` = `data`
4. Clique em **Deploy**.
