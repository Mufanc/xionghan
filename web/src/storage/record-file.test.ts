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

// xh-chess.new v1 exports the board and side at turn zero, even with a full history.
const legacyFile = () => ({
    version: 1,
    data: {
        board: {
            '89': { color: 'R', type: 'King', x: 6, y: 11, name: '皇', id: 'RK6B' },
            '79': { color: 'B', type: 'King', x: 6, y: 1, name: '單', id: 'BK61' },
            '84': { color: 'R', type: 'Pawn', x: 6, y: 6, name: '兵', id: 'RP66' },
            '34': { color: 'R', type: 'Pawn', x: 2, y: 8, name: '兵', id: 'RP28' },
            '30': { color: 'B', type: 'Pawn', x: 2, y: 4, name: '卒', id: 'BP24' },
        },
        current: 'R',
        history: [
            { from: { x: 2, y: 8 }, to: { x: 2, y: 5 }, name: '兵C进3' },
            {
                from: { x: 2, y: 4 },
                to: { x: 2, y: 5 },
                name: '卒C进1',
                capture: { color: 'R', type: 'Pawn', x: 2, y: 5, name: '兵', id: 'RP28' },
            },
        ],
    },
});

describe('record files', () => {
    it('imports legacy coordinates, captures and custom starting positions into the current format', () => {
        const file = legacyFile();
        file.data.history[0].name = '旧版记谱文字';
        const imported = parseRecord(JSON.stringify(file));
        const record = new GameRecord(imported.game.record!);
        expect(imported.currentPlayer).toBe('0');
        expect(record.data.initial.lastMove).toBeNull();
        expect(record.data.initial.board[p(2, 8)]).toEqual({ side: Side.Red, kind: Kind.Pawn });
        expect(record.stateAt(1).board[p(2, 5)]).toEqual({ side: Side.Red, kind: Kind.Pawn });
        expect(imported.game.board[p(2, 5)]).toEqual({ side: Side.Black, kind: Kind.Pawn });
        expect(imported.game.lastMove).toEqual({ from: p(2, 4), to: p(2, 5) });
        expect(record.data.moves.map((move) => move.name)).toEqual(['兵C进3', '卒C进1']);
        const text = serializeRecord(imported.game, imported.currentPlayer);
        expect(JSON.parse(text).format).toBe('xionghan-record');
        expect(parseRecord(text)).toEqual(imported);
    });

    it('imports empty legacy records and black-first games', () => {
        const file = legacyFile();
        file.data.current = 'B';
        file.data.history = [];
        expect(parseRecord(JSON.stringify(file)).currentPlayer).toBe('1');
        file.data.history.push({ from: { x: 2, y: 4 }, to: { x: 2, y: 5 }, name: '卒C进1' });
        const imported = parseRecord(JSON.stringify(file));
        expect(imported.currentPlayer).toBe('0');
        expect(imported.game.record!.moves[0].side).toBe(Side.Black);
    });

    it('maps every legacy piece type and preserves the default starting board', () => {
        const pairs = [
            ['King', 6, 1],
            ['Advisor', 5, 1],
            ['Elephant', 4, 1],
            ['Horse', 3, 1],
            ['Chariot', 2, 0],
            ['Cannon', 1, 3],
            ['Train', 0, 0],
            ['Guard', 0, 5],
            ['Catapult', 4, 0],
        ] as const;
        const board: Record<string, object> = {};
        for (const color of ['R', 'B']) {
            const put = (type: string, x: number, homeY: number) => {
                const y = color === 'R' ? 12 - homeY : homeY;
                board[x * 13 + y] = { color, type, x, y };
            };
            for (const [type, x, y] of pairs) {
                put(type, x, y);
                if (x !== 6) put(type, 12 - x, y);
            }
            for (const x of [2, 4, 6, 8, 10]) put('Pawn', x, 4);
        }
        const imported = parseRecord(
            JSON.stringify({ version: 1, data: { board, current: 'R', history: [] } }),
        );
        expect(imported.game.board).toEqual(new Board().data);
    });

    it('recomputes a finished legacy game and rejects moves after game over', () => {
        const file = {
            version: 1,
            data: {
                board: {
                    '89': { color: 'R', type: 'King', x: 6, y: 11 },
                    '79': { color: 'B', type: 'King', x: 6, y: 1 },
                    '68': { color: 'R', type: 'Chariot', x: 5, y: 3 },
                    '93': { color: 'R', type: 'Pawn', x: 7, y: 2 },
                    '81': { color: 'R', type: 'Pawn', x: 6, y: 3 },
                    '54': { color: 'R', type: 'Chariot', x: 4, y: 2 },
                },
                current: 'R',
                result: { type: 'checkmate', color: 'R' },
                history: [{ from: { x: 4, y: 2 }, to: { x: 6, y: 2 }, name: '車E平G' }],
            },
        };
        const imported = parseRecord(JSON.stringify(file));
        const client = Client({ game: gameFromSession(imported.game, imported.currentPlayer) });
        expect(client.getState()!.ctx.gameover).toEqual({ winner: Side.Red });
        file.data.history.push({ from: { x: 6, y: 1 }, to: { x: 5, y: 1 }, name: '單G平F' });
        expect(() => parseRecord(JSON.stringify(file))).toThrow('第 2 手');
    });

    it('rejects malformed legacy data and identifies the first invalid move', () => {
        const edits = [
            (file: any) => {
                file.version = 2;
            },
            (file: any) => {
                file.format = 'unknown';
            },
            (file: any) => {
                file.data = null;
            },
            (file: any) => {
                file.data.board = [];
            },
            (file: any) => {
                file.data.current = ['R'];
            },
            (file: any) => {
                file.data.turn = 1;
            },
            (file: any) => {
                file.data.history = {};
            },
            (file: any) => {
                file.data.history = Array(20001).fill(null);
            },
            (file: any) => {
                file.data.board['34'].color = 'RED';
            },
            (file: any) => {
                file.data.board['34'].type = '__proto__';
            },
            (file: any) => {
                file.data.board['34'].x = 2.5;
            },
            (file: any) => {
                file.data.board['34'].y = 13;
            },
            (file: any) => {
                file.data.board['35'] = file.data.board['34'];
            },
            (file: any) => {
                delete file.data.board['79'];
            },
            (file: any) => {
                delete file.data.board['84'];
            },
        ];
        for (const edit of edits) {
            const file = legacyFile();
            edit(file);
            expect(() => parseRecord(JSON.stringify(file))).toThrow();
        }
        for (const move of [
            null,
            {},
            { from: { x: 2, y: 4 }, to: { x: 2, y: 5 } },
            { from: { x: 2, y: 8 }, to: { x: 3, y: 8 } },
            { from: { x: 2, y: 8 }, to: { x: -1, y: 5 } },
        ]) {
            const file = legacyFile();
            (file.data.history as unknown[])[0] = move;
            expect(() => parseRecord(JSON.stringify(file))).toThrow('第 1 手');
        }
        const file = legacyFile();
        file.data.history[1].from = { x: 2, y: 5 };
        expect(() => parseRecord(JSON.stringify(file))).toThrow('第 2 手');
    });

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
