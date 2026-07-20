# Checklist Operacional de Producao

Este documento descreve um procedimento futuro para publicar o Visitantes Dimebras com menor risco operacional. Ele foi produzido somente a partir dos arquivos versionados do repositorio e deve ser revisado antes de qualquer deploy real.

Nao execute este checklist diretamente sem validar os itens marcados como `A CONFIRMAR`.

## 1. Estado Atual da Documentacao

### Instrucoes existentes

- [ ] `DEPLOY.md`: contem fluxo basico de backend, frontend, variaveis e storage.
- [ ] `PRODUCAO.md`: contem comandos curtos de deploy com PM2 e health check.
- [ ] `README.md` na raiz: `A CONFIRMAR` porque nao existe no repositorio atual.
- [ ] `frontend/README.md`: template padrao do Vite, nao documenta producao.
- [ ] `.github/workflows/ci.yml`: automatiza backend e frontend com Node.js 22, PostgreSQL 16, Prisma, testes, lint e build.

### Itens corretos ja documentados

- [ ] Backend usa Node.js/Express com Prisma e PostgreSQL.
- [ ] Frontend usa React/Vite e gera build em `frontend/dist`.
- [ ] Backend aplica migrations com `npx prisma migrate deploy`.
- [ ] Frontend deve definir `VITE_API_URL` antes do build.
- [ ] Uploads de TV usam `UPLOAD_ROOT/tv` quando `UPLOAD_ROOT` esta definido.
- [ ] Arquivos reais, dumps, builds e `.env` nao devem ser versionados.
- [ ] `PRODUCAO.md` indica PM2 para `visitantes-backend` e `visitantes-frontend`.

### Itens incompletos ou inadequados para producao

- [ ] `DEPLOY.md` nao detalha backup, validacao de backup, restore, smoke tests, rollback ou evidencias.
- [ ] `PRODUCAO.md` nao registra commit anterior, commit alvo, backup, checksum, status de migrations ou rollback.
- [ ] Reverse proxy, HTTPS, diretorio publico do frontend e configuracao do processo PM2 estao `A CONFIRMAR`.
- [ ] Nao ha arquivo `ecosystem.config`, Nginx, Apache, systemd ou Docker versionado.
- [ ] `PRODUCAO.md` usa caminhos e porta local que devem ser substituidos por placeholders em procedimentos revisados.
- [ ] `DEPLOY.md` continha uma instrucao perigosa para producao com `NODE_ENV=production npm run dev`; a instrucao foi corrigida para `npm start`, pois `npm run dev` executa `nodemon`.

### Pre-requisitos ainda nao documentados

- [ ] Janela de manutencao.
- [ ] Responsavel por deploy e rollback.
- [ ] Politica de retencao de backup.
- [ ] Local seguro para backups fora do repositorio.
- [ ] Validacao de espaco em disco para banco, logs, uploads e backups.
- [ ] Procedimento de rollback de frontend e backend.
- [ ] Procedimento de restauracao total.
- [ ] Evidencias obrigatorias do deploy.

## 2. Arquitetura de Producao Conhecida

- [ ] Backend: Node.js/Express, entrada em `backend/src/server.js`.
- [ ] Comando real disponivel para iniciar backend: `npm start`, que executa `node src/server.js`.
- [ ] Process manager documentado: PM2 em `PRODUCAO.md`, com processo `visitantes-backend`; configuracao detalhada `A CONFIRMAR`.
- [ ] Porta do backend: `PORT`; fallback do codigo e `.env.example` apontam para `3001`. `PRODUCAO.md` verifica `/health` em porta diferente; porta real de producao `A CONFIRMAR`.
- [ ] Reverse proxy: `A CONFIRMAR`.
- [ ] HTTPS/certificado: `A CONFIRMAR`.
- [ ] Frontend estatico: build em `frontend/dist`; diretorio publico real `A CONFIRMAR`.
- [ ] Processo frontend em PM2: `visitantes-frontend` em `PRODUCAO.md`; finalidade exata `A CONFIRMAR`.
- [ ] Banco: PostgreSQL, acessado pelo Prisma via `DATABASE_URL`.
- [ ] Migrations: `backend/prisma/migrations`, aplicadas por `npx prisma migrate deploy`.
- [ ] Health check: `GET /health`.
- [ ] CORS: em producao, backend exige `FRONTEND_URL`.
- [ ] Uploads de TV: filesystem em `UPLOAD_ROOT/tv`, exposto pelo backend em `/uploads/tv`.
- [ ] Temporarios de TV: `UPLOAD_ROOT/tmp/tv`.
- [ ] Fotos e documentos de visitantes: armazenados no PostgreSQL em campos `Bytes`.
- [ ] Limite de arquivos de visitante: 3 arquivos, ate 8 MB cada.
- [ ] Limite de conteudo de TV: 1 arquivo, ate 200 MB.

## 3. Variaveis de Ambiente

Nao versionar `.env` e nao registrar valores reais em evidencias.

| Variavel | Finalidade | Obrigatoriedade | Exemplo seguro | Validacao antes do deploy | Risco se incorreta |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Conexao PostgreSQL usada pelo Prisma | Obrigatoria | `postgresql://<USUARIO_BANCO>:<SEGREDO>@<HOST_BANCO>:<PORTA_BANCO>/<NOME_BANCO>?schema=public` | Confirmar host, porta, banco e usuario sem exibir valor completo | Backend nao inicia, migrations falham ou apontam para banco errado |
| `JWT_SECRET` | Assinatura de tokens JWT | Obrigatoria | `<SEGREDO_JWT_FORTE>` | Confirmar existencia e rotacao controlada sem imprimir valor | Login e etiquetas falham; tokens podem ficar inseguros |
| `PORT` | Porta HTTP do backend | Obrigatoria para producao controlada | `<PORTA_BACKEND>` | Confirmar que proxy e PM2 usam a mesma porta | Health check falha ou proxy aponta para porta errada |
| `NODE_ENV` | Modo de execucao do backend | Obrigatoria | `production` | Confirmar valor `production` | CORS e comportamento de runtime podem ficar inadequados |
| `FRONTEND_URL` | Origem publica permitida no CORS | Obrigatoria em producao | `https://<DOMINIO_FRONTEND>` | Confirmar origem exata, sem barra final obrigatoria | Frontend pode sofrer bloqueio de CORS ou liberar origem errada |
| `UPLOAD_ROOT` | Raiz persistente para arquivos de TV | Obrigatoria para producao | `<CAMINHO_UPLOAD_ROOT>` | Confirmar existencia, persistencia e permissoes | Arquivos de TV podem sumir ou ficar inacessiveis |
| `LABEL_TOKEN_TTL_SECONDS` | Validade dos tokens temporarios de etiqueta | Opcional, recomendado definir | `28800` | Confirmar valor inteiro positivo coerente | Etiquetas podem expirar cedo ou tarde demais |
| `ADMIN_SEED_PASSWORD` | Senha inicial usada somente pelo seed | Opcional, apenas se seed for executado | `<SEGREDO_ADMIN_INICIAL>` | Confirmar somente quando houver criacao inicial controlada | Seed pode falhar ou criar credencial fraca |
| `VITE_API_URL` | URL base da API embutida no build do frontend | Obrigatoria antes do build | `https://<DOMINIO_API>` | Conferir no ambiente de build antes de `npm run build` | Frontend aponta para API errada |

## 4. Pre-requisitos Antes do Deploy

### Obrigatorio

- [ ] CI verde no commit alvo.
- [ ] Working tree limpa no ambiente de preparacao.
- [ ] Branch de producao confirmada: `<BRANCH_PRODUCAO>`.
- [ ] Commit alvo registrado: `<COMMIT_ALVO>`.
- [ ] Commit anterior registrado: `<COMMIT_ANTERIOR>`.
- [ ] Backup preparado em `<CAMINHO_BACKUP>` fora do repositorio.
- [ ] Acesso ao banco confirmado por canal seguro.
- [ ] Acesso ao servidor confirmado por canal seguro.
- [ ] Node.js compativel com a CI: Node.js 22 ou versao validada.
- [ ] PostgreSQL compativel com a CI: PostgreSQL 16 ou versao validada.
- [ ] `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `FRONTEND_URL`, `UPLOAD_ROOT` e `VITE_API_URL` confirmadas sem exibir valores reais.
- [ ] CORS alinhado entre `FRONTEND_URL` e origem publica real.
- [ ] Permissoes de leitura/escrita no diretorio `UPLOAD_ROOT`.
- [ ] Responsavel pelo rollback definido.

### Recomendado

- [ ] Janela de manutencao comunicada.
- [ ] Espaco em disco validado para banco, backups, uploads, logs e build.
- [ ] Checksum do backup planejado.
- [ ] Plano para copia externa segura do backup.
- [ ] Lista de smoke tests impressa ou registrada em ticket operacional.
- [ ] Observabilidade/logs acessiveis ao responsavel.
- [ ] Artefato ou build anterior do frontend preservado.

### Opcional

- [ ] Tag de release criada antes do deploy, quando o fluxo do time permitir.
- [ ] Ambiente de homologacao restaurado com backup recente.
- [ ] Troca atomica por symlink para frontend estatico, se suportada pela hospedagem.

## 5. Backup do Banco

Use ferramentas reais do PostgreSQL. Preferir variaveis `PG*` ou prompt interativo em vez de colocar URL completa na linha de comando, porque comandos podem aparecer em historico, logs ou lista de processos.

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
- [ ] Gravar em diretorio fora do repositorio.
- [ ] Restringir permissoes do arquivo e diretorio.
- [ ] Registrar tamanho do arquivo.
- [ ] Registrar checksum.
- [ ] Validar leitura do dump com ferramenta do PostgreSQL.
- [ ] Copiar para local externo seguro, se permitido pelo procedimento.
- [ ] Definir retencao.
- [ ] Nao publicar nem anexar dump em canal aberto.

## 6. Validacao do Backup

- [ ] `pg_dump` concluiu sem erro.
- [ ] Arquivo existe em `<CAMINHO_BACKUP>`.
- [ ] Tamanho maior que zero.
- [ ] Checksum registrado.
- [ ] Leitura do dump validada.
- [ ] Restauracao testada em banco isolado, quando possivel.
- [ ] Evidencia registrada sem dados pessoais.

Um backup nao testado reduz risco, mas nao garante restauracao.

## 7. Restauracao em Ambiente Isolado

Procedimento conceitual para teste futuro:

- [ ] Criar banco vazio e isolado: `<NOME_BANCO_TESTE_RESTORE>`.
- [ ] Configurar acesso apenas para o operador autorizado.
- [ ] Restaurar o dump com `pg_restore` no banco temporario.
- [ ] Verificar se a restauracao terminou sem erro.
- [ ] Conferir tabelas esperadas: `branches`, `users`, `visitors`, `visits`, `agenda_events`, `tv_contents`, `tv_content_branches`.
- [ ] Conferir tabela de migrations do Prisma.
- [ ] Executar consultas de contagem por tabela.
- [ ] Validar amostras por IDs mascarados, sem dados pessoais.
- [ ] Remover banco temporario depois da validacao.

Nao usar banco de producao para teste de restore. Nao usar `migrate reset`.

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

### Dados invalidos conhecidos

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

- [ ] Nao exportar CPF, nomes, telefones, imagens ou documentos.
- [ ] Para investigacao, mascarar IDs e limitar resultado.

## 9. Ordem Segura de Publicacao

- [ ] 1. Confirmar CI verde, branch, commit alvo e commit anterior.
- [ ] 2. Preparar janela operacional e responsavel por rollback.
- [ ] 3. Fazer backup do banco.
- [ ] 4. Validar backup.
- [ ] 5. Verificar duplicidades de visitas abertas e dados invalidos.
- [ ] 6. Entrar em manutencao, se necessario.
- [ ] 7. Atualizar codigo no servidor para `<COMMIT_ALVO>`.
- [ ] 8. Instalar dependencias conforme estrategia do ambiente.
- [ ] 9. Gerar Prisma Client.
- [ ] 10. Aplicar migrations.
- [ ] 11. Verificar status das migrations.
- [ ] 12. Publicar/reiniciar backend.
- [ ] 13. Executar smoke tests do backend.
- [ ] 14. Gerar/publicar frontend com `VITE_API_URL` confirmado.
- [ ] 15. Executar smoke tests completos.
- [ ] 16. Monitorar.
- [ ] 17. Registrar evidencias.

Essa ordem reduz risco porque valida o backup antes de alterar schema, bloqueia a migration do indice parcial se ja houver duplicidades, publica o backend compativel com o banco migrado antes do frontend e evita que o frontend novo aponte para API incorreta.

A migration do indice parcial e aditiva. Em geral, o codigo anterior continua funcionando com o indice novo, mas pode receber erro de unicidade em corridas concorrentes que antes criavam duplicidade. Isso e desejavel para proteger os dados, mas deve ser considerado em rollback.

## 10. Atualizacao do Codigo no Servidor

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
- [ ] Evitar `git reset --hard`: ele pode descartar alteracoes locais e deve ser usado somente com aprovacao explicita e backup do estado atual.
- [ ] Nao fazer merge, rebase ou alteracoes manuais no servidor durante deploy.

## 11. Dependencias Backend

Servidor que faz build/gera artefato:

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate status
```

Instalacao de producao no servidor:

```bash
cd backend
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

- [ ] Confirmar se `npx prisma generate` funciona com a instalacao planejada.
- [ ] Se o servidor tambem roda testes, instalar devDependencies em etapa de build separada.
- [ ] Nao executar `prisma db push` em producao.
- [ ] Nao alterar scripts do `package.json`.

## 12. Backend em Producao

Comando real disponivel no projeto:

```bash
cd backend
NODE_ENV=production npm start
```

Equivalente direto:

```bash
cd backend
NODE_ENV=production node src/server.js
```

- [ ] Nao usar `npm run dev` em producao; ele executa `nodemon`.
- [ ] Processo PM2 documentado: `visitantes-backend`.
- [ ] Arquivo de configuracao PM2: `A CONFIRMAR`.
- [ ] Nome final do processo: `A CONFIRMAR` se diferente de `visitantes-backend`.
- [ ] Decidir entre restart e reload conforme configuracao PM2 real.
- [ ] Zero downtime: `A CONFIRMAR`.
- [ ] Verificar status do processo apos restart.
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
- [ ] Diretorio publico real: `A CONFIRMAR`.
- [ ] Preservar build anterior antes de substituir.
- [ ] Preferir copia atomica ou troca de symlink, se suportada.
- [ ] Nao apagar uploads durante publicacao do frontend.
- [ ] Limpar assets antigos apenas depois de validar que nao ha referencias ativas.
- [ ] Considerar cache do navegador.
- [ ] Vite gera assets com hashes; validar que servidor estatico respeita cache adequado para assets e nao cacheia HTML principal de forma perigosa.

## 14. Uploads e Storage

Comportamento atual:

- [ ] Conteudo de TV fica em filesystem.
- [ ] Raiz: `UPLOAD_ROOT`.
- [ ] Arquivos finais de TV: `UPLOAD_ROOT/tv`.
- [ ] Arquivos temporarios de TV: `UPLOAD_ROOT/tmp/tv`.
- [ ] URL publica no backend: `/uploads/tv/<ARQUIVO>`.
- [ ] Fotos e documentos de visitante ficam no PostgreSQL em campos `Bytes`.

Checklist:

- [ ] `UPLOAD_ROOT` definido em producao.
- [ ] Diretorio existe ou pode ser criado pelo processo.
- [ ] Permissao de leitura e escrita para o usuario do processo.
- [ ] Ownership correto.
- [ ] Espaco em disco suficiente para videos de ate 200 MB e crescimento futuro.
- [ ] Backup de `UPLOAD_ROOT/tv` incluido no plano operacional.
- [ ] Persistencia entre deploys confirmada.
- [ ] `UPLOAD_ROOT` nao fica dentro de diretorio substituido pelo deploy.
- [ ] Deploy nao remove `UPLOAD_ROOT`, `UPLOAD_ROOT/tv` ou `UPLOAD_ROOT/tmp`.
- [ ] Restauracao de banco e arquivos de TV deve manter consistencia entre `tv_contents.fileUrl` e arquivos fisicos.

## 15. Reverse Proxy e HTTPS

Arquivos de proxy nao estao versionados. Validar no ambiente real:

- [ ] HTTPS ativo.
- [ ] Certificado valido.
- [ ] Renovacao do certificado configurada.
- [ ] Proxy encaminha API para porta correta do backend.
- [ ] Frontend estatico servido do diretorio correto.
- [ ] Headers de seguranca revisados junto com `helmet`.
- [ ] Limite de upload permite videos de ate 200 MB.
- [ ] Timeout de upload adequado para videos grandes.
- [ ] Body size configurado acima do limite esperado.
- [ ] WebSocket: nao aplicavel pelo codigo atual, salvo configuracao externa `A CONFIRMAR`.
- [ ] Cache agressivo somente para assets versionados.
- [ ] Nao cachear respostas privadas da API.

## 16. Smoke Tests do Backend

### Publico

- [ ] `GET /health`: espera `200` e `ok: true`.
- [ ] `POST /auth/login` com credencial invalida: espera `401` ou erro controlado, sem stack trace.
- [ ] `GET /agenda/public/tv-now`: espera `200` com lista ou resposta vazia valida.
- [ ] `GET /tv-content/public/active?branchId=<ID_FILIAL_TESTE>`: espera `200` com lista ou resposta vazia valida.

### Autenticado

- [ ] Login valido com usuario de teste operacional.
- [ ] `GET /branches`: espera lista de filiais permitidas.
- [ ] Buscar visitante por CPF artificial.
- [ ] Listar visitas abertas com `GET /visits/open`.
- [ ] Listar agenda com `GET /agenda`.

### ADMIN

- [ ] `GET /users`: espera lista sem expor senha/hash.
- [ ] `GET /history`: espera historico paginado/controlado.
- [ ] `GET /tv-content`: espera lista de conteudos.

### Fluxo real controlado

- [ ] Criar visitante artificial.
- [ ] Enviar tres imagens artificiais.
- [ ] Fazer check-in.
- [ ] Gerar etiqueta.
- [ ] Fazer checkout.
- [ ] Remover dados artificiais conforme procedimento aprovado.

Nao usar pessoas reais nos smoke tests.

## 17. Smoke Tests do Frontend

- [ ] Login com usuario valido.
- [ ] Sessao invalida redireciona para login em `401`.
- [ ] `403` nao faz logout indevido.
- [ ] Cadastro de visitante artificial.
- [ ] Camera abre e captura quando dispositivo permitir.
- [ ] Upload de tres imagens artificiais.
- [ ] Check-in.
- [ ] Checkout.
- [ ] QR/etiqueta.
- [ ] Historico.
- [ ] Usuarios.
- [ ] Agenda.
- [ ] TV.
- [ ] Refresh de pagina em rotas principais.
- [ ] Logout.
- [ ] Responsividade minima em desktop e celular.

## 18. Monitoramento Pos-deploy

### Imediatamente

- [ ] `GET /health`.
- [ ] Status do processo backend.
- [ ] Logs recentes sem erros criticos.
- [ ] Uso de CPU, memoria e disco.
- [ ] Conexoes PostgreSQL.

### Apos smoke tests

- [ ] Erros `500` e `503`.
- [ ] Latencia percebida.
- [ ] Falhas de CORS.
- [ ] Erros de frontend no navegador.
- [ ] Uploads de TV.
- [ ] Check-ins e checkouts artificiais.

### Durante a primeira janela operacional

- [ ] Logs de autenticacao.
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
- [ ] Voltar codigo para commit anterior por procedimento aprovado.
- [ ] Instalar dependencias coerentes com o commit anterior.
- [ ] Gerar Prisma Client se necessario.
- [ ] Reiniciar ou recarregar processo de forma controlada.
- [ ] Validar `/health`.
- [ ] Executar smoke tests minimos.

Compatibilidade com migrations:

- [ ] Rollback de codigo nao significa rollback automatico do banco.
- [ ] Migrations aditivas podem permanecer.
- [ ] Nao remover o indice parcial sem necessidade.
- [ ] Codigo antigo pode receber erro Prisma `P2002` em corrida de visitas abertas, porque o banco passa a impedir duplicidade.

## 20. Rollback do Frontend

- [ ] Preservar build anterior antes do deploy.
- [ ] Restaurar `dist` anterior ou trocar symlink para a versao anterior, se aplicavel.
- [ ] Validar que o frontend anterior e compativel com a API atual.
- [ ] Limpar cache apenas quando necessario.
- [ ] Executar smoke tests de login, cadastro, check-in, checkout, historico, agenda e TV.

## 21. Rollback de Migration

- [ ] Prisma nao gera down migration automaticamente.
- [ ] Rollback de banco exige decisao manual e revisao.
- [ ] Nunca apagar dados automaticamente para reverter deploy.
- [ ] SQL reverso deve ser revisado por responsavel tecnico.
- [ ] Algumas migrations devem permanecer mesmo apos rollback de codigo.

Reversao tecnica possivel para o indice de visitas abertas, nao recomendada porque reabre a corrida:

```sql
DROP INDEX "visits_one_open_per_visitor_branch_idx";
```

## 22. Restauracao Total

Restauracao total e ultimo recurso para corrupcao de dados, perda de dados ou incompatibilidade irrecuperavel.

- [ ] Parar escrita da aplicacao.
- [ ] Preservar estado atual.
- [ ] Criar backup de emergencia do estado atual.
- [ ] Confirmar backup escolhido para restauracao.
- [ ] Restaurar banco com `pg_restore` em procedimento aprovado.
- [ ] Restaurar arquivos de TV correspondentes, se necessario.
- [ ] Reaplicar codigo compativel com o banco restaurado.
- [ ] Validar migrations.
- [ ] Executar smoke tests.
- [ ] Registrar incidente, causa, impacto e acoes corretivas.

## 23. Evidencias do Deploy

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
- [ ] Validacao do backup.
- [ ] Migrations aplicadas.
- [ ] Status do processo.
- [ ] Health check.
- [ ] Smoke tests executados.
- [ ] Erros encontrados.
- [ ] Rollback realizado ou nao.
- [ ] Observacoes.

## 24. Comandos Que Nao Devem Ser Usados em Producao Sem Aprovacao

- [ ] `npm run dev` para backend.
- [ ] `npx prisma db push`.
- [ ] `npx prisma migrate reset`.
- [ ] `git reset --hard`.
- [ ] Remocao manual de uploads.
- [ ] Restore sobre banco de producao sem parada de escrita e aprovacao.

## 25. Checklist Final Antes de Encerrar Deploy Futuro

- [ ] CI verde registrada.
- [ ] Backup validado.
- [ ] Duplicidades de visitas abertas verificadas.
- [ ] Migrations aplicadas e status conferido.
- [ ] Backend publicado e saudavel.
- [ ] Frontend publicado com `VITE_API_URL` correto.
- [ ] Uploads de TV acessiveis.
- [ ] Fotos/documentos de visitante acessiveis via API autenticada.
- [ ] Smoke tests publicos, autenticados e ADMIN executados.
- [ ] Monitoramento inicial concluido.
- [ ] Evidencias registradas.
- [ ] Plano de rollback permanece disponivel ate o fim da janela operacional.
