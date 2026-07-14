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