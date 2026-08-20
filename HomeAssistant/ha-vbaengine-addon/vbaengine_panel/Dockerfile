ARG BUILD_FROM=node:20-alpine
FROM ${BUILD_FROM}

WORKDIR /app
COPY server.js ./
COPY www ./www

# Ingress port the supervisor proxies to (matches config.yaml ingress_port).
ENV INGRESS_PORT=8099
EXPOSE 8099

CMD ["node", "server.js"]
