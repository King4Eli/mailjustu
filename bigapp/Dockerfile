FROM node:22-alpine AS build-webmail
WORKDIR /app/webmail
COPY webmail/package.json webmail/package-lock.json* ./
RUN npm install
COPY webmail/. .
RUN npm run build

FROM node:22-alpine AS build-admin
WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json* ./
RUN npm install
COPY admin/. .
RUN npm run build

FROM nginx:alpine
COPY --from=build-webmail /app/webmail/dist /usr/share/nginx/html/webmail
COPY --from=build-admin /app/admin/dist /usr/share/nginx/html/admin
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
