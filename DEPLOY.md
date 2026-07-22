# Deploy

Este projeto tem um backend Node.js/Express com Prisma e um frontend React/Vite.

## Pre-requisitos

- Node.js compatível com as versoes usadas nos `package-lock.json`.
- Banco PostgreSQL acessível pelo backend.
- Variáveis de ambiente configuradas a partir de `backend/.env.example`.
- No frontend, configure `frontend/.env` a partir de `frontend/.env.example` quando a API não estiver em `http://localhost:3001`.
- Um diretório persistente para uploads, configurado em `UPLOAD_ROOT`.

## Backend

1. Acesse a pasta do backend:

   ```bash
   cd backend
   ```

2. Instale dependências:

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

6. Se precisar criar a filial padrão e o usuário `admin` inicial, configure `ADMIN_SEED_PASSWORD` e execute manualmente:

   ```bash
   node prisma/seed.js
   ```

   O seed não altera a senha de um usuário `admin` já existente.

7. Inicie a API com um gerenciador de processo, systemd, container ou servico da plataforma:

   ```bash
   NODE_ENV=production npm start
   ```

   Para produção, não use `npm run dev`, pois esse script executa `nodemon`.
   Configure o process manager para executar `npm start` ou `node src/server.js`.

## Frontend

1. Acesse a pasta do frontend:

   ```bash
   cd frontend
   ```

2. Instale dependências:

   ```bash
   npm ci
   ```

3. Configure `VITE_API_URL` apontando para a URL pública do backend.

4. Gere o build:

   ```bash
   npm run build
   ```

5. Publique o conteúdo de `frontend/dist/` em um servidor estático ou plataforma de hospedagem.

## Variáveis importantes

- `PORT`: porta HTTP do backend.
- `NODE_ENV`: use `production` em produção.
- `FRONTEND_URL`: origem pública permitida no CORS em produção.
- `DATABASE_URL`: conexão PostgreSQL usada pelo Prisma.
- `JWT_SECRET`: segredo longo e aleatório para assinar tokens.
- `ADMIN_SEED_PASSWORD`: senha inicial usada apenas pelo seed para criar o usuário `admin` quando ele ainda não existe.
- `UPLOAD_ROOT`: raiz persistente para arquivos enviados. O Conteúdo TV salva os arquivos em `UPLOAD_ROOT/tv` e publica somente essa pasta em `/uploads/tv`.
- `LABEL_TOKEN_TTL_SECONDS`: validade dos tokens temporarios de etiqueta.
- `VITE_API_URL`: URL base da API consumida pelo frontend.

## Storage de uploads

Cada ambiente deve usar seu próprio storage persistente. Os arquivos de TV não dependem da pasta do projeto quando `UPLOAD_ROOT` está definido.

Local:

```env
UPLOAD_ROOT=C:\visitantes-local-storage
```

Arquivos de TV locais serao salvos em:

```text
C:\visitantes-local-storage\tv
```

Produção:

```env
UPLOAD_ROOT=D:\VisitantesStorage
```

Arquivos de TV de produção serao salvos em:

```text
D:\VisitantesStorage\tv
```

## Observabilidade

- Toda resposta do backend inclui `X-Request-Id`. Se o cliente enviar um UUID válido em `X-Request-Id`, ele será preservado; valores inválidos são substituídos.
- Logs do backend são emitidos em uma linha JSON por evento, via stdout/stderr, com `timestamp`, `level`, `event` e `requestId` quando a requisição passa pelo middleware.
- `GET /health` permanece como liveness simples e público.
- `GET /health/ready` verifica banco e storage de TV, retorna `200` quando pronto e `503` quando banco ou storage estiver indisponível. A resposta não expõe host, usuário, URL de banco ou caminhos absolutos.

A URL pública permanece no formato:

```text
/uploads/tv/nome-do-arquivo.mp4
```

Não copie vídeos ou imagens de teste do localhost para produção. Se `UPLOAD_ROOT` não for definido, o backend usa o fallback local `backend/uploads/tv`, que também deve permanecer fora do Git.

## Cuidados antes de publicar

- Nunca versionar `.env`, uploads reais, builds, dumps de banco ou arquivos compactados.
- Confirmar que `backend/prisma/migrations/` está versionado.
- Rodar `git status` antes do commit e revisar todos os arquivos alterados.
- Se algum segredo já tiver sido versionado antes, remover do histórico com ferramenta apropriada e rotacionar o segredo.
