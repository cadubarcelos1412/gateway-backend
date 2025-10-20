# 🏗️ Etapa 1 - Build da aplicação
FROM node:18 AS build

WORKDIR /app

# Copia apenas os arquivos essenciais primeiro (para aproveitar cache)
COPY package*.json tsconfig.json ./

# Instala dependências
RUN npm install

# Copia o restante do código
COPY . .

# Compila o TypeScript
RUN npm run build

# 🚀 Etapa 2 - Ambiente de Produção
FROM node:18

WORKDIR /app

# Copia a build gerada da primeira etapa
COPY --from=build /app .

# Expõe a porta da aplicação
EXPOSE 3000

# Comando de inicialização
CMD ["npm", "start"]
