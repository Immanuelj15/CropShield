# CropShield frontend: Vite build served by nginx, which also reverse-proxies /api and
# /uploads to the backend so the SPA can use same-origin relative URLs (no CORS needed).
# Build from the repo root (docker-compose does this):
#   docker build -f deploy/frontend.Dockerfile -t cropshield-web .
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Leave VITE_API_BASE_URL empty: the bundle then calls relative /api/v1/... on this origin.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
