# SweK rendezvous — Cloud Run / container image. Same server.js also runs bare on a VM (node server.js).
FROM node:20-alpine
WORKDIR /app
COPY package.json server.js board.html ./
# Cloud Run injects PORT=8080; the server honors $PORT (falls back to 8787 on a VM).
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
