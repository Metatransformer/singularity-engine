FROM node:20-slim

WORKDIR /app

# Install only what we need
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy runner code
COPY package.json run.mjs ./
COPY shared/ ./shared/

RUN npm install --production

# Create output directory
RUN mkdir -p /output

# Non-root user for extra isolation
RUN useradd -m runner
USER runner

# No network access to host, no volume mounts
# These are enforced at the ECS/Docker level, not here

ENTRYPOINT ["node", "run.mjs"]
