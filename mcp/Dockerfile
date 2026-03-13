FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js .

RUN addgroup -S npxall && adduser -S npxall -G npxall \
  && mkdir -p /app/cache \
  && chown -R npxall:npxall /app

USER npxall

EXPOSE 3001

CMD ["node", "server.js"]
