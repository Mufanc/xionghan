import { afterEach, expect, it, vi } from 'vitest';
import { RoomPage } from './RoomPage';
import { Rooms } from './rooms';

const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));
vi.mock('react', () => ({
    useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
    useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));

afterEach(() => {
    hooks.effects = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('refreshes only the visible lobby, avoids overlapping requests and aborts on exit', async () => {
    const rooms = new Rooms('https://game.example');
    vi.spyOn(rooms, 'mine').mockResolvedValue([]);
    vi.spyOn(rooms, 'latest').mockReturnValue(null);
    vi.spyOn(rooms, 'read').mockReturnValue(null);
    let resolve!: (value: []) => void;
    const waiting = vi.spyOn(rooms, 'waiting').mockImplementation(
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    const setInterval = vi.fn();
    const clearInterval = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const document = { hidden: false, addEventListener, removeEventListener };
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', { setInterval, clearInterval });
    RoomPage({ rooms, matchID: '', onEnter: vi.fn(), onBack: vi.fn(), onFind: vi.fn() });
    const cleanup = hooks.effects[0]();
    expect(waiting).toHaveBeenCalledOnce();
    const refresh = addEventListener.mock.calls[0][1];
    await refresh();
    expect(waiting).toHaveBeenCalledOnce();
    resolve([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.hidden = true;
    await refresh();
    expect(waiting).toHaveBeenCalledOnce();
    document.hidden = false;
    void refresh();
    expect(waiting).toHaveBeenCalledTimes(2);
    expect(setInterval.mock.calls[0][1]).toBe(5000);
    cleanup?.();
    expect(waiting.mock.calls[1][0].aborted).toBe(true);
    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', refresh);
    expect(clearInterval).toHaveBeenCalledOnce();
    resolve([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
});

it('does not poll the lobby when following a room invitation', () => {
    const rooms = new Rooms('https://game.example');
    vi.spyOn(rooms, 'mine').mockResolvedValue([]);
    vi.spyOn(rooms, 'latest').mockReturnValue(null);
    vi.spyOn(rooms, 'read').mockReturnValue(null);
    const waiting = vi.spyOn(rooms, 'waiting');
    RoomPage({ rooms, matchID: 'invitation', onEnter: vi.fn(), onBack: vi.fn(), onFind: vi.fn() });
    expect(hooks.effects[0]()).toBeUndefined();
    expect(waiting).not.toHaveBeenCalled();
});
