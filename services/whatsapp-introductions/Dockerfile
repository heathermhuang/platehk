FROM node:22.22.2-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium \
    DATA_DIR=/home/node/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts ./scripts
RUN npm ci --omit=dev

COPY --chown=node:node src ./src
RUN mkdir -p /home/node/data && chown node:node /home/node/data

USER node
EXPOSE 10000
CMD ["npm", "start"]
