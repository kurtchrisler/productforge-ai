# --- Build stage ---
FROM node:22-bookworm AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage ---
FROM node:22-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# Installs Chromium plus the OS-level libraries it needs to render PDFs
# (fonts, graphics libs, etc.) — --with-deps handles all of that via apt.
RUN npx playwright install --with-deps chromium

# Local SQLite database + generated PDFs live here; mount this as a volume
# (see docker-compose.yml) so data survives container rebuilds.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
