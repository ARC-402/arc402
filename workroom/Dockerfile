FROM node:22-slim

# Runtime dependencies for network enforcement + diagnostics
RUN apt-get update && apt-get install -y --no-install-recommends \
    iptables curl dnsutils iproute2 procps jq \
    && rm -rf /var/lib/apt/lists/*

# Create workroom user with the same UID/GID as the host user (default: 1000).
# This ensures bind-mounted volumes are readable/writable without permission fights.
# Override at build time: docker build --build-arg HOST_UID=1001 --build-arg HOST_GID=1001
ARG HOST_UID=1000
ARG HOST_GID=1000
# node:22-slim already has a 'node' user at UID 1000. Rename it to 'workroom'
# so the container user matches the host user (bind mount permissions).
RUN usermod -l workroom -d /workroom -m node \
    && groupmod -n workroom node \
    && usermod -u ${HOST_UID} workroom 2>/dev/null || true \
    && groupmod -g ${HOST_GID} workroom 2>/dev/null || true

# Workroom scripts
COPY entrypoint.sh /entrypoint.sh
COPY dns-refresh.sh /dns-refresh.sh
COPY policy-parser.sh /policy-parser.sh
RUN chmod +x /entrypoint.sh /dns-refresh.sh /policy-parser.sh

# Job workspace directory
RUN mkdir -p /workroom/jobs && chown workroom:workroom /workroom/jobs

# Arena directories — feed index, profile cache, daemon state, approval queue
RUN mkdir -p /workroom/arena/{feed,profile,state,queue} \
    && chown -R workroom:workroom /workroom/arena

# Default arena policy (can be overridden by mount)
COPY arena-policy.yaml /workroom/defaults/arena-policy.yaml

WORKDIR /workroom
ENTRYPOINT ["/entrypoint.sh"]
