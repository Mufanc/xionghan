import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSounds } from '@/audio/game-sounds';
import { Board } from '@xionghan/core/board';
import { Game, type GameState } from '@xionghan/core/game';
import { Side } from '@xionghan/core/piece';

const instances: FakeAudio[] = [];

class FakeAudio {
    currentTime = 0;
    volume = 1;
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

    it('sounds only consecutive forward steps and tracks silent history navigation', () => {
        const initial = Game.initialState();
        const first = moved(initial, Board.indexOf(2, 8), Board.indexOf(2, 5));
        const second = moved(first, Board.indexOf(2, 4), Board.indexOf(2, 5));
        const sounds = new GameSounds(initial, 0);
        sounds.setEnabled(true);
        sounds.update(second, false, null, 2);
        expect(instances).toHaveLength(0);
        sounds.update(first, false, null, 1);
        expect(instances).toHaveLength(0);
        sounds.update(second, false, null, 2);
        expect(instances.at(-1)!.src).toMatch(/capture-opponent\.ogg$/);
        sounds.update(second, false, null, 2);
        expect(instances).toHaveLength(1);
        sounds.update(initial, false, null, 0);
        sounds.update(first, true, null, 1);
        expect(instances.at(-1)!.src).toMatch(/check-self\.ogg$/);
        sounds.setEnabled(false);
        sounds.update(second, false, Side.Black, 2);
        sounds.setEnabled(true);
        sounds.update(second, false, Side.Black, 2);
        expect(instances).toHaveLength(2);
    });

    it('applies volume to current and future sounds without replaying', () => {
        const sounds = new GameSounds(Game.initialState());
        sounds.setEnabled(true);
        sounds.setVolume(0.35);
        sounds.pick();
        expect(instances[0].volume).toBe(0.35);
        sounds.setVolume(0);
        expect(instances[0].volume).toBe(0);
        expect(instances).toHaveLength(1);
        sounds.setEnabled(false);
        sounds.setEnabled(true);
        sounds.pick();
        expect(instances[1].volume).toBe(0);
        sounds.setVolume(2);
        expect(instances[1].volume).toBe(1);
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
    it('does not cut off a local move when the server confirms the same ply with cloned state', () => {
        const initial = Game.initialState();
        const sounds = new GameSounds(initial, 0);
        sounds.setEnabled(true);
        const next = moved(initial, Board.indexOf(2, 8), Board.indexOf(2, 5));
        sounds.update(next, false, null, 1);
        const audio = instances[0];
        expect(audio.play).toHaveBeenCalledOnce();
        sounds.update(structuredClone(next), false, null, 1);
        expect(instances).toHaveLength(1);
        expect(audio.pause).not.toHaveBeenCalled();
        const reply = moved(next, Board.indexOf(2, 4), Board.indexOf(2, 5));
        sounds.update(reply, false, null, 2);
        expect(audio.pause).toHaveBeenCalledOnce();
        expect(instances[1].src).toMatch(/capture-opponent\.ogg$/);
    });
});

it.each([Side.Red, Side.Black])(
    'plays move, capture and check from the %s player perspective',
    (selfSide) => {
        for (const mover of [Side.Red, Side.Black]) {
            for (const type of ['move', 'capture', 'check']) {
                const initial = Game.initialState();
                const sounds = new GameSounds(initial, 0);
                sounds.setEnabled(true);
                const from = Board.indexOf(2, mover === Side.Red ? 8 : 4);
                const to = Board.indexOf(2, type === 'capture' ? (mover === Side.Red ? 4 : 8) : 5);
                const next = moved(initial, from, to);
                sounds.update(next, type === 'check', null, 1, selfSide);
                const audio = instances.at(-1)!;
                expect(audio.src).toMatch(
                    new RegExp(`${type}-${mover === selfSide ? 'self' : 'opponent'}\\.ogg$`),
                );
                sounds.update(structuredClone(next), type === 'check', null, 1, selfSide);
                expect(instances.at(-1)).toBe(audio);
                expect(audio.pause).not.toHaveBeenCalled();
            }
        }
    },
);
