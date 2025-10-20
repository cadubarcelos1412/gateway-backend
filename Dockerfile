# Imagem base com Node.js
FROM node:18

# Define diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependências e instala
COPY package*.json ./
RUN npm install

# Copia o restante do código
COPY . .

# Compila o TypeScript
RUN npm run build

# Expõe a porta do servidor
EXPOSE 3000

# Comando para rodar o servidor
CMD ["node", "dist/server.js"]
