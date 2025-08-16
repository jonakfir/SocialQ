# Use Node 22 on Debian slim
FROM node:22-bullseye-slim

# Create app dir
WORKDIR /app

# Copy only manifests first for better caching
COPY package*.json ./

# (Optional but recommended) system deps so native modules can build
# better-sqlite3 needs python, make, g++
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

# Now copy the rest of the backend source
COPY . .

ENV NODE_ENV=production
# Railway will inject PORT – make sure your server uses it
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
