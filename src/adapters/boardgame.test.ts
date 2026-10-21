import { Client } from 'boardgame.io/client';
import { describe, expect, it, vi } from 'vitest';
import { gameConfig, gameFromPosition, gameFromSession } from '@/adapters/boardgame';
import { Game } from '@/core/game';
import { Board } from '@/core/board';
import { Side, Kind } from '@/core/piece';

const p = Board.indexOf;

describe('boardgame.io integration', () => {
    it('restores the last move and black turn, then continues alternating', () => {
        const client = Client({ game: gameConfig });
        client.moves.move(p(2, 8), p(2, 5));
        const saved = client.getState()!;
        const restored = Client({ game: gameFromSession(saved.G, '1') });
        expect(restored.getState()!.G).toEqual(saved.G);
        expect(restored.getState()!.ctx.currentPlayer).toBe('1');
        restored.moves.move(p(4, 4), p(4, 7));
        expect(restored.getState()!.ctx.currentPlayer).toBe('0');
        expect(restored.getState()!.G.board[p(4, 7)]?.side).toBe(Side.Black);
        expect(saved.G.board[p(4, 4)]?.side).toBe(Side.Black);
    });

    it('starts an edited position as a fresh red turn and keeps the draft isolated', () => {
        const board = new Board().data;
        board[p(2, 8)] = null;
        const game = gameFromPosition(board);
        board[p(4, 8)] = null;
        const client = Client({ game });
        const state = client.getState()!;
        expect(state.ctx.currentPlayer).toBe('0');
        expect(state.G.lastMove).toBeNull();
        expect(state.ctx.gameover).toBeUndefined();
        expect(state.G.board[p(2, 8)]).toBeNull();
        expect(state.G.board[p(4, 8)]?.kind).toBe(Kind.Pawn);
        client.moves.move(p(4, 8), p(4, 5));
        expect(client.getState()!.ctx.currentPlayer).toBe('1');
        client.reset();
        expect(client.getState()!.G.board[p(4, 8)]?.kind).toBe(Kind.Pawn);
        const missingKing = new Board().data;
        missingKing[p(6, 11)] = null;
        expect(() => gameFromPosition(missingKing)).toThrow('Invalid starting position');
    });

    it('operates directly on plain state that can be restored without class instances', () => {
        const state = Game.initialState();
        const game = new Game(state);
        const initial = JSON.stringify(state);
        expect(game.findLegalMoves(p(2, 8))).toContain(p(2, 5));
        expect(game.isCheck(Side.Red)).toBe(false);
        expect(game.tryMove(p(2, 8), p(3, 8), Side.Red)).toBe(false);
        expect(JSON.stringify(state)).toBe(initial);
        expect(game.tryMove(p(2, 8), p(2, 5), Side.Red)).toBe(true);
        expect(state.board[p(2, 8)]).toBeNull();
        expect(state.board[p(2, 5)]?.side).toBe(Side.Red);
        expect(state.lastMove).toEqual({ from: p(2, 8), to: p(2, 5) });
        const saved = JSON.parse(JSON.stringify(state));
        const restored = new Game(saved);
        expect(restored.tryMove(p(4, 4), p(4, 7), Side.Black)).toBe(true);
        expect(saved.board[p(4, 7)]?.side).toBe(Side.Black);
        expect(state.board[p(4, 4)]?.side).toBe(Side.Black);
        expect(state.lastMove).toEqual({ from: p(2, 8), to: p(2, 5) });
    });

    it('enforces ownership, legal moves, input validation and alternating turns', () => {
        const client = Client({ game: gameConfig, numPlayers: 2 });
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const initial = client.getState()!;
        for (const [from, to] of [
            [p(2, 4), p(2, 5)],
            [p(2, 8), p(3, 8)],
            [-1, 1],
            [169, 170],
            [NaN, 1],
            [1.5, 5],
            [null, 5],
            [p(2, 8), '67'],
        ]) {
            client.moves.move(from, to);
            expect(client.getState()!.G).toEqual(initial.G);
            expect(client.getState()!.ctx.currentPlayer).toBe('0');
        }
        client.moves.move(p(2, 8), p(2, 5));
        expect(client.getState()!.ctx.currentPlayer).toBe('1');
        expect(client.getState()!.G.board[p(2, 5)]?.side).toBe(Side.Red);
        client.moves.move(p(4, 4), p(4, 7));
        expect(client.getState()!.ctx.currentPlayer).toBe('0');
        expect(client.getState()!.G.board[p(4, 7)]?.side).toBe(Side.Black);
        client.reset();
        expect(client.getState()!.G).toEqual(initial.G);
        expect(client.getState()!.ctx.currentPlayer).toBe('0');
        error.mockRestore();
    });

    it('ends the game at checkmate without needing to capture the king', () => {
        const board = Array(Board.SIZE * Board.SIZE).fill(null);
        board[p(6, 11)] = { side: Side.Red, kind: Kind.King };
        board[p(6, 1)] = { side: Side.Black, kind: Kind.King };
        board[p(5, 3)] = { side: Side.Red, kind: Kind.Chariot };
        board[p(7, 3)] = { side: Side.Red, kind: Kind.Chariot };
        board[p(6, 3)] = { side: Side.Red, kind: Kind.Pawn };
        board[p(4, 2)] = { side: Side.Red, kind: Kind.Chariot };
        const client = Client({
            game: { ...gameConfig, setup: () => ({ board, lastMove: null }) },
        });
        client.moves.move(p(4, 2), p(6, 2));
        expect(client.getState()!.G.board[p(6, 1)]?.kind).toBe(Kind.King);
        expect(client.getState()!.ctx.gameover).toEqual({ winner: Side.Red });
        expect(new Game(client.getState()!.G).getWinner()).toBe(Side.Red);
    });

    it('ends the game when a king is captured and blocks subsequent moves', () => {
        const board = Array(Board.SIZE * Board.SIZE).fill(null);
        board[p(6, 11)] = { side: Side.Red, kind: Kind.King };
        board[p(5, 1)] = { side: Side.Black, kind: Kind.King };
        board[p(5, 3)] = { side: Side.Red, kind: Kind.Chariot };
        const client = Client({
            game: { ...gameConfig, setup: () => ({ board, lastMove: null }) },
        });
        client.moves.move(p(5, 3), p(5, 1));
        const state = client.getState()!;
        expect(state.G).not.toHaveProperty('winner');
        expect(state.ctx.gameover).toEqual({ winner: Side.Red });
        const restored = Client({ game: gameFromSession(state.G, '0') });
        expect(restored.getState()!.G).toEqual(state.G);
        expect(restored.getState()!.ctx.gameover).toEqual({ winner: Side.Red });
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        client.moves.move(p(5, 1), p(5, 2));
        expect(client.getState()!.G).toEqual(state.G);
        error.mockRestore();
    });
});
