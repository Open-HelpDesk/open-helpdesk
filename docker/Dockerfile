# syntax=docker/dockerfile:1
# Images de production auto-hébergées — trois cibles sur une base commune :
#   web     : Next.js standalone (image mince, serveur tracé sur le monorepo)
#   worker  : jobs BullMQ (tsx sur les sources, comme en développement)
#   migrate : one-shot — migrations Drizzle + RLS (+ workspace de démo si SEED_DEMO=true)
# Contexte de build : la racine du dépôt (voir docker/docker-compose.prod.yml).

FROM node:22-alpine AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN NEXT_OUTPUT=standalone pnpm --filter @openhelpdesk/web build

# ---------- web : serveur standalone ----------
FROM node:22-alpine AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ---------- worker : BullMQ sur les sources ----------
FROM build AS worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@openhelpdesk/worker", "start"]

# ---------- migrate : migrations + RLS (+ seed de démo) ----------
FROM build AS migrate
CMD ["sh", "-c", "pnpm --filter @openhelpdesk/db db:migrate && pnpm --filter @openhelpdesk/db db:rls && if [ \"$SEED_DEMO\" = \"true\" ]; then pnpm db:seed && pnpm db:seed:auth; fi"]
