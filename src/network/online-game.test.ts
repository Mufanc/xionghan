import { describe, expect, it } from 'vitest';
import { OnlineGame } from '@/network/online-game';
import { Board } from '@/core/board';
import { RandomBot } from 'boardgame.io/ai';
import { gameConfig } from '@/adapters/boardgame';
import { parseRoom } from '@/network/peer-room';

const p = Board.indexOf;

function pair() {
    const messages: [OnlineGame, unknown][] = [];
    const red = new OnlineGame(
        '0',
        (value) => messages.push([black, structuredClone(value)]),
        () => {},
    );
    const black = new OnlineGame(
        '1',
        (value) => messages.push([red, structuredClone(value)]),
        () => {},
    );
    const flush = () => {
        while (messages.length) {
            const [receiver, message] = messages.shift()!;
            expect(receiver.receive(message)).toBe(true);
        }
    };
    red.connect();
    black.connect();
    flush();
    return { red, black, flush, messages };
}

describe('WebRTC game protocol', () => {
    it('validates invitation links and IDs', () => {
        const id = `xh-${'a'.repeat(32)}`;
        expect(parseRoom(id)).toBe(id);
        expect(parseRoom(`https://example.com/?room=${id}`)).toBe(id);
        expect(parseRoom('javascript:alert(1)')).toBeNull();
        expect(parseRoom('invalid')).toBeNull();
    });

    it('synchronizes both turns through bgio and blocks out-of-turn moves', () => {
        const { red, black, flush } = pair();
        black.move(p(2, 4), p(2, 5));
        expect(black.state.G.lastMove).toBeNull();
        red.move(p(2, 8), p(2, 5));
        expect(red.ready).toBe(false);
        flush();
        expect(black.state.G).toEqual(red.state.G);
        black.move(p(4, 4), p(4, 7));
        expect(black.ready).toBe(false);
        expect(black.state.G.record?.moves).toHaveLength(1);
        flush();
        expect(black.state.G).toEqual(red.state.G);
        expect(red.state.ctx.currentPlayer).toBe('0');
        expect(red.state.G.record?.moves).toHaveLength(2);
        expect(red.ready && black.ready).toBe(true);
    });

    it('rejects illegal, forged, duplicate, and stale moves without changing state', () => {
        const { red, black, flush } = pair();
        red.move(p(2, 8), p(2, 5));
        flush();
        const state = red.state.G;
        for (const message of [
            { type: 'move', step: 0, from: p(4, 4), to: p(4, 7) },
            { type: 'move', step: 1, from: p(4, 8), to: p(4, 5) },
            { type: 'move', step: 1, from: p(4, 4), to: p(5, 4) },
            { type: 'move', step: 1, from: -1, to: 0 },
            { type: 'move', step: 1, from: '56', to: 95 },
            { type: 'history', moves: [] },
            { type: 'hello', version: 2 },
            null,
        ])
            expect(red.receive(message)).toBe(false);
        expect(red.state.G).toBe(state);
        black.move(p(4, 4), p(4, 7));
        flush();
        expect(red.receive({ type: 'move', step: 1, from: p(4, 4), to: p(4, 7) })).toBe(false);
    });

    it('checks an entire history before applying it and never rewrites known moves', () => {
        const { red, black, flush } = pair();
        expect(
            black.receive({
                type: 'history',
                moves: [
                    [p(2, 8), p(2, 5)],
                    [-1, 0],
                ],
            }),
        ).toBe(false);
        expect(black.state.G.lastMove).toBeNull();
        expect(
            black.receive({
                type: 'history',
                moves: [
                    [p(2, 8), p(2, 5)],
                    [p(4, 4), p(5, 4)],
                ],
            }),
        ).toBe(false);
        expect(black.state.G.lastMove).toBeNull();
        red.move(p(2, 8), p(2, 5));
        flush();
        expect(black.receive({ type: 'history', moves: [] })).toBe(false);
        expect(black.receive({ type: 'history', moves: [[p(4, 8), p(4, 5)]] })).toBe(false);
        expect(
            black.receive({
                type: 'history',
                moves: [
                    [p(2, 8), p(2, 5)],
                    [p(4, 4), p(4, 7)],
                ],
            }),
        ).toBe(false);
        expect(black.state.G).toEqual(red.state.G);
    });

    it('recovers a move delivered to the host just before a disconnection', () => {
        const { red, black, flush, messages } = pair();
        red.move(p(2, 8), p(2, 5));
        flush();
        black.move(p(4, 4), p(4, 7));
        const [receiver, request] = messages.shift()!;
        expect(receiver.receive(request)).toBe(true);
        messages.length = 0;
        red.disconnect();
        black.disconnect();
        red.move(p(6, 8), p(6, 5));
        expect(red.state.G.record?.moves).toHaveLength(2);
        red.connect();
        black.connect();
        flush();
        expect(black.state.G).toEqual(red.state.G);
        expect(black.state.G.record?.moves).toHaveLength(2);
        expect(red.ready && black.ready).toBe(true);
    });

    it('keeps long random play, captures, records and terminal state identical', async () => {
        const { red, black, flush } = pair();
        const bot = new RandomBot({ enumerate: gameConfig.ai!.enumerate, seed: 'random-6' });
        for (let step = 0; step < 500 && !red.state.ctx.gameover; step++) {
            const current = red.state.ctx.currentPlayer === '0' ? red : black;
            const state = current.state;
            const { action } = await bot.play(state, state.ctx.currentPlayer);
            const [from, to] = action.payload.args;
            current.move(from, to);
            flush();
            expect(black.state.G).toEqual(red.state.G);
            expect(black.state.ctx.gameover).toEqual(red.state.ctx.gameover);
        }
        expect(red.state.G.record!.moves.length).toBeGreaterThan(50);
        expect(red.state.ctx.gameover).toBeDefined();
        const final = red.state.G;
        red.move(p(6, 8), p(6, 5));
        black.move(p(4, 4), p(4, 7));
        expect(red.state.G).toBe(final);
        expect(black.state.G).toEqual(final);
    }, 60000);
});
