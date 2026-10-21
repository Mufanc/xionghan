import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { gameConfig, gameFromSession } from '@xionghan/core/boardgame';
import { Board } from '@xionghan/core/board';
import { Kind, Side } from '@xionghan/core/piece';
import { GameRecord } from '@xionghan/core/record';
import { parseRecord, serializeRecord } from './record-file';

const p = Board.indexOf;
const played = () => {
    const client = Client({ game: gameConfig });
    client.moves.move(p(2, 8), p(2, 5));
    client.moves.move(p(2, 4), p(2, 5));
    return client.getState()!;
};

describe('record files', () => {
    it('round trips captures and reconstructs every position without preferences or credentials', () => {
        const state = played();
        const text = serializeRecord(state.G, state.ctx.currentPlayer);
        const restored = parseRecord(text);
        expect(restored).toEqual({ game: state.G, currentPlayer: state.ctx.currentPlayer });
        expect(Object.keys(JSON.parse(text)).sort()).toEqual([
            'currentPlayer',
            'format',
            'game',
            'version',
        ]);
        const record = new GameRecord(restored.game.record!);
        expect(record.stateAt(1).board[p(2, 5)]?.side).toBe(Side.Red);
        expect(record.stateAt(2).board[p(2, 5)]?.side).toBe(Side.Black);
    });

    it('exports an empty new game and legacy records starting from a played position', () => {
        const fresh = Client({ game: gameConfig }).getState()!;
        expect(parseRecord(serializeRecord(fresh.G, '0')).game.record!.moves).toEqual([]);
        const legacy = structuredClone(played().G);
        delete legacy.record;
        expect(parseRecord(serializeRecord(legacy, '0')).game.board).toEqual(legacy.board);
        const client = Client({ game: gameFromSession(legacy, '0') });
        client.moves.move(p(4, 8), p(4, 5));
        const state = client.getState()!;
        expect(parseRecord(serializeRecord(state.G, state.ctx.currentPlayer)).game).toEqual(
            state.G,
        );
    });

    it('preserves custom starting positions and a finished game', () => {
        const board = Array(Board.SIZE ** 2).fill(null);
        board[p(6, 11)] = { side: Side.Red, kind: Kind.King };
        board[p(6, 1)] = { side: Side.Black, kind: Kind.King };
        board[p(5, 3)] = { side: Side.Red, kind: Kind.Chariot };
        board[p(7, 2)] = { side: Side.Red, kind: Kind.Pawn };
        board[p(6, 3)] = { side: Side.Red, kind: Kind.Pawn };
        board[p(4, 2)] = { side: Side.Red, kind: Kind.Chariot };
        const client = Client({
            game: { ...gameConfig, setup: () => ({ board, lastMove: null }) },
        });
        client.moves.move(p(4, 2), p(6, 2));
        const state = client.getState()!;
        expect(state.ctx.gameover).toEqual({ winner: Side.Red });
        const imported = parseRecord(serializeRecord(state.G, state.ctx.currentPlayer));
        const restored = Client({ game: gameFromSession(imported.game, imported.currentPlayer) });
        expect(restored.getState()!.ctx.gameover).toEqual(state.ctx.gameover);
    });

    it('rejects unsupported, oversized, malformed and tampered records', () => {
        for (const text of [
            '{',
            'null',
            '{}',
            JSON.stringify({ format: 'xionghan-record', version: 2 }),
            ' '.repeat(10 * 1024 * 1024 + 1),
        ]) {
            expect(() => parseRecord(text)).toThrow();
        }
        const state = played();
        const original = serializeRecord(state.G, state.ctx.currentPlayer);
        const edits = [
            (file: any) => {
                file.game.record.moves[0].to = -1;
            },
            (file: any) => {
                file.game.record.moves[1].side = Side.Red;
            },
            (file: any) => {
                file.game.record.moves[0].name = '伪造';
            },
            (file: any) => {
                file.game.board[p(4, 8)] = null;
            },
            (file: any) => {
                file.game.record.initial.board[p(6, 1)] = null;
            },
            (file: any) => {
                file.game.record.initial.lastMove = { from: -1, to: 999 };
            },
            (file: any) => {
                file.currentPlayer = '1';
            },
            (file: any) => {
                file.game.record.moves = Array(20001).fill(null);
            },
        ];
        for (const edit of edits) {
            const file = JSON.parse(original);
            edit(file);
            expect(() => parseRecord(JSON.stringify(file))).toThrow();
        }
        expect(state.G.record!.moves).toHaveLength(2);
    });
});
