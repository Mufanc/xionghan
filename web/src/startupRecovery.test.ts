import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const script = readFileSync(new URL('../public/registerSW.js', import.meta.url), 'utf8');

function setup({ online = true, attempted = false, children = 0 } = {}) {
    const listeners: Record<string, (event?: unknown) => void> = {};
    const values = new Map(attempted ? [['xionghan-startup-recovery', '1']] : []);
    const root = { childNodes: { length: children }, dataset: {}, append: vi.fn() };
    const replace = vi.fn();
    const context = {
        window: {
            addEventListener: (name: string, callback: () => void) => {
                listeners[name] = callback;
            },
        },
        document: { getElementById: () => root, createElement: () => ({ style: {} }) },
        navigator: { onLine: online },
        sessionStorage: {
            getItem: (key: string) => values.get(key),
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        },
        location: { href: 'https://example.com/?room=abc', replace, reload: vi.fn() },
        history: { replaceState: vi.fn(), state: null },
        HTMLScriptElement: class {},
        HTMLLinkElement: class {},
        URL,
        Date,
        setTimeout: (callback: () => void) => {
            callback();
            return 0;
        },
        clearTimeout: vi.fn(),
    };
    runInNewContext(script, context);
    return { listeners, replace, root, context };
}

describe('startup recovery', () => {
    it('recovers an old empty entry without losing the room URL', async () => {
        const page = setup();
        page.listeners.load();
        await vi.waitFor(() => expect(page.replace).toHaveBeenCalledOnce());
        expect(page.replace.mock.calls[0][0]).toMatch(/room=abc&__recover=/);
    });

    it('does not reload a healthy page', () => {
        const page = setup({ children: 1 });
        page.listeners.load();
        expect(page.replace).not.toHaveBeenCalled();
    });

    it.each([{ online: false }, { attempted: true }])(
        'offers retry instead of looping: %j',
        (options) => {
            const page = setup(options);
            page.listeners.load();
            expect(page.replace).not.toHaveBeenCalled();
            expect(page.root.append).toHaveBeenCalledOnce();
        },
    );

    it('handles missing lazy chunks', async () => {
        const page = setup({ children: 1 });
        const preventDefault = vi.fn();
        page.listeners['vite:preloadError']({ preventDefault });
        await vi.waitFor(() => expect(page.replace).toHaveBeenCalledOnce());
        expect(preventDefault).toHaveBeenCalledOnce();
    });

    it('handles a missing initial script before React starts', async () => {
        const page = setup();
        page.listeners.error({ target: new page.context.HTMLScriptElement() });
        await vi.waitFor(() => expect(page.replace).toHaveBeenCalledOnce());
    });
});
