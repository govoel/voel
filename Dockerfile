ARG SHARP_VERSION

FROM docker.io/oven/bun:1.2.11 as base
WORKDIR /voel

FROM base as builder
COPY . /voel
RUN bun install --frozen-lockfile
RUN bun build --compile --minify --target bun --bytecode --sourcemap --external sharp --outfile /voel-server /voel/apps/server/src/index.ts
RUN mkdir -p /sharp && cd /sharp && bun install sharp@$SHARP_VERSION

FROM scratch
COPY --from=builder /voel-server /voel-server
COPY --from=builder /sharp/node_modules /node_modules/
COPY --from=docker.io/mwader/static-ffmpeg:latest /ffprobe /usr/local/bin/

ENV PATH="/usr/local/bin:${PATH}"
ENV NODE_ENV=production

EXPOSE 3000/tcp
ENTRYPOINT [ "/voel-server" ]
