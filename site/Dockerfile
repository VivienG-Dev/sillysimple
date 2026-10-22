# The pages are prerendered at build time; the small Nitro server serves them and sends the
# contact form (server/api/contact.post.ts).

# ---- Build stage -----------------------------------------------------------
FROM node:24.22.1-bookworm AS build

# The same pnpm as "packageManager" in package.json.
RUN npm install -g pnpm@11.24.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Nuxt's build tools sit in devDependencies, so they are installed even when the platform
# sets NODE_ENV=production.
RUN pnpm install --frozen-lockfile --prod=false

COPY . .

# nuxt build, then scripts/sitemap.mjs writes sitemap.xml and robots.txt into .output/public.
RUN pnpm run build

# ---- Runtime stage ---------------------------------------------------------
# Everything the server needs is in .output: no pnpm, no node_modules.
FROM node:24.22.1-bookworm-slim AS runtime

# The SMTP settings are read here, when the server starts, not at build time:
# NUXT_SMTP_USER, NUXT_SMTP_PASS (and NUXT_CONTACT_TO if needed) in Coolify.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app

COPY --from=build --chown=node:node /app/.output ./.output

USER node

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
