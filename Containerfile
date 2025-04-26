FROM oven/bun:1 as bun
WORKDIR /src

FROM bun AS install
COPY . .
RUN bun install --frozen-lockfile
RUN bun build apps/server/src/index.ts --compile --minify --bytecode --sourcemap --target=bun-linux-x64-baseline --outfile /voel-server

FROM scratch
COPY --from=install /voel-server /voel-server
COPY --from=mwader/static-ffmpeg:latest /ffprobe /usr/local/bin/

USER 1001:1001
EXPOSE 3000/tcp
ENTRYPOINT [ "/voel-server" ]
