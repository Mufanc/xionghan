const path = require('node:path');
const { Server, FlatFile, SocketIO } = require('boardgame.io/server');
const { gameConfig } = require('@xionghan/core/boardgame');
const { RoomLimits, clientIP } = require('./limits.cjs');

const port = Number(process.env.PORT ?? 8000);
const origins = (process.env.WEB_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());

if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535');
}

function positiveInteger(name, fallback) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1)
        throw new Error(`${name} must be a positive integer`);
    return value;
}

const limits = new RoomLimits({
    maxRooms: positiveInteger('MAX_ROOMS', 500),
    createLimit: positiveInteger('CREATE_RATE_LIMIT', 5),
});
const trustedProxies = new Set(
    (process.env.TRUST_PROXY_IPS ?? '127.0.0.1,::1,::ffff:127.0.0.1')
        .split(',')
        .map((ip) => ip.trim()),
);

class RoomStore extends FlatFile {
    pending = new Set();
    metadata = new Map();
    creating = new Set();
    deleting = new Set();
    writes = new Map();
    creationQueue = Promise.resolve();
    sweeping = null;
    ready = false;

    async createMatch(matchID, options) {
        const previous = this.creationQueue;
        let release;
        this.creationQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;

        try {
            if (this.metadata.size >= limits.maxRooms) await this.sweep();

            if (this.metadata.size >= limits.maxRooms) {
                const error = new Error('服务器房间数量已达上限，请稍后再试。');
                error.status = 503;
                error.expose = true;
                throw error;
            }

            this.creating.add(matchID);
            await super.createMatch(matchID, options);
        } finally {
            this.creating.delete(matchID);
            release();
        }
    }

    sweep() {
        if (this.sweeping) return this.sweeping;

        this.sweeping = (async () => {
            limits.prune();

            for (const [matchID, metadata] of this.metadata) {
                if (limits.expired(metadata)) await this.wipe(matchID);
            }
        })().finally(() => {
            this.sweeping = null;
        });

        return this.sweeping;
    }

    async fetch(matchID, opts) {
        if (this.deleting.has(matchID)) return {};

        const result = await super.fetch(matchID, opts);

        if (
            this.deleting.has(matchID) ||
            (this.ready && !this.metadata.has(matchID) && !this.creating.has(matchID))
        )
            return {};

        if (opts.metadata && result.metadata) {
            if (!this.metadata.has(matchID)) this.metadata.set(matchID, result.metadata);
            result.metadata = this.metadata.get(matchID);
        }

        return result;
    }

    async wipe(matchID) {
        this.deleting.add(matchID);

        try {
            await Promise.all([...(this.writes.get(matchID) ?? [])]);
            await super.wipe(matchID);
            this.metadata.delete(matchID);
            // bgio 0.50.2 的 FlatFile 不会释放已删除房间的内部请求队列。
            for (const key of [
                matchID,
                `${matchID}:initial`,
                `${matchID}:metadata`,
                `${matchID}:log`,
            ])
                delete this.fileQueues[key];
        } finally {
            this.deleting.delete(matchID);
        }
    }

    async track(write, matchID) {
        const writes = this.writes.get(matchID) ?? new Set();
        writes.add(write);
        this.writes.set(matchID, writes);
        this.pending.add(write);

        try {
            return await write;
        } finally {
            this.pending.delete(write);
            writes.delete(write);
            if (!writes.size) this.writes.delete(matchID);
        }
    }

    setState(matchID, ...args) {
        if (
            this.deleting.has(matchID) ||
            (this.ready && !this.metadata.has(matchID) && !this.creating.has(matchID))
        )
            return Promise.resolve();
        return this.track(super.setState(matchID, ...args), matchID);
    }
    setMetadata(matchID, metadata) {
        if (
            this.deleting.has(matchID) ||
            (this.ready && !this.metadata.has(matchID) && !this.creating.has(matchID))
        )
            return Promise.resolve();
        limits.annotate(metadata, this.metadata.get(matchID));

        // bgio 的连接回调会并发读改元数据，保留共享引用，避免彼此覆盖在线状态。
        this.metadata.set(matchID, metadata);
        return this.track(super.setMetadata(matchID, metadata), matchID);
    }

    async flush() {
        while (this.pending.size) await Promise.all([...this.pending]);
    }

    async connect() {
        await super.connect();

        const resets = [];

        for (const matchID of await this.listMatches()) {
            const { metadata } = await this.fetch(matchID, { metadata: true });

            for (const player of Object.values(metadata.players)) {
                player.isConnected = false;
            }

            resets.push(this.setMetadata(matchID, metadata));
        }

        await Promise.all(resets);
        this.ready = true;
        await this.sweep();
    }
}

const db = new RoomStore({ dir: process.env.DATA_DIR ?? path.join(__dirname, 'data') });
const server = Server({
    games: [gameConfig],
    origins,
    db,
    transport: new SocketIO({ socketOpts: { maxHttpBufferSize: 65536 } }),
    authenticateCredentials: (credentials, player) =>
        typeof credentials === 'string' &&
        !!player?.credentials &&
        credentials === player.credentials,
});
const namespace = server.app._io.of(gameConfig.name);
const connections = new Map();

namespace.use((socket, next) => {
    const ip = clientIP(
        { req: socket.request, get: (name) => String(socket.request.headers[name] ?? '') },
        trustedProxies,
    );
    const count = connections.get(ip) ?? 0;

    if (
        count >= 20 ||
        namespace.sockets.size >= limits.maxRooms * 4 ||
        limits.admit(ip, 'connect')
    ) {
        return next(new Error('Too many connections'));
    }

    connections.set(ip, count + 1);
    const deadline = setTimeout(() => socket.disconnect(true), 10000);
    let seat = null;

    socket.once('disconnect', () => {
        clearTimeout(deadline);
        const remaining = connections.get(ip) - 1;
        if (remaining) connections.set(ip, remaining);
        else connections.delete(ip);
    });
    socket.use(async ([event, ...args], proceed) => {
        try {
            if (limits.admit(ip, 'socket')) return socket.disconnect(true);

            if (event === 'sync') {
                const [matchID, playerID, credentials] = args;

                if (
                    typeof matchID !== 'string' ||
                    !/^[\w-]{1,128}$/.test(matchID) ||
                    !['0', '1'].includes(playerID) ||
                    typeof credentials !== 'string'
                )
                    return socket.disconnect(true);

                const { metadata } = await db.fetch(matchID, { metadata: true });
                const player = metadata?.players[playerID];

                // bgio 会在 sync 时按需建房；只允许已入座玩家同步，封堵绕过 HTTP 限流的入口。
                if (!player?.credentials || player.credentials !== credentials)
                    return socket.disconnect(true);

                seat = { matchID, playerID };
                clearTimeout(deadline);
            } else if (
                !seat ||
                (event === 'update' && (args[2] !== seat.matchID || args[3] !== seat.playerID)) ||
                (event === 'chat' && args[0] !== seat.matchID)
            ) {
                return socket.disconnect(true);
            }

            proceed();
        } catch (error) {
            console.error('连接校验失败', error);
            socket.disconnect(true);
        }
    });
    next();
});

const requests = new Map();

// 单实例内串行处理同一房间的入座、离开和改名，避免并发抢到同一个座位。
server.app.use(async (ctx, next) => {
    if (ctx.path === '/games' || ctx.path.startsWith('/games/')) {
        const ip = clientIP(ctx, trustedProxies);
        const create = ctx.method === 'POST' && /\/(create|playAgain)\/?$/.test(ctx.path);
        const retry = limits.admit(ip, 'api') || (create && limits.admit(ip, 'create'));

        if (retry) {
            ctx.status = 429;
            ctx.set('Retry-After', String(retry));
            const origin = ctx.get('origin');

            if (origins.includes(origin)) {
                ctx.set('Access-Control-Allow-Origin', origin);
                ctx.vary('Origin');
            }

            ctx.body = { error: '请求过于频繁，请稍后再试。' };
            return;
        }
    }

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

let stopping = false;
// 启动和退出时保留事件循环，避免存储库的 unref 写入队列尚未落盘就退出。
const timer = setInterval(() => {
    if (db.ready && !stopping)
        void db.sweep().catch((error) => console.error('无法清理过期房间', error));
}, 60000);

server
    .run(port)
    .then((handles) => {
        timer.unref();
        const stop = async () => {
            if (stopping) return;
            stopping = true;
            timer.ref();
            server.kill(handles);

            try {
                await db.sweeping;
                await db.flush();
                clearInterval(timer);
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
        clearInterval(timer);
        console.error(error);
        process.exitCode = 1;
    });
