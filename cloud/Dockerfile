FROM node:22-bookworm-slim
WORKDIR /app
COPY server.mjs ./
COPY public ./public
USER node
ENV PORT=8080
CMD ["node","server.mjs"]
