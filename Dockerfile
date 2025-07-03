ARG SHARP_VERSION

FROM docker.io/oven/bun:1.2.18-alpine as base
WORKDIR /voel

FROM base as builder
COPY . /voel
ENV NODE_ENV=production
RUN bun install --filter './apps/server' --frozen-lockfile
RUN bun build --compile --minify --target bun --format esm --sourcemap --external sharp --outfile /voel-server /voel/apps/server/src/index.ts
RUN mkdir -p /sharp && cd /sharp && bun install sharp@$SHARP_VERSION

FROM docker.io/alpine:3.22

RUN apk --no-cache add libgcc libstdc++ & addgroup -g 1000 voel && adduser -u 1000 -G voel -D voel

COPY --from=builder /voel-server /voel-server
COPY --from=builder /sharp/node_modules /node_modules/
COPY --from=docker.io/mwader/static-ffmpeg:latest /ffprobe /usr/local/bin/

ENV PATH="/usr/local/bin:${PATH}"
ENV NODE_ENV=production

USER voel
EXPOSE 3000/tcp
ENTRYPOINT [ "/voel-server" ]
