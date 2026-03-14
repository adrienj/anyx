FROM node:20-alpine

RUN apk add --no-cache bubblewrap

WORKDIR /app

# Install MCP dependencies (preserve directory structure for ../shared/ imports)
COPY mcp/package.json mcp/package-lock.json ./mcp/
RUN cd mcp && npm ci --omit=dev

# Copy shared modules and MCP server
COPY shared/ ./shared/
COPY mcp/server.js ./mcp/

# Non-root user with writable cache directory
RUN addgroup -S npxall && adduser -S npxall -G npxall \
  && mkdir -p /app/cache \
  && chown -R npxall:npxall /app

USER npxall

EXPOSE 3001

CMD ["node", "mcp/server.js"]
