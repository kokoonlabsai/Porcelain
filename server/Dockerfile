# Clinic API — stateless; data (including photos) lives in Turso (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY src src
COPY scripts scripts
EXPOSE 8080
CMD ["node", "src/index.js"]
