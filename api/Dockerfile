FROM node:20-alpine

WORKDIR /app

# Install npm packages
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server
COPY server.js .

# Create cache dir and non-root user
RUN addgroup -S npxall && adduser -S npxall -G npxall \
  && mkdir -p /app/cache \
  && chown -R npxall:npxall /app

USER npxall

EXPOSE 3000

CMD ["node", "server.js"]
