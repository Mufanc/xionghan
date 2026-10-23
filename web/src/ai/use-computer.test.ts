import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Game } from '@xionghan/core/game';
import { Side } from '@xionghan/core/piece';
import { useComputer } from './use-computer';

const hooks = vi.hoisted(() => ({
    effects: [] as (() => void | (() => void))[],
    setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock('react', () => ({
    useState: (value: unknown) => {
        const setter = vi.fn();
        hooks.setters.push(setter);
        return [value, setter];
    },
    useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));
class FakeWorker {
    static last: FakeWorker;
    onmessage?: (event: { data: unknown }) => void;
    onerror?: () => void;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
        FakeWorker.last = this;
    }
}
beforeEach(() => {
    hooks.effects = [];
    hooks.setters = [];
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('ignores a result after cancellation and terminates the worker', () => {
    const move = vi.fn();
    useComputer(Game.initialState(), Side.Red, true, move);
    const cleanup = hooks.effects[0]();
    const worker = FakeWorker.last;
    cleanup?.();
    worker.onmessage?.({ data: { move: { from: 106, to: 67 } } });
    expect(move).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
});
it('reports illegal replies and loading failures without moving a piece', () => {
    const move = vi.fn();
    useComputer(Game.initialState(), Side.Red, true, move);
    const cleanup = hooks.effects[0]();
    FakeWorker.last.onmessage?.({ data: { move: { from: 0, to: 1 } } });
    expect(move).not.toHaveBeenCalled();
    expect(hooks.setters[0]).toHaveBeenLastCalledWith(expect.stringContaining('非法走法'));
    cleanup?.();
});
it('does not start a worker when paused', () => {
    useComputer(Game.initialState(), Side.Red, false, vi.fn());
    expect(hooks.effects[0]()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
});
