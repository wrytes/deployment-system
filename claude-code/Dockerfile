FROM node:22-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential git curl wget ca-certificates gnupg \
    docker.io \
    python3 python3-pip python3-venv \
    golang \
    jq vim nano openssh-client tar gzip zip unzip \
    && rm -rf /var/lib/apt/lists/*

# Create workspace
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Install Claude Code CLI
# TODO: Install actual Claude Code CLI when available
RUN npm install -g typescript ts-node @nestjs/cli prisma

# Install common packages
RUN npm install -g eslint prettier
RUN pip3 install --break-system-packages --no-cache-dir requests flask fastapi uvicorn pytest black

# Create non-root user
RUN groupadd -g 1001 claude && \
    useradd -u 1001 -g claude -s /bin/bash -m claude

# MCP config directory
RUN mkdir -p /home/claude/.config/claude && \
    chown -R claude:claude /home/claude

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER claude
WORKDIR /workspace

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://backend:3000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sleep", "infinity"]
