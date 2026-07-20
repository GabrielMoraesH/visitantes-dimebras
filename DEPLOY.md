# Deploy

Este projeto tem um backend Node.js/Express com Prisma e um frontend React/Vite.

## Pre-requisitos

- Node.js compativel com as versoes usadas nos `package-lock.json`.
- Banco PostgreSQL acessivel pelo backend.
- Variaveis de ambiente configuradas a partir de `backend/.env.example`.
- No frontend, configure `frontend/.env` a partir de `frontend/.env.example` quando a API nao estiver em `http://localhost:3001`.
- Um diretorio persistente para uploads, configurado em `UPLOAD_ROOT`.

## Backend

1. Acesse a pasta do backend:

   ```bash
   cd backend
   ```

2. Instale dependencias:

   ```bash
   npm ci
   ```

3. Configure o ambiente:

   ```bash
   cp .env.example .env
   ```

4. Ajuste `DATABASE_URL`, `JWT_SECRET`, `ADMIN_SEED_PASSWORD`, `FRONTEND_URL` e `UPLOAD_ROOT`.

5. Aplique migrations no ambiente de destino:

   ```bash
   npx prisma migrate deploy
   ```

6. Se precisar criar a filial padrao e o usuario `admin` inicial, configure `ADMIN_SEED_PASSWORD` e execute manualmente:

   ```bash
   node prisma/seed.js
   ```

   O seed nao altera a senha de um usuario `admin` ja existente.

7. Inicie a API com um gerenciador de processo, systemd, container ou servico da plataforma:

   ```bash
   NODE_ENV=production npm start
   ```

   Para producao, nao use `npm run dev`, pois esse script executa `nodemon`.
   Configure o process manager para executar `npm start` ou `node src/server.js`.

## Frontend

1. Acesse a pasta do frontend:

   ```bash
   cd frontend
   ```

2. Instale dependencias:

   ```bash
   npm ci
   ```

3. Configure `VITE_API_URL` apontando para a URL publica do backend.

4. Gere o build:

   ```bash
   npm run build
   ```

5. Publique o conteudo de `frontend/dist/` em um servidor estatico ou plataforma de hospedagem.

## Variaveis importantes

- `PORT`: porta HTTP do backend.
- `NODE_ENV`: use `production` em producao.
- `FRONTEND_URL`: origem publica permitida no CORS em producao.
- `DATABASE_URL`: conexao PostgreSQL usada pelo Prisma.
- `JWT_SECRET`: segredo longo e aleatorio para assinar tokens.
- `ADMIN_SEED_PASSWORD`: senha inicial usada apenas pelo seed para criar o usuario `admin` quando ele ainda nao existe.
- `UPLOAD_ROOT`: raiz persistente para arquivos enviados. O Conteudo TV salva os arquivos em `UPLOAD_ROOT/tv` e publica somente essa pasta em `/uploads/tv`.
- `LABEL_TOKEN_TTL_SECONDS`: validade dos tokens temporarios de etiqueta.
- `VITE_API_URL`: URL base da API consumida pelo frontend.

## Storage de uploads

Cada ambiente deve usar seu proprio storage persistente. Os arquivos de TV nao dependem da pasta do projeto quando `UPLOAD_ROOT` esta definido.

Local:

```env
UPLOAD_ROOT=C:\visitantes-local-storage
```

Arquivos de TV locais serao salvos em:

```text
C:\visitantes-local-storage\tv
```

Producao:

```env
UPLOAD_ROOT=D:\VisitantesStorage
```

Arquivos de TV de producao serao salvos em:

```text
D:\VisitantesStorage\tv
```

A URL publica permanece no formato:

```text
/uploads/tv/nome-do-arquivo.mp4
```

Nao copie videos ou imagens de teste do localhost para producao. Se `UPLOAD_ROOT` nao for definido, o backend usa o fallback local `backend/uploads/tv`, que tambem deve permanecer fora do Git.

## Cuidados antes de publicar

- Nunca versionar `.env`, uploads reais, builds, dumps de banco ou arquivos compactados.
- Confirmar que `backend/prisma/migrations/` esta versionado.
- Rodar `git status` antes do commit e revisar todos os arquivos alterados.
- Se algum segredo ja tiver sido versionado antes, remover do historico com ferramenta apropriada e rotacionar o segredo.
