FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 80
ENV PORT=80
# `next start` binds to $HOSTNAME, and Docker sets HOSTNAME to the
# container ID for every container -- without this override it binds to
# one specific interface IP instead of all of them, and refuses connections
# from outside (including the published port). Confirmed by testing.
ENV HOSTNAME=0.0.0.0
CMD ["npm", "start"]
