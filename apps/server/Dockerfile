# Dev-oriented image: includes Prisma CLI for migrations.

FROM node:18-bullseye-slim AS build

# Prisma engines require OpenSSL
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (workspaces)
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

# Copy sources
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web

# Avoid CRLF issues on Windows checkouts
RUN sed -i 's/\r$//' apps/server/docker-entrypoint.sh

# Generate Prisma client (needs schema). Prisma requires DATABASE_URL to be set
# even though generate itself does not connect to the database.
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/workflow?schema=public" \
	npm --prefix apps/server run prisma:generate

# Build shared + server + web
RUN npm run build -w packages/shared
RUN npm run build -w apps/server
RUN npm run build -w apps/web


FROM node:18-bullseye-slim

# Prisma engines require OpenSSL
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=development

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json

COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/docker-entrypoint.sh ./apps/server/docker-entrypoint.sh

COPY --from=build /app/packages/shared ./packages/shared

COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3000

CMD ["sh", "./apps/server/docker-entrypoint.sh"]
