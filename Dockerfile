FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:latest AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/ ./src/
COPY tsconfig.build.json ./

RUN npx tsc -p tsconfig.build.json

FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:latest

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY src/prompts ./src/prompts

EXPOSE 8080

CMD ["node", "dist/runtime.js"]
