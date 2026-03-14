FROM node:20-alpine

RUN apk add --no-cache bubblewrap

WORKDIR /app

# Install MCP dependencies (preserve directory structure for ../shared/ imports)
COPY mcp/package.json mcp/package-lock.json ./mcp/
RUN cd mcp && npm ci --omit=dev

# Copy shared modules and MCP server
COPY shared/ ./shared/
COPY mcp/server.js ./mcp/

# Writable cache directory
# Runs as root so bwrap has CAP_SYS_ADMIN for namespace isolation.
# Docker provides the outer security boundary; bwrap provides per-request sandboxing.
RUN mkdir -p /app/cache

EXPOSE 3001

CMD ["node", "mcp/server.js"]
