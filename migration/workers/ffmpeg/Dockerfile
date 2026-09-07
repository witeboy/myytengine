# ffmpeg worker container.
#
# Two stages so the shipped image carries no Go toolchain. Image size drives cold start,
# and Cloudflare Containers bill per second — a smaller image is directly cheaper.
#
#   build stage   ~350MB  (discarded)
#   final image   ~85MB   (alpine + ffmpeg + one static binary)

FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
# CGO off gives a fully static binary, so the final stage needs no libc compatibility.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server .

FROM alpine:3.20
# ffmpeg brings ffprobe with it; both are used.
RUN apk add --no-cache ffmpeg ca-certificates
COPY --from=build /out/server /usr/local/bin/server

# Run unprivileged. The process only needs to write to its own temp dirs.
RUN adduser -D -u 10001 worker
USER worker

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["server"]
