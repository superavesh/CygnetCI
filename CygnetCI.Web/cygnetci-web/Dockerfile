# ---- Stage 1: build the static export ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# next.config.ts has output:'export' -> produces static files in ./out
RUN npm run build

# ---- Stage 2: serve with nginx ----
FROM nginx:alpine
# Static site
COPY --from=build /app/out /usr/share/nginx/html
# SPA/static routing config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# system.config.js (API URL) is overridden at runtime via a mounted ConfigMap at
# /usr/share/nginx/html/system.config.js  — no rebuild needed to repoint the API.

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
