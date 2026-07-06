FROM node:24-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:24-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-alpine AS build-env
ARG VITE_PUBLIC_POSTHOG_TOKEN
ARG VITE_PUBLIC_POSTHOG_HOST
ENV VITE_PUBLIC_POSTHOG_TOKEN=$VITE_PUBLIC_POSTHOG_TOKEN
ENV VITE_PUBLIC_POSTHOG_HOST=$VITE_PUBLIC_POSTHOG_HOST
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:24-alpine
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
EXPOSE 10000
COPY ./package.json package-lock.json /app/
# Migrations run at boot from ./drizzle
COPY ./drizzle /app/drizzle
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
VOLUME ["/app/data"]
CMD ["npm", "run", "start"]
