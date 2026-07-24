# Build context is the repo root (see docker-compose.yml) so this can also
# read ../.env/webui.env -- vite.config.ts loads it at build time to bake
# VITE_-prefixed values into the browser bundle (there's no runtime env for
# a static build, so this has to happen at image build time, not container
# start).
FROM node:22-alpine AS build
WORKDIR /app
COPY webUI/package.json webUI/package-lock.json* ./webUI/
RUN npm install --prefix webUI
COPY webUI ./webUI
COPY .env/webui.env ./.env/webui.env
WORKDIR /app/webUI
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/webUI/dist /usr/share/nginx/html
COPY webUI/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
