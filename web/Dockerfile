FROM node:22-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY . .
RUN npm run build

FROM node:22-slim AS runtime

ENV NODE_ENV=production
ENV WRANGLER_LOG_PATH=/tmp/wrangler.log
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
# vinext's production `start` command is currently packaged as a build-time
# dependency, so retain the immutable installed tree while running built output.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/data ./data
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/cells?limit=1').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["./node_modules/.bin/vinext", "start", "--hostname", "0.0.0.0", "--port", "3000"]
