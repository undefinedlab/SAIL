# Standalone AXL HTTP bridge for Railway (or any host). SAIL backend sets AXL_BRIDGE_URL to this service.
# Railway: create a second service, Root Directory = `deploy/axl`, expose HTTP.

FROM golang:1.25-bookworm AS build
WORKDIR /src
RUN git clone --depth 1 https://github.com/gensyn-ai/axl.git .
ARG GOTOOLCHAIN=auto
ENV GOTOOLCHAIN=${GOTOOLCHAIN}
RUN go build -o /out/node ./cmd/node/

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /out/node ./node
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh ./node

ENV PORT=9002
EXPOSE 9002

ENTRYPOINT ["./entrypoint.sh"]
