import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import test from 'node:test';

test(
    'serves PeerJS IDs and forwards signaling between two clients',
    { timeout: 10000 },
    async (t) => {
        const { scripts } = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
        const args = scripts.start.split(' ').slice(2);
        const probe = createServer().listen(0, '127.0.0.1');
        await once(probe, 'listening');
        args[args.indexOf('--port') + 1] = String(probe.address().port);
        await new Promise((resolve) => probe.close(resolve));
        args[args.indexOf('--host') + 1] = '127.0.0.1';
        const child = spawn(process.execPath, ['node_modules/peer/dist/bin/peerjs.js', ...args], {
            cwd: new URL('.', import.meta.url),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        t.after(() => child.kill('SIGKILL'));
        const port = await new Promise((resolve, reject) => {
            let output = '';
            child.once('error', reject);
            child.once('exit', (code) => reject(new Error(`PeerServer exited with ${code}`)));
            child.stdout.on('data', (data) => {
                output += data;
                const match = output.match(/port: (\d+)/);
                if (match) resolve(Number(match[1]));
            });
            child.stderr.on('data', (data) => reject(new Error(String(data))));
        });
        const base = `http://127.0.0.1:${port}/peerjs`;
        const info = await fetch(base);
        assert.equal(info.status, 200);
        assert.equal((await info.json()).name, 'PeerJS Server');
        const id = await fetch(`${base}/peerjs/id`).then((response) => response.text());
        assert.match(id, /^[\da-f-]{36}$/i);
        assert.equal((await fetch(`${base}/peerjs/peers`)).status, 401);

        const alice = new WebSocket(
            `${base.replace('http:', 'ws:')}/peerjs?key=peerjs&id=alice&token=a`,
        );
        const bob = new WebSocket(
            `${base.replace('http:', 'ws:')}/peerjs?key=peerjs&id=bob&token=b`,
        );
        t.after(() => {
            alice.close();
            bob.close();
        });
        const opened = await Promise.all([once(alice, 'message'), once(bob, 'message')]);
        assert.deepEqual(
            opened.map(([event]) => JSON.parse(event.data).type),
            ['OPEN', 'OPEN'],
        );
        const received = once(bob, 'message');
        alice.send(JSON.stringify({ type: 'OFFER', dst: 'bob', payload: { sdp: 'test-offer' } }));
        const [event] = await received;
        const offer = JSON.parse(event.data);
        assert.equal(offer.type, 'OFFER');
        assert.equal(offer.src, 'alice');
        assert.equal(offer.dst, 'bob');
        assert.equal(offer.payload.sdp, 'test-offer');
    },
);
