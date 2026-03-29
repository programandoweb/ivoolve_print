# =========================
# Etapa 1: build
# =========================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# =========================
# Etapa 2: producción
# =========================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env ./.env

EXPOSE 3021

CMD ["node", "dist/main.js"]


#docker system prune -a
#chmod +x start.sh
#npm run build
#sudo docker build -t programandoweb/ivoolve-flow:print_socket .
#sudo docker push programandoweb/ivoolve-flow:print_socket
#sudo docker pull programandoweb/ivoolve-flow:print_socket
#sudo docker run -d --name print_socket -p3021:3021 --restart=always programandoweb/ivoolve-flow:print_socket
#sudo docker stop print_socket
#sudo docker rm print_socket
