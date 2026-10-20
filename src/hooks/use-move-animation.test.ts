import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMoveAnimation } from '@/hooks/use-move-animation';
import { Game, type GameState } from '@/core/game';
import { Board } from '@/core/board';

const hooks = vi.hoisted(() => ({
    refs: [] as { current: unknown }[],
    cursor: 0,
    effect: () => undefined as (() => void) | undefined,
    setCaptured: vi.fn(),
}));

vi.mock('react', () => ({
    useRef: (initial: unknown) => {
        const index = hooks.cursor++;
        return (hooks.refs[index] ??= { current: initial });
    },
    useState: () => [null, hooks.setCaptured],
    useLayoutEffect: (effect: typeof hooks.effect) => {
        hooks.effect = effect;
    },
}));

function render(state: GameState, enabled = true) {
    hooks.cursor = 0;
    return useMoveAnimation(state, enabled);
}

beforeEach(() => {
    hooks.refs.length = 0;
    hooks.setCaptured.mockClear();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => vi.unstubAllGlobals());

it('retains the captured piece below a moving piece and cleans up its raised layer', () => {
    const initial = Game.initialState();
    const { boardRef } = render(initial);
    hooks.effect();
    const from = Board.indexOf(2, 8);
    const to = Board.indexOf(2, 4);
    const cancel = vi.fn();
    const animation = { cancel, onfinish: null as (() => void) | null };
    const animate = vi.fn(() => animation);
    const removeProperty = vi.fn();
    const target = {
        style: { zIndex: '', removeProperty },
        getBoundingClientRect: () => ({ x: 20, y: 40 }),
        querySelector: () => ({ animate }),
    };
    boardRef.current = {
        querySelector: (selector: string) =>
            selector === `#point-${to}`
                ? target
                : { getBoundingClientRect: () => ({ x: 20, y: 80 }) },
    } as unknown as HTMLDivElement;
    const board = initial.board.slice();
    board[to] = board[from];
    board[from] = null;
    const { clearCapture } = render({ board, lastMove: { from, to }, winner: null });
    const cleanup = hooks.effect();
    expect(hooks.setCaptured).toHaveBeenLastCalledWith({ index: to, piece: initial.board[to] });
    expect(target.style.zIndex).toBe('3');
    expect(animate).toHaveBeenCalledWith([{ translate: '0px 40px' }, { translate: '0px 0px' }], {
        duration: 220,
        easing: 'ease-out',
    });
    animation.onfinish!();
    expect(removeProperty).toHaveBeenCalledWith('z-index');
    clearCapture();
    expect(hooks.setCaptured).toHaveBeenLastCalledWith(null);
    cleanup!();
    expect(cancel).toHaveBeenCalledOnce();
    render(Game.initialState());
    hooks.effect();
    expect(hooks.setCaptured).toHaveBeenLastCalledWith(null);
});

it('skips capture and move animations when reduced motion is requested', () => {
    const initial = Game.initialState();
    render(initial);
    hooks.effect();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render({ ...initial, lastMove: { from: 106, to: 54 } });
    hooks.effect();
    expect(hooks.setCaptured).toHaveBeenLastCalledWith(null);
});

it('keeps editing silent visually and does not replay an old move when editing is cancelled', () => {
    const state = { ...Game.initialState(), lastMove: { from: 106, to: 67 } };
    render(state);
    hooks.effect();
    render(state, false);
    hooks.effect();
    expect(hooks.setCaptured).toHaveBeenLastCalledWith(null);
    render(state, true);
    hooks.effect();
    expect(hooks.setCaptured).toHaveBeenLastCalledWith(null);
});
