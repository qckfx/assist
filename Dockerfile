# Dockerfile for qckfx web server
FROM node:18-alpine as build

# Install essential tools 
RUN apk add --no-cache bash curl git

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build:complete

# Production stage
FROM node:18-alpine as production

# Install essential tools
RUN apk add --no-cache bash curl git

# Set up a non-root user for better security
RUN addgroup -S qckfx && adduser -S qckfx -G qckfx
WORKDIR /app
RUN chown -R qckfx:qckfx /app

# Copy built files and dependencies from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# Copy docker directory and scripts
COPY --from=build /app/docker ./docker
COPY --from=build /app/scripts ./scripts

# Make script files executable
RUN find ./scripts -name "*.sh" -exec chmod +x {} \; || true
RUN find ./docker -name "*.sh" -exec chmod +x {} \; || true

# Ensure proper permissions
RUN chown -R qckfx:qckfx ./docker ./scripts

# Switch to non-root user
USER qckfx

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the web server port
EXPOSE 3000

# Start the web server
CMD ["node", "dist/server/index.js", "--port", "3000"]