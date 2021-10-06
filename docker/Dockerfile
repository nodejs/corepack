FROM alpine:3.10

RUN apk add --no-cache tar xz libstdc++

RUN mkdir -p /opt/node && mkdir -p /opt/corepack

RUN wget https://unofficial-builds.nodejs.org/download/release/v14.2.0/node-v14.2.0-linux-x64-musl.tar.xz -O - | tar -xJ --strip-components=1 -C /opt/node && ls -l /opt/node

RUN rm -rf /opt/node/lib /opt/node/bin/npm /opt/node/bin/npx

ENV PATH="/opt/node/bin:$PATH"
RUN which node && node --version

RUN wget https://github.com/nodejs/corepack/archive/master.tar.gz -O - | tar -xz --strip-components=1 -C /opt/corepack && cd /opt/corepack && node ./.yarn/releases/yarn-*.js build

ENV PATH="/opt/corepack/shims:$PATH"
