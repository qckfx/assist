FROM node:22.13.1

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    # Install GitHub CLI and utilities required by helper scripts
    && apt-get install -y --no-install-recommends \
        gh \
        vim-common \
        bash \
        curl \
        git \
        # Tools required by E2B for creating filesystem snapshots
        zip \
        unzip \
        tar \
        # Additional utilities required by the scripts
        coreutils \
        findutils \
        grep \
        sed \
        gawk \
        procps \
        rsync \
        zstd \
    # Clean up apt cache to reduce image size
    && rm -rf /var/lib/apt/lists/*

# Configure git user
RUN git config --system user.email "qckfx@qckfx.com" && \
    git config --system user.name "qckfx"

# Set up a non-root user for better security
WORKDIR /app

# Copy utility scripts - do this as root before switching to agent user
COPY scripts/binary-replace.sh /usr/local/bin/binary-replace.sh
COPY scripts/directory-mapper.sh /usr/local/bin/directory-mapper.sh
# Snapshot helper used by the @qckfx/agent CheckpointManager
COPY scripts/snapshot.sh /usr/local/bin/snapshot.sh
RUN chmod +x /usr/local/bin/binary-replace.sh && \
    chmod +x /usr/local/bin/directory-mapper.sh
RUN chmod +x /usr/local/bin/snapshot.sh

# Configure git to trust workspace directory
RUN git config --global --add safe.directory /workspace

RUN mkdir -p /home/user/projects
