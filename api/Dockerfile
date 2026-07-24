# Build context is the repo root (see docker-compose.yml) so this can also
# copy in ./schema.sql.
FROM node:22-alpine
WORKDIR /app
COPY api/package.json api/package-lock.json* ./
RUN npm install --omit=dev
COPY api/src ./src
COPY api/scripts ./scripts
COPY schema.sql /schema.sql
ENV NODE_ENV=production
EXPOSE 80
CMD ["node", "src/index.js"]
