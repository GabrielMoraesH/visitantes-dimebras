# Deploy Visitantes Dimebras

## Backend
cd ~/visitantes-dimebras-v2
git pull origin main

cd backend
npm ci
npx prisma migrate deploy
pm2 restart visitantes-backend

## Frontend
cd ~/visitantes-dimebras-v2/frontend
npm ci
npm run build
pm2 restart visitantes-frontend

## Verificações

pm2 status
pm2 logs visitantes-backend --lines 50
curl http://127.0.0.1:3007/health
curl http://127.0.0.1:3007/health/ready

`GET /health` é liveness público: valida apenas que o processo Node responde HTTP e não verifica banco.
`GET /health/ready` é readiness público: verifica PostgreSQL e retorna `503` se o banco estiver indisponível.
