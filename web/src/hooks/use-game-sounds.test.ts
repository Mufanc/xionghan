import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameSounds } from './use-game-sounds';
import { Game, type GameState } from '@xionghan/core/game';
import { Board } from '@xionghan/core/board';
import { Side, Kind } from '@xionghan/core/piece';

const hooks = vi.hoisted(() => ({
    sound: null as unknown,
    ref: { current: false },
    effects: [] as (() => void | (() => void))[],
}));

vi.mock('react', () => ({
    useState: (create: () => unknown) => [(hooks.sound ??= create())],
    useRef: () => hooks.ref,
    useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));

const audio: {
    src: string;
    volume: number;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
}[] = [];
const storage = new Map<string, string>();
const state = Game.initialState();

function render(startKey?: string, enabled = true, position = state, step = 0) {
    hooks.effects = [];
    useGameSounds(position, enabled, null, step, 0.5, startKey);
    return hooks.effects.map((effect) => effect());
}

beforeEach(() => {
    hooks.sound = null;
    hooks.ref = { current: false };
    audio.length = 0;
    storage.clear();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal(
        'Audio',
        class {
            currentTime = 0;
            volume = 1;
            play = vi.fn().mockResolvedValue(undefined);
            pause = vi.fn();
            constructor(readonly src: string) {
                audio.push(this);
            }
        },
    );
});
afterEach(() => vi.unstubAllGlobals());

it('waits for readiness, survives StrictMode and plays start at the configured volume only once', async () => {
    render();
    await Promise.resolve();
    expect(audio).toHaveLength(0);
    const cleanups = render('server:room:0');
    cleanups.forEach((cleanup) => cleanup?.());
    render('server:room:0');
    await Promise.resolve();
    expect(audio).toHaveLength(1);
    expect(audio[0].src).toMatch(/start\.ogg$/);
    expect(audio[0].volume).toBe(0.5);
    expect(audio[0].play).toHaveBeenCalledOnce();
    render();
    render('server:room:0');
    await Promise.resolve();
    expect(audio).toHaveLength(1);
    hooks.sound = null;
    hooks.ref = { current: false };
    render('server:room:0');
    await Promise.resolve();
    expect(audio).toHaveLength(1);
});

it('honors mute without replaying the opening sound when re-enabled', async () => {
    render('server:room:1', false);
    await Promise.resolve();
    expect(audio).toHaveLength(0);
    render('server:room:1', true);
    await Promise.resolve();
    expect(audio).toHaveLength(0);
});

it('plays each manually started local game, but stays silent on initial load and refresh', async () => {
    render();
    await Promise.resolve();
    expect(audio).toHaveLength(0);
    for (let i = 0; i < 2; i++) {
        hooks.sound = null;
        hooks.ref = { current: false };
        render('local');
        await Promise.resolve();
        expect(audio).toHaveLength(i + 1);
        expect(audio.at(-1)!.src).toMatch(/start\.ogg$/);
    }
    expect(storage.size).toBe(0);
    hooks.sound = null;
    hooks.ref = { current: false };
    render();
    await Promise.resolve();
    expect(audio).toHaveLength(2);
});

it('plays check immediately from the moved piece, before network turn confirmation, without replaying the confirmation', () => {
    const initial: GameState = { board: Array(169).fill(null), lastMove: null };
    const p = Board.indexOf;
    initial.board[p(6, 11)] = { side: Side.Red, kind: Kind.King };
    initial.board[p(6, 1)] = { side: Side.Black, kind: Kind.King };
    initial.board[p(6, 6)] = { side: Side.Red, kind: Kind.Pawn };
    initial.board[p(5, 4)] = { side: Side.Red, kind: Kind.Chariot };
    render(undefined, true, initial);
    const next = structuredClone(initial);
    expect(new Game(next).tryMove(p(5, 4), p(6, 4), Side.Red)).toBe(true);
    expect(new Game(next).isCheck(Side.Red)).toBe(false);
    expect(new Game(next).isCheck(Side.Black)).toBe(true);
    render(undefined, true, next, 1);
    expect(audio).toHaveLength(1);
    expect(audio[0].src).toMatch(/check-self\.ogg$/);
    render(undefined, true, structuredClone(next), 1);
    expect(audio).toHaveLength(1);
    expect(audio[0].pause).not.toHaveBeenCalled();
});

it('plays checkmate immediately before network gameover confirmation and keeps it playing', () => {
    const initial: GameState = { board: Array(169).fill(null), lastMove: null };
    const p = Board.indexOf;
    initial.board[p(6, 11)] = { side: Side.Red, kind: Kind.King };
    initial.board[p(6, 1)] = { side: Side.Black, kind: Kind.King };
    initial.board[p(5, 3)] = { side: Side.Red, kind: Kind.Chariot };
    initial.board[p(7, 3)] = { side: Side.Red, kind: Kind.Chariot };
    initial.board[p(6, 3)] = { side: Side.Red, kind: Kind.Pawn };
    initial.board[p(4, 2)] = { side: Side.Red, kind: Kind.Chariot };
    render(undefined, true, initial);
    const next = structuredClone(initial);
    expect(new Game(next).tryMove(p(4, 2), p(6, 2), Side.Red)).toBe(true);
    expect(new Game(next).getWinner()).toBe(Side.Red);
    render(undefined, true, next, 1);
    expect(audio).toHaveLength(1);
    expect(audio[0].src).toMatch(/checkmate\.ogg$/);
    render(undefined, true, structuredClone(next), 1);
    expect(audio).toHaveLength(1);
    expect(audio[0].pause).not.toHaveBeenCalled();
});
