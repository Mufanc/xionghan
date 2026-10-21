import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { Board } from './board.js';
import { Kind, Side } from './piece.js';
import { GameRecord } from './record.js';
import { gameConfig, gameFromSession } from './boardgame.js';

const p = Board.indexOf;

describe('game record', () => {
    it('records moves once, reconstructs captures, and leaves the live game intact', () => {
        const client = Client({ game: gameConfig });
        client.moves.move(p(2, 8), p(2, 5));
        client.moves.move(p(2, 4), p(2, 5));
        const state = client.getState()!.G;
        const record = new GameRecord(state.record!);
        expect(record.data.moves.map((move) => move.name)).toEqual(['兵C进3', '卒C进1']);
        expect(record.stateAt(0).board[p(2, 8)]?.side).toBe(Side.Red);
        expect(record.stateAt(1).board[p(2, 5)]?.side).toBe(Side.Red);
        expect(record.stateAt(2).board).toEqual(state.board);
        expect(state.board[p(2, 5)]?.side).toBe(Side.Black);
        expect(() => record.stateAt(-1)).toThrow(RangeError);
        expect(() => record.stateAt(3)).toThrow(RangeError);
        const restored = Client({ game: gameFromSession(state, '0') });
        restored.moves.move(p(4, 8), p(4, 5));
        expect(restored.getState()!.G.record!.moves).toHaveLength(3);
        expect(state.record!.moves).toHaveLength(2);
    });

    it('uses the actual loaded position as the start of a new record', () => {
        const previous = Client({ game: gameConfig });
        previous.moves.move(p(2, 8), p(2, 5));
        const legacy = structuredClone(previous.getState()!.G);
        delete legacy.record;
        const client = Client({ game: gameFromSession(legacy, '1') });
        client.moves.move(p(4, 4), p(4, 7));
        const record = new GameRecord(client.getState()!.G.record!);
        expect(record.stateAt(0)).toEqual(legacy);
        expect(record.data.moves[0].side).toBe(Side.Black);
    });

    it('distinguishes pieces on the same file and uses side-relative advance and retreat', () => {
        const board = Array(169).fill(null);
        board[p(2, 3)] = { side: Side.Red, kind: Kind.Pawn };
        board[p(2, 4)] = { side: Side.Red, kind: Kind.Pawn };
        board[p(4, 3)] = { side: Side.Red, kind: Kind.Pawn };
        board[p(4, 4)] = { side: Side.Red, kind: Kind.Pawn };
        expect(GameRecord.describe(board, p(2, 3), p(3, 3))).toBe('前C平D');
        expect(GameRecord.describe(board, p(4, 4), p(4, 3))).toBe('后E进1');
        board[p(1, 3)] = { side: Side.Black, kind: Kind.Chariot };
        expect(GameRecord.describe(board, p(1, 3), p(1, 1))).toBe('車B退2');
        board[p(3, 11)] = { side: Side.Red, kind: Kind.Horse };
        expect(GameRecord.describe(board, p(3, 11), p(4, 9))).toBe('馬D进E');
    });
});
