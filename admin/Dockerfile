# Build context is the repo root (see docker-compose.yml) so this can also
# read ../.env/admin.env -- vite.config.js loads it at build time to bake
# VITE_-prefixed values into the browser bundle (there's no runtime env for
# a static build, so this has to happen at image build time, not container
# start).
FROM node:22-alpine AS build
WORKDIR /app
COPY admin/package.json admin/package-lock.json* ./admin/
RUN npm install --prefix admin
COPY admin ./admin
COPY .env/admin.env ./.env/admin.env
WORKDIR /app/admin
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/admin/dist /usr/share/nginx/html
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
