FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/uploads && chown -R node:node /app
EXPOSE 3001
USER node
CMD ["sh", "-c", "node scripts/runMigrations.js && node index.js"]
