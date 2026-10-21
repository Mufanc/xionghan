const path = require('node:path');
const { Server, FlatFile } = require('boardgame.io/server');
const { gameConfig } = require('@xionghan/core/boardgame');

const port = Number(process.env.PORT ?? 8000);
const origins = (process.env.WEB_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());

if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535');
}

class RoomStore extends FlatFile {
    pending = new Set();
    metadata = new Map();

    async fetch(matchID, opts) {
        const result = await super.fetch(matchID, opts);

        if (opts.metadata && result.metadata) {
            if (!this.metadata.has(matchID)) this.metadata.set(matchID, result.metadata);
            result.metadata = this.metadata.get(matchID);
        }

        return result;
    }

    async wipe(matchID) {
        await super.wipe(matchID);
        this.metadata.delete(matchID);
    }

    async track(write) {
        this.pending.add(write);

        try {
            return await write;
        } finally {
            this.pending.delete(write);
        }
    }

    setState(...args) {
        return this.track(super.setState(...args));
    }
    setMetadata(matchID, metadata) {
        // bgio 的连接回调会并发读改元数据，保留共享引用，避免彼此覆盖在线状态。
        this.metadata.set(matchID, metadata);
        return this.track(super.setMetadata(matchID, metadata));
    }

    async flush() {
        while (this.pending.size) await Promise.all([...this.pending]);
    }

    async connect() {
        await super.connect();

        for (const matchID of await this.listMatches()) {
            const { metadata } = await this.fetch(matchID, { metadata: true });

            for (const player of Object.values(metadata.players)) {
                player.isConnected = false;
            }

            await this.setMetadata(matchID, metadata);
        }
    }
}

const db = new RoomStore({ dir: process.env.DATA_DIR ?? path.join(__dirname, 'data') });
const server = Server({ games: [gameConfig], origins, db });
const requests = new Map();

// 单实例内串行处理同一房间的入座、离开和改名，避免并发抢到同一个座位。
server.app.use(async (ctx, next) => {
    const match = /^\/games\/XiongHan\/([\w-]+)\/(join|leave|update|rename|playAgain)$/.exec(
        ctx.path,
    );

    if (ctx.method !== 'POST' || !match) return next();

    const key = match[1];
    const previous = requests.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
        release = resolve;
    });

    requests.set(key, current);
    await previous;

    try {
        await next();
    } finally {
        release();
        if (requests.get(key) === current) requests.delete(key);
    }
});

server
    .run(port)
    .then((handles) => {
        let stopping = false;
        const stop = async () => {
            if (stopping) return;
            stopping = true;
            server.kill(handles);

            try {
                await db.flush();
                process.exit(0);
            } catch (error) {
                console.error(error);
                process.exit(1);
            }
        };

        process.once('SIGTERM', stop);
        process.once('SIGINT', stop);
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
