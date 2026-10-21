const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require('boardgame.io/client');
const { SocketIO } = require('boardgame.io/multiplayer');
const { gameConfig } = require('@xionghan/core/boardgame');
const { Board } = require('@xionghan/core/board');

async function start(dir) {
    const child = spawn(process.execPath, [path.join(__dirname, 'index.cjs')], {
        env: { ...process.env, PORT: '0', DATA_DIR: dir },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    const port = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error(logs));
        }, 10000);
        const consume = (chunk) => {
            logs += chunk;
            const match = /App serving on (\d+)/.exec(logs);
            if (match) {
                clearTimeout(timeout);
                resolve(Number(match[1]));
            }
        };
        child.stdout.on('data', consume);
        child.stderr.on('data', consume);
        child.once('exit', () => {
            clearTimeout(timeout);
            reject(new Error(logs));
        });
    });

    return {
        base: `http://127.0.0.1:${port}`,
        async stop() {
            if (child.exitCode !== null || child.signalCode !== null) return;
            child.kill();
            await once(child, 'exit');
        },
    };
}

async function waitFor(check) {
    for (let i = 0; i < 200; i++) {
        if (check()) return;
        await delay(25);
    }

    throw new Error('Timed out waiting for game synchronization');
}

async function post(base, route, body) {
    return fetch(`${base}/games/XiongHan${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function connect(base, matchID, seat) {
    const client = Client({
        game: gameConfig,
        multiplayer: SocketIO({ server: base }),
        matchID,
        playerID: seat.playerID,
        credentials: seat.playerCredentials,
        debug: false,
    });
    client.start();

    return client;
}

test(
    'rooms authenticate seats, serialize concurrent joins, synchronize and survive server restart',
    { timeout: 20000 },
    async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'xionghan-rooms-'));
        let server;
        let clients = [];

        try {
            server = await start(dir);
            const invalid = await post(server.base, '/create', { numPlayers: 3 });
            assert.equal(invalid.status, 400);
            const { matchID } = await (
                await post(server.base, '/create', { numPlayers: 2, unlisted: true })
            ).json();
            const requests = await Promise.all([
                post(server.base, `/${matchID}/join`, { playerID: '0', playerName: '红方一' }),
                post(server.base, `/${matchID}/join`, { playerID: '0', playerName: '红方二' }),
            ]);
            assert.deepEqual(requests.map((response) => response.status).sort(), [200, 409]);
            const red = await requests.find((response) => response.status === 200).json();
            const black = await (
                await post(server.base, `/${matchID}/join`, { playerID: '1', playerName: '黑方' })
            ).json();
            assert.equal(
                (
                    await post(server.base, `/${matchID}/update`, {
                        playerID: '0',
                        credentials: 'wrong',
                        newName: '冒名',
                    })
                ).status,
                403,
            );
            const metadata = await (await fetch(`${server.base}/games/XiongHan/${matchID}`)).json();
            assert.equal(JSON.stringify(metadata).includes(red.playerCredentials), false);
            assert.deepEqual(
                (await (await fetch(`${server.base}/games/XiongHan`)).json()).matches,
                [],
            );
            clients = [connect(server.base, matchID, red), connect(server.base, matchID, black)];
            await waitFor(() =>
                clients.every(
                    (client) =>
                        client.getState()?.isConnected &&
                        client.matchData?.every((player) => player.isConnected),
                ),
            );
            clients[0].moves.move(Board.indexOf(2, 8), Board.indexOf(2, 5));
            await waitFor(() =>
                clients.every((client) => client.getState()?.G.record?.moves.length === 1),
            );
            clients[1].moves.move(Board.indexOf(2, 4), Board.indexOf(2, 5));
            await waitFor(() =>
                clients.every((client) => client.getState()?.G.record?.moves.length === 2),
            );
            const saved = clients[0].getState().G;
            assert.deepEqual(saved, clients[1].getState().G);
            for (const client of clients) client.stop();
            clients = [];
            await server.stop();
            server = await start(dir);
            const restored = await (await fetch(`${server.base}/games/XiongHan/${matchID}`)).json();
            assert(restored.players.every((player) => player.isConnected === false));
            clients = [connect(server.base, matchID, red), connect(server.base, matchID, black)];
            await waitFor(() =>
                clients.every((client) => client.getState()?.G.record?.moves.length === 2),
            );
            assert.deepEqual(clients[0].getState().G, saved);
            assert.deepEqual(clients[1].getState().G, saved);
            clients[0].moves.move(Board.indexOf(4, 8), Board.indexOf(4, 5));
            await waitFor(() =>
                clients.every((client) => client.getState()?.G.record?.moves.length === 3),
            );
        } finally {
            for (const client of clients) client.stop();
            await server?.stop();
            await rm(dir, { recursive: true, force: true });
        }
    },
);
