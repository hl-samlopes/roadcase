# One image for both Railway services: the web app (`npm run start`) and the
# background worker (`npm run worker`). Each service sets its own start
# command in its Railway settings (see docs/DEPLOY.md).

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# Runs `prisma generate` (postinstall); no database is needed for that.
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app
# The worker runs the TypeScript in src/ directly with Node, so the source ships too.
COPY --from=build /app/package.json /app/package-lock.json /app/prisma.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/railway ./railway
COPY --from=build /app/src ./src
COPY --from=build /app/next.config.ts /app/tsconfig.json ./
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
