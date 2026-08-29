# syntax=docker/dockerfile:1
# Self-hosted production images — three targets on a shared base:
#   web     : standalone Next.js (slim image, server traced over the monorepo)
#   worker  : BullMQ jobs (tsx over the sources, as in development)
#   migrate : one-shot — Drizzle migrations + RLS (+ demo workspace if SEED_DEMO=true)
# Build context: the repository root (see docker/docker-compose.prod.yml).

FROM node:22-alpine AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN NEXT_OUTPUT=standalone pnpm --filter @openhelpdesk/web build

# ---------- web: standalone server ----------
FROM node:22-alpine AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# `public/` is NOT part of the standalone output — Next expects the image to
# carry it. Without this line the sixteen self-hosted woff2 answer 404 and every
# screen silently falls back to system fonts, and so does the favicon. Nothing
# fails loudly; the product simply stops looking like itself.
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ---------- worker: BullMQ over the sources ----------
FROM build AS worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@openhelpdesk/worker", "start"]

# ---------- migrate: migrations + RLS (+ demo seed) ----------
FROM build AS migrate
CMD ["sh", "-c", "pnpm --filter @openhelpdesk/db db:migrate && pnpm --filter @openhelpdesk/db db:rls && if [ \"$SEED_DEMO\" = \"true\" ]; then pnpm db:seed && pnpm db:seed:auth; fi"]
