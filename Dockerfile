FROM node:22-alpine AS base

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --no-audit

COPY . .

EXPOSE 4000

CMD ["npm", "run", "start:dev"]
