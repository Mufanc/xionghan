import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '@xionghan/core/game';
import { Client } from 'boardgame.io/client';
import { gameConfig, gameFromSession } from '@xionghan/core/boardgame';
import { GameRecord } from '@xionghan/core/record';
import { Board } from '@xionghan/core/board';
import { Kind, Side } from '@xionghan/core/piece';
import { loadSession, saveSession, type SavedSession } from '@/storage/session';

let value: string | null;
const session = (): SavedSession => ({
    version: 1,
    game: Game.initialState(),
    currentPlayer: '0',
    draft: null,
    soundEnabled: true,
});

beforeEach(() => {
    value = null;
    vi.stubGlobal('localStorage', {
        getItem: () => value,
        setItem: (_key: string, next: string) => {
            value = next;
        },
    });
});
afterEach(() => vi.unstubAllGlobals());

describe('session storage', () => {
    it('round trips a game, independent unfinished draft, and sound preference', () => {
        const saved = session();
        new Game(saved.game).tryMove(Board.indexOf(2, 8), Board.indexOf(2, 5), Side.Red);
        saved.currentPlayer = '1';
        saved.draft = saved.game.board.slice();
        saved.draft[Board.indexOf(4, 8)] = null;
        saved.soundEnabled = false;
        saved.volume = 0.35;
        saved.recordVisible = false;
        saveSession(saved);
        expect(loadSession()).toEqual(saved);
        expect(loadSession()!.game.board[Board.indexOf(4, 8)]).not.toBeNull();
        saveSession(session());
        expect(loadSession()).toEqual(session());
    });

    it('ignores missing, malformed, incompatible, or structurally invalid saves', () => {
        expect(loadSession()).toBeNull();
        for (const invalid of ['{', 'null', '{}', JSON.stringify({ ...session(), version: 2 })]) {
            value = invalid;
            expect(loadSession()).toBeNull();
        }
        const missingKing = session();
        missingKing.game.board[Board.indexOf(6, 11)] = null;
        const invalidPiece = session();
        (invalidPiece.game.board as unknown[])[0] = { side: 'PURPLE', kind: 'KING' };
        const invalidMove = session();
        invalidMove.game.lastMove = { from: -1, to: 1000 };
        const shortDraft = { ...session(), draft: [] };
        for (const invalid of [missingKing, invalidPiece, invalidMove, shortDraft]) {
            value = JSON.stringify(invalid);
            expect(loadSession()).toBeNull();
        }
    });

    it('restores validated records and rejects tampered moves or mismatched final positions', () => {
        const client = Client({ game: gameConfig });
        client.moves.move(Board.indexOf(2, 8), Board.indexOf(2, 5));
        const saved = { ...session(), game: client.getState()!.G, currentPlayer: '1' as const };
        saveSession(saved);
        expect(loadSession()).toEqual(saved);
        const changed = structuredClone(saved);
        changed.game.record!.moves[0].to = Board.indexOf(3, 8);
        saveSession(changed);
        expect(loadSession()).toBeNull();
        const mismatched = structuredClone(saved);
        mismatched.game.board[Board.indexOf(4, 8)] = null;
        saveSession(mismatched);
        expect(loadSession()).toBeNull();
    });

    it('restores a 1200-ply record without losing its position or history', () => {
        const initial = Game.initialState();
        const replay = structuredClone(initial);
        const record = GameRecord.create(initial).data;
        const board = new Board(replay.board);
        const p = Board.indexOf;
        const cycle = [
            [p(2, 12), p(2, 11)],
            [p(2, 0), p(2, 1)],
            [p(2, 11), p(2, 12)],
            [p(2, 1), p(2, 0)],
        ];
        for (let step = 0; step < 1200; step++) {
            const [from, to] = cycle[step % cycle.length];
            record.moves.push({
                from,
                to,
                side: board.at(from)!.side,
                name: GameRecord.describe(board.data, from, to),
            });
            board.move(from, to);
            replay.lastMove = { from, to };
        }
        const saved = { ...session(), game: { ...replay, record } };
        saveSession(saved);
        expect(loadSession()).toEqual(saved);
        const tampered = structuredClone(saved);
        tampered.game.record.moves[600].name = '非法走法';
        saveSession(tampered);
        expect(loadSession()).toBeNull();
    });

    it('migrates legacy winner fields without losing the record', () => {
        const client = Client({ game: gameConfig });
        client.moves.move(Board.indexOf(2, 8), Board.indexOf(2, 5));
        const saved = { ...session(), game: client.getState()!.G, currentPlayer: '1' as const };
        const legacy = structuredClone(saved);
        Object.assign(legacy.game, { winner: null });
        Object.assign(legacy.game.record!.initial, { winner: null });
        value = JSON.stringify(legacy);
        expect(loadSession()).toEqual(saved);
        Object.assign(legacy.game, { winner: Side.Red });
        value = JSON.stringify(legacy);
        expect(loadSession()).toBeNull();
    });

    it('recomputes a saved checkmate through bgio and rejects moves after the end', () => {
        const p = Board.indexOf;
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
        saveSession({ ...session(), game: state.G });
        const saved = loadSession()!;
        expect(saved.game).not.toHaveProperty('winner');
        const restored = Client({ game: gameFromSession(saved.game, saved.currentPlayer) });
        expect(restored.getState()!.ctx.gameover).toEqual({ winner: Side.Red });
        const legacy = structuredClone(saved);
        Object.assign(legacy.game, { winner: Side.Red });
        Object.assign(legacy.game.record!.initial, { winner: null });
        value = JSON.stringify(legacy);
        expect(loadSession()).toEqual(saved);
        const invalid = structuredClone(saved);
        invalid.game.record!.moves.push({
            from: p(6, 1),
            to: p(6, 0),
            side: Side.Black,
            name: '單G退1',
        });
        saveSession(invalid);
        expect(loadSession()).toBeNull();
    });

    it('keeps playing when browser storage is unavailable', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('full');
            },
        });
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(loadSession()).toBeNull();
        expect(() => saveSession(session())).not.toThrow();
        expect(warning).toHaveBeenCalledOnce();
        warning.mockRestore();
    });
});
