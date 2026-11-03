
# Prebuilt pg_textsearch .deb from the GitHub release: no compiler toolchain needed.
# ponytail: amd64 only; switch the zip name to -arm64 if the VM ever runs ARM.
FROM alpine:3.20 AS fetch
ADD --checksum=sha256:ed4410e8b6879a8971cd87fd03853f182e47b85b199c9bfcd9b34f159caba9fb \
    https://github.com/timescale/pg_textsearch/releases/download/v1.5.1/pg-textsearch-v1.5.1-pg17-amd64.zip /pgts.zip
RUN unzip /pgts.zip -d /pgts

FROM pgvector/pgvector:pg17
COPY --from=fetch /pgts/*.deb /tmp/
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends /tmp/*.deb \
    && rm -rf /tmp/*.deb /var/lib/apt/lists/*
