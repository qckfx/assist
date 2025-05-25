# /docker/Dockerfile
FROM node:18-alpine

# Install essential tools for command execution, including xxd for binary operations
RUN apk add --no-cache bash curl git vim-common

# Set up a non-root user for better security
WORKDIR /app

# Copy utility scripts - do this as root before switching to agent user
COPY scripts/binary-replace.sh /usr/local/bin/binary-replace.sh
COPY scripts/directory-mapper.sh /usr/local/bin/directory-mapper.sh
RUN chmod +x /usr/local/bin/binary-replace.sh && \
    chmod +x /usr/local/bin/directory-mapper.sh 

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:/usr/local/bin:${PATH}"

# Use bash as the default shell
# SHELL ["/bin/bash", "-c"]

# Configure git to trust workspace directory
RUN git config --global --add safe.directory /workspace

RUN mkdir -p /home/user/projects
