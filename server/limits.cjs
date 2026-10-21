const { isIP } = require('node:net');

class RoomLimits {
    buckets = new Map();
    lastPrune = -Infinity;

    constructor({ maxRooms = 500, createLimit = 5 } = {}, now = Date.now) {
        this.maxRooms = maxRooms;
        this.createLimit = createLimit;
        this.now = now;
    }

    admit(ip, kind) {
        const now = this.now();
        const window = kind === 'create' ? 600000 : 60000;
        const limit = kind === 'create' ? this.createLimit : 120;
        const key = `${kind}:${ip}`;
        let bucket = this.buckets.get(key);

        if (!bucket || bucket.until <= now) {
            if (this.buckets.size >= 10000) this.prune();
            if (!bucket && this.buckets.size >= 10000) return 60;
            bucket = { count: 0, until: now + window };
            this.buckets.set(key, bucket);
        }

        if (bucket.count >= limit) return Math.ceil((bucket.until - now) / 1000);
        bucket.count++;

        return 0;
    }

    prune() {
        const now = this.now();
        if (now - this.lastPrune < 60000) return;
        this.lastPrune = now;

        for (const [key, bucket] of this.buckets) {
            if (bucket.until <= now) this.buckets.delete(key);
        }
    }

    annotate(metadata, previous) {
        const now = this.now();
        const online = Object.values(metadata.players).some((player) => player.isConnected);

        if (online) delete metadata.roomOfflineAt;
        else metadata.roomOfflineAt = previous?.roomOfflineAt ?? metadata.roomOfflineAt ?? now;

        if (metadata.gameover) {
            metadata.roomFinishedAt = previous?.roomFinishedAt ?? metadata.roomFinishedAt ?? now;
        }
    }

    expired(metadata) {
        if (metadata.gameover) {
            return this.now() - (metadata.roomFinishedAt ?? this.now()) >= 86400000;
        }

        const players = Object.values(metadata.players);
        if (players.some((player) => player.isConnected)) return false;

        const joined = players.filter((player) => player.name).length;
        const offlineAt = metadata.roomOfflineAt ?? this.now();
        const since = Math.max(metadata.createdAt, offlineAt);
        const ttl = joined === 0 ? 600000 : joined < 2 ? 900000 : 1800000;
        const reference = joined === 0 ? metadata.createdAt : since;

        return this.now() - reference >= ttl;
    }
}

function clientIP(ctx, trustedProxies) {
    const peer = ctx.req.socket.remoteAddress ?? 'unknown';
    const forwarded = ctx.get('x-forwarded-for').split(',').at(-1).trim();

    return trustedProxies.has(peer) && isIP(forwarded) ? forwarded : peer;
}

module.exports = { RoomLimits, clientIP };
