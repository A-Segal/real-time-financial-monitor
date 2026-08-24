# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY . .

# VITE_API_URL is no longer a build-time ARG for Docker images.
# The container resolves the backend URL at runtime via an environment
# variable (VITE_API_URL) injected into config.js by docker-entrypoint.sh.
#
# During development (npm run dev), VITE_API_URL can still be set to
# override the Vite dev-server proxy target.
#
# Build-time VITE_API_URL is left empty so the same image works with
# any backend URL supplied at container runtime.
ENV VITE_API_URL=
RUN npm run build

# Runtime stage: serve built files with nginx
FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
