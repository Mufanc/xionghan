const assert = require('node:assert/strict');
const { test } = require('node:test');
const { RoomLimits, clientIP } = require('./limits.cjs');

function metadata(names = 0) {
    return {
        createdAt: 0,
        players: {
            0: { id: 0, ...(names > 0 && { name: 'red' }) },
            1: { id: 1, ...(names > 1 && { name: 'black' }) },
        },
    };
}

test('rate limits create attempts and API requests independently and releases expired IP buckets', () => {
    let now = 0;
    const limits = new RoomLimits({}, () => now);
    for (let i = 0; i < 5; i++) assert.equal(limits.admit('ip-a', 'create'), 0);
    assert.equal(limits.admit('ip-a', 'create'), 600);
    assert.equal(limits.admit('ip-b', 'create'), 0);
    for (let i = 0; i < 120; i++) assert.equal(limits.admit('ip-a', 'api'), 0);
    assert.equal(limits.admit('ip-a', 'api'), 60);
    now = 600000;
    limits.prune();
    assert.equal(limits.buckets.size, 0);
    assert.equal(limits.admit('ip-a', 'create'), 0);
    for (let i = 0; i < 11000; i++) limits.admit(`new-ip-${i}`, 'api');
    assert(limits.buckets.size <= 10000);
});

test('expires unfinished rooms at different deadlines, but skips online rooms', () => {
    let now = 0;
    const limits = new RoomLimits({}, () => now);
    for (const [names, ttl] of [
        [0, 600000],
        [1, 900000],
        [2, 1800000],
    ]) {
        now = 0;
        const room = metadata(names);
        limits.annotate(room);
        now = ttl - 1;
        assert.equal(limits.expired(room), false);
        now++;
        assert.equal(limits.expired(room), true);
        room.players[0].isConnected = true;
        limits.annotate(room, room);
        assert.equal(limits.expired(room), false);
        room.players[0].isConnected = false;
        limits.annotate(room, room);
        if (names > 0) assert.equal(limits.expired(room), false);
    }
});

test('disconnect grace is not extended by offline metadata updates or restart', () => {
    let now = 1000;
    const limits = new RoomLimits({}, () => now);
    const room = metadata(2);
    room.players[0].isConnected = true;
    limits.annotate(room);
    now = 5000;
    room.players[0].isConnected = false;
    limits.annotate(room, room);
    assert.equal(room.roomOfflineAt, 5000);
    now = 10000;
    limits.annotate(room, room);
    assert.equal(room.roomOfflineAt, 5000);
    now = 1805000;
    assert.equal(limits.expired(room), true);
});

test('does not trust forged forwarded IPs from direct public connections', () => {
    const trusted = new Set(['127.0.0.1']);
    const ctx = (peer, header) => ({ req: { socket: { remoteAddress: peer } }, get: () => header });
    assert.equal(clientIP(ctx('203.0.113.1', '1.2.3.4'), trusted), '203.0.113.1');
    assert.equal(clientIP(ctx('127.0.0.1', 'forged, 203.0.113.1'), trusted), '203.0.113.1');
    assert.equal(clientIP(ctx('127.0.0.1', 'invalid'), trusted), '127.0.0.1');
});

test('finished rooms expire 24 hours after completion regardless of connections or restart', () => {
    let now = 1000;
    const limits = new RoomLimits({}, () => now);
    const room = { ...metadata(2), gameover: { winner: 'RED' } };
    room.players[0].isConnected = true;
    limits.annotate(room);
    assert.equal(room.roomFinishedAt, 1000);
    now += 3600000;
    room.players[0].isConnected = false;
    limits.annotate(room, room);
    assert.equal(room.roomFinishedAt, 1000);
    const restored = JSON.parse(JSON.stringify(room));
    limits.annotate(restored);
    now = 1000 + 86400000 - 1;
    restored.players[0].isConnected = true;
    limits.annotate(restored, restored);
    assert.equal(limits.expired(restored), false);
    now++;
    assert.equal(limits.expired(restored), true);
    restored.players[0].isConnected = false;
    limits.annotate(restored, restored);
    assert.equal(limits.expired(restored), true);
    assert.equal(restored.roomFinishedAt, 1000);
});
