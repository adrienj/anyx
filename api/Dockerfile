FROM node:20-alpine

RUN apk add --no-cache bubblewrap

WORKDIR /app

# Install API dependencies (preserve directory structure for ../shared/ imports)
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --omit=dev

# Copy shared modules and API server
COPY shared/ ./shared/
COPY api/server.js ./api/

# Non-root user with writable cache directory
RUN addgroup -S npxall && adduser -S npxall -G npxall \
  && mkdir -p /app/cache \
  && chown -R npxall:npxall /app

USER npxall

EXPOSE 3000

CMD ["node", "api/server.js"]
