FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

# Production: use server.js. For health-check isolation, use: CMD ["node", "server-minimal.js"]
CMD ["node", "server.js"]
