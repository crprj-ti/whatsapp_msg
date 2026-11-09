FROM node:20

# Define o diretório de trabalho do servidor
WORKDIR /app

# Instala os pacotes do seu projeto
COPY package*.json ./
RUN npm install

# Copia todo o resto do seu código
COPY . .

# Expõe a porta que o Render vai usar
EXPOSE 3000

# Comando para iniciar sua API
CMD ["npm", "start"]
