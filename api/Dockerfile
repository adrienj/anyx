FROM node:20-alpine

RUN apk add --no-cache bubblewrap

WORKDIR /app

# Install API dependencies (preserve directory structure for ../shared/ imports)
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --omit=dev

# Copy shared modules and API server
COPY shared/ ./shared/
COPY api/server.js ./api/

# Writable cache directory
# Runs as root so bwrap has CAP_SYS_ADMIN for namespace isolation.
# Docker provides the outer security boundary; bwrap provides per-request sandboxing.
RUN mkdir -p /app/cache

EXPOSE 3000

CMD ["node", "api/server.js"]
