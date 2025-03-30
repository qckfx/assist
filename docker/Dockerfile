# /docker/Dockerfile
FROM node:18-alpine

# Install essential tools for command execution
RUN apk add --no-cache bash curl git

# Set up a non-root user for better security
RUN addgroup -S agent && adduser -S agent -G agent
WORKDIR /workspace
RUN chown -R agent:agent /workspace

# Switch to non-root user
USER agent

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/workspace/node_modules/.bin:${PATH}"

# Use bash as the default shell
SHELL ["/bin/bash", "-c"]

# Keep container running
CMD ["tail", "-f", "/dev/null"]