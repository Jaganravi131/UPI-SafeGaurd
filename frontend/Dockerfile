# ── UPI SafeGuard — Frontend Dockerfile ────────────────────────────────────
# Stage 1: build the React/Vite app
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (uses package-lock.json for deterministic installs)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
# VITE_API_BASE_URL can be injected at build time via --build-arg
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: serve static assets with nginx
FROM nginx:alpine

# Remove default nginx static assets and config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy built assets from stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config (handles SPA client-side routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
