import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '@xionghan/core/game';
import { GameRecord } from '@xionghan/core/record';
import { Board } from '@xionghan/core/board';
import { Side } from '@xionghan/core/piece';
import { encodeBoard, searchRequest, type SearchRequest } from './protocol';

async function choose(request: SearchRequest): Promise<number> {
    const { instance } = await WebAssembly.instantiate(
        readFileSync(new URL('./engine.wasm', import.meta.url)),
        {
            env: {
                now_ms: () => performance.now(),
                cell: (position: number, square: number) => request.positions[position][square],
            },
        },
    );
    return (instance.exports.choose as (ms: number, black: number, positions: number) => number)(
        request.milliseconds,
        Number(request.side === Side.Black),
        request.positions.length,
    );
}

it('runs the shipped WASM and returns a legal opening move for both sides', async () => {
    const state = Game.initialState();
    state.record = GameRecord.create(state).data;
    for (const side of [Side.Red, Side.Black]) {
        const packed = await choose(searchRequest(state, side, 30));
        expect(packed).toBeGreaterThan(0);
        const from = Math.floor((packed - 1) / 169);
        const to = (packed - 1) % 169;
        expect(state.board[from]?.side).toBe(side);
        expect(new Game(state).findLegalMoves(from)).toContain(to);
        state.record.moves.push({
            from,
            to,
            side,
            name: GameRecord.describe(state.board, from, to),
        });
        expect(new Game(state).tryMove(from, to, side)).toBe(true);
    }
    expect(searchRequest(state, Side.Red).positions).toHaveLength(3);
    expect(searchRequest(state, Side.Red).positions.at(-1)).toEqual(encodeBoard(state.board));
});

it('passes the complete repetition history to WASM', async () => {
    const state = Game.initialState();
    state.record = GameRecord.create(state).data;
    for (let cycle = 0; cycle < 2; cycle++) {
        for (const [side, y, toY] of [
            [Side.Red, 12, 11],
            [Side.Black, 0, 1],
            [Side.Red, 11, 12],
            [Side.Black, 1, 0],
        ] as const) {
            const from = Board.indexOf(2, y);
            const to = Board.indexOf(2, toY);
            state.record.moves.push({
                from,
                to,
                side,
                name: GameRecord.describe(state.board, from, to),
            });
            expect(new Game(state).tryMove(from, to, side)).toBe(true);
        }
    }
    expect(await choose(searchRequest(state, Side.Red, 30))).toBe(0);
});

it('rejects a mismatched record instead of searching a different board', () => {
    const state = Game.initialState();
    state.record = GameRecord.create(state).data;
    state.board[0] = null;
    expect(() => searchRequest(state, Side.Red)).toThrow('棋谱与当前局面不一致');
});
