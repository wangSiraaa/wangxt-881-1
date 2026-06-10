FROM node:20-alpine AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend/src ./src

FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=backend /app/backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
RUN mkdir -p /app/backend/uploads /app/backend/data
EXPOSE 3000
CMD ["node", "backend/src/server.js"]
