# Checklist Operacional de Produção

Este documento descreve um procedimento futuro para publicar o Visitantes Dimebras com menor risco operacional. Ele foi produzido somente a partir dos arquivos versionados do repositório e deve ser revisado antes de qualquer deploy real.

Não execute este checklist diretamente sem validar os itens marcados como `A CONFIRMAR`.

## 1. Estado Atual da Documentação

### Instrucoes existentes

- [ ] `DEPLOY.md`: contém fluxo básico de backend, frontend, variáveis e storage.
- [ ] `PRODUCAO.md`: contém comandos curtos de deploy com PM2 e health check.
- [ ] `README.md` na raiz: `A CONFIRMAR` porque não existe no repositório atual.
- [ ] `frontend/README.md`: template padrão do Vite, não documenta produção.
- [ ] `.github/workflows/ci.yml`: automatiza backend e frontend com Node.js 22, PostgreSQL 16, Prisma, testes, lint e build.

### Itens corretos já documentados

- [ ] Backend usa Node.js/Express com Prisma e PostgreSQL.
- [ ] Frontend usa React/Vite e gera build em `frontend/dist`.
- [ ] Backend aplica migrations com `npx prisma migrate deploy`.
- [ ] Frontend deve definir `VITE_API_URL` antes do build.
- [ ] Uploads de TV usam `UPLOAD_ROOT/tv` quando `UPLOAD_ROOT` está definido.
- [ ] Arquivos reais, dumps, builds e `.env` não devem ser versionados.
- [ ] `PRODUCAO.md` indica PM2 para `visitantes-backend` e `visitantes-frontend`.

### Itens incompletos ou inadequados para produção

- [ ] `DEPLOY.md` não detalha backup, validação de backup, restore, smoke tests, rollback ou evidências.
- [ ] `PRODUCAO.md` não registra commit anterior, commit alvo, backup, checksum, status de migrations ou rollback.
- [ ] Reverse proxy, HTTPS, diretório público do frontend e configuração do processo PM2 estão `A CONFIRMAR`.
- [ ] Não há arquivo `ecosystem.config`, Nginx, Apache, systemd ou Docker versionado.
- [ ] `PRODUCAO.md` usa caminhos e porta local que devem ser substituídos por placeholders em procedimentos revisados.
- [ ] `DEPLOY.md` continha uma instrucao perigosa para produção com `NODE_ENV=production npm run dev`; a instrucao foi corrigida para `npm start`, pois `npm run dev` executa `nodemon`.

### Pre-requisitos ainda não documentados

- [ ] Janela de manutencao.
- [ ] Responsável por deploy e rollback.
- [ ] Politica de retencao de backup.
- [ ] Local seguro para backups fora do repositório.
- [ ] Validação de espaço em disco para banco, logs, uploads e backups.
- [ ] Procedimento de rollback de frontend e backend.
- [ ] Procedimento de restauração total.
- [ ] Evidências obrigatórias do deploy.

## 2. Arquitetura de Produção Conhecida

- [ ] Backend: Node.js/Express, entrada em `backend/src/server.js`.
- [ ] Comando real disponível para iniciar backend: `npm start`, que executa `node src/server.js`.
- [ ] Process manager documentado: PM2 em `PRODUCAO.md`, com processo `visitantes-backend`; configuração detalhada `A CONFIRMAR`.
- [ ] Porta do backend: `PORT`; fallback do código e `.env.example` apontam para `3001`. `PRODUCAO.md` verifica `/health` em porta diferente; porta real de produção `A CONFIRMAR`.
- [ ] Reverse proxy: `A CONFIRMAR`.
- [ ] HTTPS/certificado: `A CONFIRMAR`.
- [ ] Frontend estático: build em `frontend/dist`; diretório público real `A CONFIRMAR`.
- [ ] Processo frontend em PM2: `visitantes-frontend` em `PRODUCAO.md`; finalidade exata `A CONFIRMAR`.
- [ ] Banco: PostgreSQL, acessado pelo Prisma via `DATABASE_URL`.
- [ ] Migrations: `backend/prisma/migrations`, aplicadas por `npx prisma migrate deploy`.
- [ ] Health check liveness: `GET /health`.
- [ ] Health check readiness: `GET /health/ready`.
- [ ] CORS: em produção, backend exige `FRONTEND_URL`.
- [ ] Uploads de TV: filesystem em `UPLOAD_ROOT/tv`, exposto pelo backend em `/uploads/tv`.
- [ ] Temporarios de TV: `UPLOAD_ROOT/tmp/tv`.
- [ ] Fotos e documentos de visitantes: armazenados no PostgreSQL em campos `Bytes`.
- [ ] Limite de arquivos de visitante: 3 arquivos, até 8 MB cada.
- [ ] Limite de conteúdo de TV: 1 arquivo, até 200 MB.

## 3. Variáveis de Ambiente

Não versionar `.env` e não registrar valores reais em evidências.

| Variavel | Finalidade | Obrigatoriedade | Exemplo seguro | Validação antes do deploy | Risco se incorreta |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL usada pelo Prisma | Obrigatória | `postgresql://<USUARIO_BANCO>:<SEGREDO>@<HOST_BANCO>:<PORTA_BANCO>/<NOME_BANCO>?schema=public` | Confirmar host, porta, banco e usuário sem exibir valor completo | Backend não inicia, migrations falham ou apontam para banco errado |
| `JWT_SECRET` | Assinatura de tokens JWT | Obrigatória | `<SEGREDO_JWT_FORTE>` | Confirmar existência e rotação controlada sem imprimir valor | Login e etiquetas falham; tokens podem ficar inseguros |
| `PORT` | Porta HTTP do backend | Obrigatória para produção controlada | `<PORTA_BACKEND>` | Confirmar que proxy e PM2 usam a mesma porta | Health check falha ou proxy aponta para porta errada |
| `NODE_ENV` | Modo de execução do backend | Obrigatória | `production` | Confirmar valor `production` | CORS e comportamento de runtime podem ficar inadequados |
| `FRONTEND_URL` | Origem pública permitida no CORS | Obrigatória em produção | `https://<DOMINIO_FRONTEND>` | Confirmar origem exata, sem barra final obrigatória | Frontend pode sofrer bloqueio de CORS ou liberar origem errada |
| `UPLOAD_ROOT` | Raiz persistente para arquivos de TV | Obrigatória para produção | `<CAMINHO_UPLOAD_ROOT>` | Confirmar existência, persistência e permissões | Arquivos de TV podem sumir ou ficar inacessíveis |
| `LABEL_TOKEN_TTL_SECONDS` | Validade dos tokens temporarios de etiqueta | Opcional, recomendado definir | `28800` | Confirmar valor inteiro positivo coerente | Etiquetas podem expirar cedo ou tarde demais |
| `ADMIN_SEED_PASSWORD` | Senha inicial usada somente pelo seed | Opcional, apenas se seed for executado | `<SEGREDO_ADMIN_INICIAL>` | Confirmar somente quando houver criacao inicial controlada | Seed pode falhar ou criar credencial fraca |
| `VITE_API_URL` | URL base da API embutida no build do frontend | Obrigatória antes do build | `https://<DOMINIO_API>` | Conferir no ambiente de build antes de `npm run build` | Frontend aponta para API errada |

## 4. Pre-requisitos Antes do Deploy

### Obrigatorio

- [ ] CI verde no commit alvo.
- [ ] Working tree limpa no ambiente de preparação.
- [ ] Branch de produção confirmada: `<BRANCH_PRODUCAO>`.
- [ ] Commit alvo registrado: `<COMMIT_ALVO>`.
- [ ] Commit anterior registrado: `<COMMIT_ANTERIOR>`.
- [ ] Backup preparado em `<CAMINHO_BACKUP>` fora do repositório.
- [ ] Acesso ao banco confirmado por canal seguro.
- [ ] Acesso ao servidor confirmado por canal seguro.
- [ ] Node.js compatível com a CI: Node.js 22 ou versao validada.
- [ ] PostgreSQL compatível com a CI: PostgreSQL 16 ou versao validada.
- [ ] `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `FRONTEND_URL`, `UPLOAD_ROOT` e `VITE_API_URL` confirmadas sem exibir valores reais.
- [ ] CORS alinhado entre `FRONTEND_URL` e origem pública real.
- [ ] Permissoes de leitura/escrita no diretório `UPLOAD_ROOT`.
- [ ] Responsavel pelo rollback definido.

### Recomendado

- [ ] Janela de manutencao comunicada.
- [ ] Espaço em disco validado para banco, backups, uploads, logs e build.
- [ ] Checksum do backup planejado.
- [ ] Plano para copia externa segura do backup.
- [ ] Lista de smoke tests impressa ou registrada em ticket operacional.
- [ ] Observabilidade/logs JSON acessiveis ao responsavel, com `X-Request-Id` preservado nas evidências.
- [ ] Artefato ou build anterior do frontend preservado.

### Opcional

- [ ] Tag de release criada antes do deploy, quando o fluxo do time permitir.
- [ ] Ambiente de homologação restaurado com backup recente.
- [ ] Troca atomica por symlink para frontend estático, se suportada pela hospedagem.

## 5. Backup do Banco

Use ferramentas reais do PostgreSQL. Preferir variáveis `PG*` ou prompt interativo em vez de colocar URL completa na linha de comando, porque comandos podem aparecer em histórico, logs ou lista de processos.

Exemplo conceitual com URL, apenas para referencia:

```bash
pg_dump \
  --format=custom \
  --file="<CAMINHO_BACKUP>/<ARQUIVO>.dump" \
  "<DATABASE_URL>"
```

Exemplo recomendado com placeholders e prompt seguro:

```bash
export PGHOST="<HOST_BANCO>"
export PGPORT="<PORTA_BANCO>"
export PGDATABASE="<NOME_BANCO>"
export PGUSER="<USUARIO_BANCO>"
pg_dump --format=custom --file="<CAMINHO_BACKUP>/<YYYYMMDD-HHMMSS>-visitantes.dump"
```

Checklist:

- [ ] Usar nome com data/hora e commit alvo.
- [ ] Gravar em diretório fora do repositório.
- [ ] Restringir permissoes do arquivo e diretório.
- [ ] Registrar tamanho do arquivo.
- [ ] Registrar checksum.
- [ ] Validar leitura do dump com ferramenta do PostgreSQL.
- [ ] Copiar para local externo seguro, se permitido pelo procedimento.
- [ ] Definir retencao.
- [ ] Não publicar nem anexar dump em canal aberto.

## 6. Validação do Backup

- [ ] `pg_dump` concluiu sem erro.
- [ ] Arquivo existe em `<CAMINHO_BACKUP>`.
- [ ] Tamanho maior que zero.
- [ ] Checksum registrado.
- [ ] Leitura do dump validada.
- [ ] Restauração testada em banco isolado, quando possível.
- [ ] Evidencia registrada sem dados pessoais.

Um backup não testado reduz risco, mas não garante restauração.

## 7. Restauração em Ambiente Isolado

Procedimento conceitual para teste futuro:

- [ ] Criar banco vazio e isolado: `<NOME_BANCO_TESTE_RESTORE>`.
- [ ] Configurar acesso apenas para o operador autorizado.
- [ ] Restaurar o dump com `pg_restore` no banco temporário.
- [ ] Verificar se a restauração terminou sem erro.
- [ ] Conferir tabelas esperadas: `branches`, `users`, `visitors`, `visits`, `agenda_events`, `tv_contents`, `tv_content_branches`.
- [ ] Conferir tabela de migrations do Prisma.
- [ ] Executar consultas de contagem por tabela.
- [ ] Validar amostras por IDs mascarados, sem dados pessoais.
- [ ] Remover banco temporário depois da validação.

Não usar banco de produção para teste de restore. Não usar `migrate reset`.

## 8. Verificacoes de Dados Antes da Migration

Executar somente consultas de leitura. Registrar apenas contagens e IDs mascarados.

### Duplicidade de visitas abertas

```sql
SELECT "visitorId", "branchId", COUNT(*) AS total
FROM "visits"
WHERE "checkoutAt" IS NULL
GROUP BY "visitorId", "branchId"
HAVING COUNT(*) > 1;
```

- [ ] Resultado esperado antes da migration `20260717120000_prevent_duplicate_open_visits`: zero linhas.
- [ ] Se houver linhas, pausar deploy e corrigir dados com procedimento aprovado.

### Dados inválidos conhecidos

```sql
SELECT COUNT(*) AS total_cpf_invalido
FROM "visitors"
WHERE "cpf" IS NULL OR length(regexp_replace("cpf", '\D', '', 'g')) <> 11;
```

```sql
SELECT COUNT(*) AS total_role_invalida
FROM "users"
WHERE "role"::text NOT IN ('RECEPCAO', 'ADMIN');
```

```sql
SELECT COUNT(*) AS total_usuario_ativo_sem_filial
FROM "users"
WHERE "isActive" = true AND "branchId" IS NULL;
```

```sql
SELECT COUNT(*) AS total_visitas_sem_filial
FROM "visits"
WHERE "branchId" IS NULL;
```

```sql
SELECT COUNT(*) AS total_vinculos_orfaos_tv
FROM "tv_content_branches" tcb
LEFT JOIN "tv_contents" tc ON tc."id" = tcb."tvContentId"
LEFT JOIN "branches" b ON b."id" = tcb."branchId"
WHERE tc."id" IS NULL OR b."id" IS NULL;
```

```sql
SELECT COUNT(*) AS total_tv_fileurl_inconsistente
FROM "tv_contents"
WHERE "fileUrl" IS NULL OR "fileUrl" NOT LIKE '/uploads/tv/%';
```

```sql
SELECT COUNT(*) AS total_agenda_status_invalido
FROM "agenda_events"
WHERE "status"::text NOT IN ('AGENDADO', 'CANCELADO');
```

- [ ] Não exportar CPF, nomes, telefones, imagens ou documentos.
- [ ] Para investigação, mascarar IDs e limitar resultado.

## 9. Ordem Segura de Publicação

- [ ] 1. Confirmar CI verde, branch, commit alvo e commit anterior.
- [ ] 2. Preparar janela operacional e responsável por rollback.
- [ ] 3. Fazer backup do banco.
- [ ] 4. Validar backup.
- [ ] 5. Verificar duplicidades de visitas abertas e dados inválidos.
- [ ] 6. Entrar em manutencao, se necessario.
- [ ] 7. Atualizar código no servidor para `<COMMIT_ALVO>`.
- [ ] 8. Instalar dependências conforme estratégia do ambiente.
- [ ] 9. Gerar Prisma Client.
- [ ] 10. Aplicar migrations.
- [ ] 11. Verificar status das migrations.
- [ ] 12. Publicar/reiniciar backend.
- [ ] 13. Executar smoke tests do backend.
- [ ] 14. Gerar/publicar frontend com `VITE_API_URL` confirmado.
- [ ] 15. Executar smoke tests completos.
- [ ] 16. Monitorar.
- [ ] 17. Registrar evidências.

Essa ordem reduz risco porque valida o backup antes de alterar schema, bloqueia a migration do índice parcial se já houver duplicidades, publica o backend compatível com o banco migrado antes do frontend e evita que o frontend novo aponte para API incorreta.

A migration do índice parcial é aditiva. Em geral, o código anterior continua funcionando com o índice novo, mas pode receber erro de unicidade em corridas concorrentes que antes criavam duplicidade. Isso é desejável para proteger os dados, mas deve ser considerado em rollback.

## 10. Atualizacao do Código no Servidor

Fluxo conceitual, sem caminhos reais:

```bash
cd "<CAMINHO_PROJETO>"
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin "<BRANCH_PRODUCAO>"
git checkout "<BRANCH_PRODUCAO>"
git pull --ff-only origin "<BRANCH_PRODUCAO>"
git rev-parse HEAD
```

- [ ] Confirmar que o hash atual corresponde a `<COMMIT_ALVO>`.
- [ ] Registrar `<COMMIT_ANTERIOR>` antes da atualizacao.
- [ ] Evitar `git reset --hard`: ele pode descartar alterações locais e deve ser usado somente com aprovação explícita e backup do estado atual.
- [ ] Não fazer merge, rebase ou alteracoes manuais no servidor durante deploy.

## 11. Dependências Backend

Servidor que faz build/gera artefato:

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate status
```

Instalação de produção no servidor:

```bash
cd backend
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

- [ ] Confirmar se `npx prisma generate` funciona com a instalação planejada.
- [ ] Se o servidor também roda testes, instalar devDependencies em etapa de build separada.
- [ ] Não executar `prisma db push` em produção.
- [ ] Não alterar scripts do `package.json`.

## 12. Backend em Produção

Comando real disponível no projeto:

```bash
cd backend
NODE_ENV=production npm start
```

Equivalente direto:

```bash
cd backend
NODE_ENV=production node src/server.js
```

- [ ] Não usar `npm run dev` em produção; ele executa `nodemon`.
- [ ] Processo PM2 documentado: `visitantes-backend`.
- [ ] Arquivo de configuração PM2: `A CONFIRMAR`.
- [ ] Nome final do processo: `A CONFIRMAR` se diferente de `visitantes-backend`.
- [ ] Decidir entre restart e reload conforme configuração PM2 real.
- [ ] Zero downtime: `A CONFIRMAR`.
- [ ] Verificar status do processo após restart.
- [ ] Verificar logs recentes sem expor segredos.
- [ ] Manter caminho para voltar ao `<COMMIT_ANTERIOR>`.

## 13. Frontend

```bash
cd frontend
npm ci
npm run build
```

- [ ] Confirmar `VITE_API_URL` antes do build.
- [ ] Confirmar que `frontend/dist` foi gerado.
- [ ] Diretório publico real: `A CONFIRMAR`.
- [ ] Preservar build anterior antes de substituir.
- [ ] Preferir copia atomica ou troca de symlink, se suportada.
- [ ] Não apagar uploads durante publicação do frontend.
- [ ] Limpar assets antigos apenas depois de validar que não há referências ativas.
- [ ] Considerar cache do navegador.
- [ ] Vite gera assets com hashes; validar que servidor estático respeita cache adequado para assets e não cacheia HTML principal de forma perigosa.

## 14. Uploads e Storage

Comportamento atual:

- [ ] Conteúdo de TV fica em filesystem.
- [ ] Raiz: `UPLOAD_ROOT`.
- [ ] Arquivos finais de TV: `UPLOAD_ROOT/tv`.
- [ ] Arquivos temporarios de TV: `UPLOAD_ROOT/tmp/tv`.
- [ ] URL pública no backend: `/uploads/tv/<ARQUIVO>`.
- [ ] Fotos e documentos de visitante ficam no PostgreSQL em campos `Bytes`.

Checklist:

- [ ] `UPLOAD_ROOT` definido em produção.
- [ ] Diretório existe ou pode ser criado pelo processo.
- [ ] Permissão de leitura e escrita para o usuário do processo.
- [ ] Ownership correto.
- [ ] Espaço em disco suficiente para vídeos de até 200 MB e crescimento futuro.
- [ ] Backup de `UPLOAD_ROOT/tv` incluido no plano operacional.
- [ ] Persistencia entre deploys confirmada.
- [ ] `UPLOAD_ROOT` não fica dentro de diretório substituido pelo deploy.
- [ ] Deploy não remove `UPLOAD_ROOT`, `UPLOAD_ROOT/tv` ou `UPLOAD_ROOT/tmp`.
- [ ] Restauração de banco e arquivos de TV deve manter consistência entre `tv_contents.fileUrl` e arquivos físicos.

## 15. Reverse Proxy e HTTPS

Arquivos de proxy não estão versionados. Validar no ambiente real:

- [ ] HTTPS ativo.
- [ ] Certificado válido.
- [ ] Renovacao do certificado configurada.
- [ ] Proxy encaminha API para porta correta do backend.
- [ ] Frontend estático servido do diretório correto.
- [ ] Headers de seguranca revisados junto com `helmet`.
- [ ] Limite de upload permite vídeos de até 200 MB.
- [ ] Timeout de upload adequado para vídeos grandes.
- [ ] Body size configurado acima do limite esperado.
- [ ] WebSocket: não aplicavel pelo código atual, salvo configuração externa `A CONFIRMAR`.
- [ ] Cache agressivo somente para assets versionados.
- [ ] Não cachear respostas privadas da API.

## 16. Smoke Tests do Backend

### Publico

- [ ] `GET /health`: espera `200` e `ok: true`.
- [ ] `GET /health/ready`: espera `200` com `database: "up"` e `storage: "up"`; se indisponível, espera `503` sem detalhes internos.
- [ ] `POST /auth/login` com credencial inválida: espera `401` ou erro controlado, sem stack trace.
- [ ] `GET /agenda/public/tv-now`: espera `200` com lista ou resposta vazia válida.
- [ ] `GET /tv-content/public/active?branchId=<ID_FILIAL_TESTE>`: espera `200` com lista ou resposta vazia válida.

### Autenticado

- [ ] Login válido com usuário de teste operacional.
- [ ] `GET /branches`: espera lista de filiais permitidas.
- [ ] Buscar visitante por CPF artificial.
- [ ] Listar visitas abertas com `GET /visits/open`.
- [ ] Listar agenda com `GET /agenda`.

### ADMIN

- [ ] `GET /users`: espera lista sem expor senha/hash.
- [ ] `GET /history`: espera histórico paginado/controlado.
- [ ] `GET /tv-content`: espera lista de conteudos.

### Fluxo real controlado

- [ ] Criar visitante artificial.
- [ ] Enviar tres imagens artificiais.
- [ ] Fazer check-in.
- [ ] Gerar etiqueta.
- [ ] Fazer checkout.
- [ ] Remover dados artificiais conforme procedimento aprovado.

Não usar pessoas reais nos smoke tests.

## 17. Smoke Tests do Frontend

- [ ] Login com usuário válido.
- [ ] Sessão inválida redireciona para login em `401`.
- [ ] `403` não faz logout indevido.
- [ ] Cadastro de visitante artificial.
- [ ] Câmera abre e captura quando dispositivo permitir.
- [ ] Upload de tres imagens artificiais.
- [ ] Check-in.
- [ ] Checkout.
- [ ] QR/etiqueta.
- [ ] Histórico.
- [ ] Usuários.
- [ ] Agenda.
- [ ] TV.
- [ ] Refresh de pagina em rotas principais.
- [ ] Logout.
- [ ] Responsividade mínima em desktop e celular.

## 18. Monitoramento Pos-deploy

### Imediatamente

- [ ] `GET /health`.
- [ ] Status do processo backend.
- [ ] Logs recentes sem erros críticos.
- [ ] Uso de CPU, memória e disco.
- [ ] Conexoes PostgreSQL.

### Após smoke tests

- [ ] Erros `500` e `503`.
- [ ] Latência percebida.
- [ ] Falhas de CORS.
- [ ] Erros de frontend no navegador.
- [ ] Uploads de TV.
- [ ] Check-ins e checkouts artificiais.

### Durante a primeira janela operacional

- [ ] Logs de autenticação.
- [ ] Novos check-ins reais sem dados pessoais no relatorio.
- [ ] Crescimento de disco em uploads e logs.
- [ ] Certificado HTTPS.

### No proximo dia util

- [ ] Revisar incidentes.
- [ ] Confirmar ausencia de erros recorrentes.
- [ ] Confirmar backups pos-deploy conforme politica.

## 19. Rollback do Backend

- [ ] Confirmar necessidade de rollback.
- [ ] Registrar motivo.
- [ ] Preservar logs e estado atual.
- [ ] Confirmar `<COMMIT_ANTERIOR>`.
- [ ] Voltar código para commit anterior por procedimento aprovado.
- [ ] Instalar dependências coerentes com o commit anterior.
- [ ] Gerar Prisma Client se necessario.
- [ ] Reiniciar ou recarregar processo de forma controlada.
- [ ] Validar `/health`.
- [ ] Executar smoke tests mínimos.

Compatibilidade com migrations:

- [ ] Rollback de código não significa rollback automático do banco.
- [ ] Migrations aditivas podem permanecer.
- [ ] Não remover o índice parcial sem necessidade.
- [ ] Código antigo pode receber erro Prisma `P2002` em corrida de visitas abertas, porque o banco passa a impedir duplicidade.

## 20. Rollback do Frontend

- [ ] Preservar build anterior antes do deploy.
- [ ] Restaurar `dist` anterior ou trocar symlink para a versao anterior, se aplicavel.
- [ ] Validar que o frontend anterior é compatível com a API atual.
- [ ] Limpar cache apenas quando necessario.
- [ ] Executar smoke tests de login, cadastro, check-in, checkout, histórico, agenda e TV.

## 21. Rollback de Migration

- [ ] Prisma não gera down migration automaticamente.
- [ ] Rollback de banco exige decisão manual e revisão.
- [ ] Nunca apagar dados automaticamente para reverter deploy.
- [ ] SQL reverso deve ser revisado por responsavel técnico.
- [ ] Algumas migrations devem permanecer mesmo após rollback de código.

Reversao técnica possível para o índice de visitas abertas, não recomendada porque reabre a corrida:

```sql
DROP INDEX "visits_one_open_per_visitor_branch_idx";
```

## 22. Restauração Total

Restauração total e último recurso para corrupção de dados, perda de dados ou incompatibilidade irrecuperável.

- [ ] Parar escrita da aplicação.
- [ ] Preservar estado atual.
- [ ] Criar backup de emergencia do estado atual.
- [ ] Confirmar backup escolhido para restauração.
- [ ] Restaurar banco com `pg_restore` em procedimento aprovado.
- [ ] Restaurar arquivos de TV correspondentes, se necessario.
- [ ] Reaplicar código compatível com o banco restaurado.
- [ ] Validar migrations.
- [ ] Executar smoke tests.
- [ ] Registrar incidente, causa, impacto e ações corretivas.

## 23. Evidências do Deploy

Registrar sem dados pessoais:

- [ ] Data.
- [ ] Responsavel.
- [ ] Branch.
- [ ] Commit anterior.
- [ ] Commit novo.
- [ ] Resultado da CI.
- [ ] Nome do arquivo de backup.
- [ ] Tamanho do backup.
- [ ] Checksum do backup.
- [ ] Validação do backup.
- [ ] Migrations aplicadas.
- [ ] Status do processo.
- [ ] Health check.
- [ ] Smoke tests executados.
- [ ] Erros encontrados.
- [ ] Rollback realizado ou não.
- [ ] Observações.

## 24. Comandos Que Não Devem Ser Usados em Produção Sem Aprovação

- [ ] `npm run dev` para backend.
- [ ] `npx prisma db push`.
- [ ] `npx prisma migrate reset`.
- [ ] `git reset --hard`.
- [ ] Remocao manual de uploads.
- [ ] Restore sobre banco de produção sem parada de escrita e aprovação.

## 25. Checklist Final Antes de Encerrar Deploy Futuro

- [ ] CI verde registrada.
- [ ] Backup validado.
- [ ] Duplicidades de visitas abertas verificadas.
- [ ] Migrations aplicadas e status conferido.
- [ ] Backend publicado e saudável.
- [ ] Frontend publicado com `VITE_API_URL` correto.
- [ ] Uploads de TV acessiveis.
- [ ] Fotos/documentos de visitante acessiveis via API autenticada.
- [ ] Smoke tests públicos, autenticados e ADMIN executados.
- [ ] Monitoramento inicial concluido.
- [ ] Evidências registradas.
- [ ] Plano de rollback permanece disponível até o fim da janela operacional.
