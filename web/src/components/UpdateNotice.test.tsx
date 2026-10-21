import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { UpdateNotice } from './UpdateNotice';

const hooks = vi.hoisted(() => ({
    values: [] as unknown[],
    cursor: 0,
    effects: [] as (() => void | (() => void))[],
    available: false,
    options: {} as RegisterSWOptions,
    update: vi.fn<() => Promise<void>>(),
    setAvailable: vi.fn<(value: boolean) => void>(),
}));

vi.mock('react', () => ({
    useState(initial: unknown) {
        const index = hooks.cursor++;
        if (!(index in hooks.values)) hooks.values[index] = initial;
        return [
            hooks.values[index],
            (value: unknown) => {
                hooks.values[index] = value;
            },
        ];
    },
    useRef(initial: unknown) {
        const index = hooks.cursor++;
        return (hooks.values[index] ??= { current: initial });
    },
    useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));
vi.mock('virtual:pwa-register/react', () => ({
    useRegisterSW(options: RegisterSWOptions) {
        hooks.options = options;
        return {
            needRefresh: [hooks.available, hooks.setAvailable],
            updateServiceWorker: hooks.update,
        };
    },
}));

const reload = vi.fn();
const addDocumentListener = vi.fn();
const addWindowListener = vi.fn();
const removeDocumentListener = vi.fn();
const removeWindowListener = vi.fn();
const clearInterval = vi.fn();

function render() {
    hooks.cursor = 0;
    hooks.effects = [];
    return UpdateNotice();
}

function buttons(element: ReturnType<typeof render>) {
    const content = element!.props.children[1] as ReactElement<{
        children: ReactElement<{ onClick: () => void; disabled: boolean }>[];
    }>;
    return content.props.children;
}

beforeEach(() => {
    vi.clearAllMocks();
    hooks.values = [];
    hooks.available = false;
    hooks.update.mockResolvedValue(undefined);
    hooks.setAvailable.mockImplementation((value) => {
        hooks.available = value;
    });
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('document', {
        visibilityState: 'visible',
        addEventListener: addDocumentListener,
        removeEventListener: removeDocumentListener,
    });
    vi.stubGlobal('window', {
        addEventListener: addWindowListener,
        removeEventListener: removeWindowListener,
        setInterval: vi.fn(() => 123),
        clearInterval,
    });
});
afterEach(() => vi.unstubAllGlobals());

it('stays hidden until an update is ready and allows dismissal without activation', () => {
    expect(render()).toBeNull();
    hooks.available = true;
    buttons(render())[0].props.onClick();
    expect(hooks.setAvailable).toHaveBeenCalledWith(false);
    expect(hooks.update).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
});

it('activates only on click and reloads only after the new worker takes control', async () => {
    hooks.available = true;
    buttons(render())[1].props.onClick();
    await Promise.resolve();
    expect(hooks.update).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    expect(buttons(render())[1].props.disabled).toBe(true);
    hooks.options.onNeedReload!();
    expect(reload).toHaveBeenCalledOnce();
});

it('does not interrupt this tab when another tab activates the update', () => {
    render();
    hooks.options.onNeedReload!();
    expect(reload).not.toHaveBeenCalled();
    expect(hooks.setAvailable).toHaveBeenCalledWith(true);
    buttons(render())[1].props.onClick();
    expect(reload).toHaveBeenCalledOnce();
    expect(hooks.update).not.toHaveBeenCalled();
});

it('keeps the notice and permits retry when activation fails', async () => {
    hooks.available = true;
    hooks.update.mockRejectedValueOnce(new Error('offline'));
    buttons(render())[1].props.onClick();
    await Promise.resolve();
    const notice = render();
    expect(buttons(notice)[1].props.disabled).toBe(false);
    expect(notice!.props.children[0].props.children).toBe('更新未完成，请重试。');
    hooks.options.onNeedReload!();
    expect(reload).not.toHaveBeenCalled();
});

it('checks on foreground and reconnection, skips offline checks and removes listeners on cleanup', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = {
        update,
        waiting: null,
        installing: null,
    } as unknown as ServiceWorkerRegistration;
    render();
    hooks.options.onRegisteredSW!('/sw.js', registration);
    render();
    const cleanup = hooks.effects[0]();
    const check = addDocumentListener.mock.calls[0][1];
    check();
    expect(update).toHaveBeenCalledOnce();
    expect(addWindowListener.mock.calls[0][0]).toBe('online');
    vi.stubGlobal('navigator', { onLine: false });
    check();
    expect(update).toHaveBeenCalledOnce();
    vi.stubGlobal('navigator', { onLine: true });
    update.mockRejectedValueOnce(new Error('network'));
    check();
    await Promise.resolve();
    cleanup?.();
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', check);
    expect(removeWindowListener).toHaveBeenCalledWith('online', check);
    expect(clearInterval).toHaveBeenCalledWith(123);
});
