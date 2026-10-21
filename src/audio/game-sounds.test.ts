import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSounds } from '@/audio/game-sounds';
import { Board } from '@/core/board';
import { Game, type GameState } from '@/core/game';
import { Side } from '@/core/piece';

const instances: FakeAudio[] = [];

class FakeAudio {
    currentTime = 0;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();

    constructor(readonly src: string) {
        instances.push(this);
    }
}

function moved(state: GameState, from: number, to: number): GameState {
    const board = state.board.slice();
    board[to] = board[from];
    board[from] = null;
    return { board, lastMove: { from, to } };
}

beforeEach(() => {
    instances.length = 0;
    vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => vi.unstubAllGlobals());

describe('presentation-layer game sounds', () => {
    it('starts silent and does not replay moves when enabled or rerendered', () => {
        const initial = Game.initialState();
        const sounds = new GameSounds(initial);
        const next = moved(initial, Board.indexOf(2, 8), Board.indexOf(2, 5));
        sounds.pick();
        sounds.update(next, false);
        expect(instances).toHaveLength(0);
        sounds.setEnabled(true);
        sounds.update(next, false);
        expect(instances).toHaveLength(0);
        sounds.pick();
        expect(instances).toHaveLength(1);
        expect(instances[0].src).toMatch(/pick\.ogg$/);
        sounds.update(next, false);
        expect(instances).toHaveLength(1);
    });

    it('plays an illegal-move warning only when enabled', () => {
        const sounds = new GameSounds(Game.initialState());
        sounds.illegal();
        expect(instances).toHaveLength(0);
        sounds.setEnabled(true);
        sounds.illegal();
        expect(instances).toHaveLength(1);
        expect(instances[0].src).toMatch(/illegal\.ogg$/);
        sounds.setEnabled(false);
        sounds.illegal();
        expect(instances).toHaveLength(1);
        expect(instances[0].pause).toHaveBeenCalledOnce();
    });

    it('selects side-specific move and capture sounds with check and victory taking priority', () => {
        let state = Game.initialState();
        const sounds = new GameSounds(state);
        sounds.setEnabled(true);
        state = moved(state, Board.indexOf(2, 8), Board.indexOf(2, 5));
        sounds.update(state, false);
        expect(instances.at(-1)!.src).toMatch(/move-self\.ogg$/);
        const first = instances[0];
        state = moved(state, Board.indexOf(2, 4), Board.indexOf(2, 5));
        sounds.update(state, false);
        expect(instances.at(-1)!.src).toMatch(/capture-opponent\.ogg$/);
        expect(first.pause).toHaveBeenCalledOnce();
        state = moved(state, Board.indexOf(4, 8), Board.indexOf(4, 5));
        sounds.update(state, true);
        expect(instances.at(-1)!.src).toMatch(/check-self\.ogg$/);
        state = moved(state, Board.indexOf(4, 4), Board.indexOf(4, 5));
        sounds.update(state, true, Side.Black);
        expect(instances.at(-1)!.src).toMatch(/checkmate\.ogg$/);
        expect(instances).toHaveLength(4);
    });

    it('stops playing immediately when muted and follows muted state changes', () => {
        const initial = Game.initialState();
        const sounds = new GameSounds(initial);
        sounds.setEnabled(true);
        sounds.pick();
        const audio = instances[0];
        audio.currentTime = 1;
        sounds.setEnabled(false);
        expect(audio.pause).toHaveBeenCalledOnce();
        expect(audio.currentTime).toBe(0);
        const next = moved(initial, Board.indexOf(2, 8), Board.indexOf(2, 5));
        sounds.update(next, false);
        sounds.pick();
        sounds.setEnabled(true);
        sounds.update(next, false);
        expect(instances).toHaveLength(1);
    });

    it('stops on reset or disposal without playing a new move', () => {
        const initial = Game.initialState();
        const sounds = new GameSounds(initial);
        sounds.setEnabled(true);
        sounds.update(moved(initial, Board.indexOf(2, 8), Board.indexOf(2, 5)), false);
        sounds.update(Game.initialState(), false);
        expect(instances).toHaveLength(1);
        expect(instances[0].pause).toHaveBeenCalledOnce();
        sounds.pick();
        sounds.stop();
        expect(instances[1].pause).toHaveBeenCalledOnce();
    });
});
