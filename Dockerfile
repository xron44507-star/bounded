FROM node:22-bookworm-slim

# Install ffmpeg and ca-certificates for audio streaming
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY . .

# Environment
ENV NODE_ENV=production

# Expose port for health checks if assigned
EXPOSE 3000

# Start command
CMD ["node", "index.js"]
