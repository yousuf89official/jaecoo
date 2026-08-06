FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV JAECOO_LOCAL_PORT=4173
ENV JAECOO_LOCAL_HOST=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api
COPY --from=builder /app/db ./db
COPY --from=builder /app/ingestion ./ingestion
COPY --from=builder /app/scripts ./scripts
EXPOSE 4173
CMD ["node", "scripts/local-runtime.ts"]
