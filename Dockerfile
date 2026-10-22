FROM node:22-alpine AS builder

WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time placeholders. Runtime values come from Docker Compose.
ENV DATABASE_URL="mysql://optimizer:optimizer@mysql:3306/api_optimizer"
ENV REDIS_URL="redis://redis:6379"
ENV ADMIN_PASSWORD="build-only"
ENV SESSION_SECRET="build-only-secret-at-least-32-characters"
ENV USE_REAL_AWS="false"

RUN npm run db:generate
RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV="production"

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts

USER node

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:seed && npm run start"]