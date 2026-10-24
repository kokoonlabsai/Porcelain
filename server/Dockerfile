# Clinic API — stateless; data (including photos) lives in MongoDB (set MONGODB_URI, e.g. an Atlas connection string).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY src src
COPY scripts scripts
EXPOSE 8080
CMD ["node", "src/index.js"]
