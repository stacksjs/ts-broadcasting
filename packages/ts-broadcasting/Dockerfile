# Dockerfile for ts-broadcasting server
FROM oven/bun:1.3.1 as base
WORKDIR /app

# Install dependencies
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Copy production dependencies
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build stage
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Build the application
RUN bun run build

# Production stage
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/package.json .

# Expose ports
EXPOSE 6001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:6001/health || exit 1

# Run the server
USER bun
CMD ["bun", "run", "dist/bin/cli.js", "start"]
