import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '@/core/game';
import { Board } from '@/core/board';
import { Side } from '@/core/piece';
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
