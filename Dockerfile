# Etapa 1 – build da aplicação
FROM node:18 AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 2 – imagem final de produção
FROM node:18-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/docs ./docs
COPY package*.json ./
RUN npm ci --omit=dev

EXPOSE 3000
CMD ["node", "dist/server.js"]
