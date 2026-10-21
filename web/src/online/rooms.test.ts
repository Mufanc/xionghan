import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rooms, invitationURL, roomIDFrom, roomError } from './rooms';
import { LobbyClientError } from 'boardgame.io/client';

const values = new Map<string, string>();
const local = '{"keep":"local game"}';

beforeEach(() => {
    vi.spyOn(Rooms.prototype, 'ensureIdentity').mockResolvedValue(undefined);
    values.clear();
    values.set('xionghan.session', local);
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('online rooms', () => {
    it('accepts IDs and invitations, and never includes seat credentials in links', () => {
        expect(roomIDFrom('  abc-123_ ')).toBe('abc-123_');
        expect(roomIDFrom('https://example.com/?room=abc-123_')).toBe('abc-123_');
        expect(
            invitationURL('abc', 'https://example.com/?credentials=secret&page=online#secret'),
        ).toBe('https://example.com/?room=abc');
        for (const input of [
            '',
            '../a',
            'https://example.com/?credentials=secret',
            'a'.repeat(129),
        ]) {
            expect(() => roomIDFrom(input)).toThrow();
        }
    });

    it('stores rooms separately from local games and scopes credentials by server and room', async () => {
        const rooms = new Rooms('https://game.example');
        vi.spyOn(rooms.lobby, 'joinMatch').mockResolvedValue({
            playerID: '1',
            playerCredentials: 'secret',
        });
        const joined = await rooms.join('abc', ' 棋友 ');
        expect(rooms.read('abc')).toEqual(joined);
        expect(rooms.read('different')).toBeNull();
        expect(new Rooms('https://other.example').read('abc')).toBeNull();
        expect(values.get('xionghan.session')).toBe(local);
        expect(joined.playerName).toBe('棋友');
        rooms.forget('abc');
        expect(rooms.read('abc')).toBeNull();
        expect(values.get('xionghan.session')).toBe(local);
    });

    it('creates a public two-player room, selects a seat and authenticates resume', async () => {
        const rooms = new Rooms('https://game.example');
        const create = vi.spyOn(rooms.lobby, 'createMatch').mockResolvedValue({ matchID: 'abc' });
        const join = vi
            .spyOn(rooms.lobby, 'joinMatch')
            .mockResolvedValue({ playerID: '1', playerCredentials: 'secret' });
        const update = vi.spyOn(rooms.lobby, 'updatePlayer').mockResolvedValue(undefined);
        const session = await rooms.create('棋友', '1');
        expect(create.mock.calls[0][1]).toEqual({ numPlayers: 2, unlisted: false });
        expect(join.mock.calls[0][2]).toEqual({ playerName: '棋友', playerID: '1' });
        await rooms.resume(session);
        expect(update.mock.calls[0][2]).toEqual({
            playerID: '1',
            credentials: 'secret',
            newName: '棋友',
        });
    });

    it('keeps invitation-only rooms private when requested', async () => {
        const rooms = new Rooms('https://game.example');
        const create = vi.spyOn(rooms.lobby, 'createMatch').mockResolvedValue({ matchID: 'abc' });
        vi.spyOn(rooms.lobby, 'joinMatch').mockResolvedValue({
            playerID: '0',
            playerCredentials: 'secret',
        });
        await rooms.create('棋友', '0', true);
        expect(create.mock.calls[0][1]).toEqual({ numPlayers: 2, unlisted: true });
    });

    it('loads waiting rooms with cancellation and reports rate limits', async () => {
        const rooms = new Rooms('https://game.example');
        const list = [{ matchID: 'abc', host: '棋友', side: '0', createdAt: 1 }];
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rooms: list })));
        vi.stubGlobal('fetch', fetcher);
        const controller = new AbortController();
        expect(await rooms.waiting(controller.signal)).toEqual(list);
        expect(fetcher.mock.calls[0][0]).toBe('https://game.example/games/XiongHan/waiting');
        controller.abort();
        expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
        fetcher.mockResolvedValue(new Response('{}', { status: 429 }));
        await expect(rooms.waiting(new AbortController().signal)).rejects.toThrow(
            'HTTP status 429',
        );
    });

    it('keeps an identity-backed seat when browser storage fails', async () => {
        const rooms = new Rooms('https://game.example');
        vi.spyOn(rooms.lobby, 'joinMatch').mockResolvedValue({
            playerID: '0',
            playerCredentials: 'secret',
        });
        const leave = vi.spyOn(rooms.lobby, 'leaveMatch').mockResolvedValue(undefined);
        vi.stubGlobal('localStorage', {
            setItem() {
                throw new Error('denied');
            },
        });
        expect((await rooms.join('abc', '棋友')).credentials).toBe('secret');
        expect(leave).not.toHaveBeenCalled();
    });

    it('rejects invalid names before contacting the server and ignores corrupted saved credentials', async () => {
        const rooms = new Rooms('https://game.example');
        const create = vi.spyOn(rooms.lobby, 'createMatch');
        await expect(rooms.create(' ', '0')).rejects.toThrow();
        await expect(rooms.create('字'.repeat(25), '0')).rejects.toThrow();
        expect(create).not.toHaveBeenCalled();
        values.set('xionghan.room:https://game.example:abc', '{"matchID":"abc","playerID":"2"}');
        expect(rooms.read('abc')).toBeNull();
        values.set('xionghan.room:https://game.example:abc', 'broken');
        expect(rooms.read('abc')).toBeNull();
    });

    it('presents HTTP and network errors without leaking server error bodies', () => {
        expect(roomError(new LobbyClientError('HTTP status 403', 'credentials secret'))).toContain(
            '座位',
        );
        expect(roomError(new LobbyClientError('HTTP status 409', {}))).toContain('已有人');
        expect(roomError(new LobbyClientError('HTTP status 404', {}))).toContain('不存在');
        expect(roomError(new LobbyClientError('HTTP status 429', {}))).toContain('太频繁');
        expect(roomError(new LobbyClientError('HTTP status 503', {}))).toContain('已满');
        expect(roomError(new TypeError('Failed to fetch'))).toContain('服务端');
    });
    it('keeps credentials after a transient resume failure and removes them only if rejected', async () => {
        const rooms = new Rooms('https://game.example');
        vi.spyOn(rooms.lobby, 'joinMatch').mockResolvedValue({
            playerID: '0',
            playerCredentials: 'secret',
        });
        const session = await rooms.join('abc', '棋友');
        expect(rooms.latest()).toEqual(session);
        const update = vi
            .spyOn(rooms.lobby, 'updatePlayer')
            .mockRejectedValue(new TypeError('network'));
        await expect(rooms.resume(session)).rejects.toThrow('network');
        expect(rooms.read('abc')).toEqual(session);
        update.mockRejectedValue(new LobbyClientError('HTTP status 403', {}));
        await expect(rooms.resume(session)).rejects.toThrow();
        expect(rooms.read('abc')).toBeNull();
        expect(rooms.latest()).toBeNull();
    });
});

it('initializes one cookie identity for concurrent requests and retries after failure', async () => {
    vi.mocked(Rooms.prototype.ensureIdentity).mockRestore();
    const rooms = new Rooms('https://game.example');
    const request = vi.fn().mockResolvedValue(new Response('{"matches":[]}'));
    vi.stubGlobal('fetch', request);
    await Promise.all([rooms.ensureIdentity(), rooms.ensureIdentity()]);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1].credentials).toBe('include');
    const other = new Rooms('https://game.example');
    request.mockRejectedValueOnce(new TypeError('offline'));
    await expect(other.ensureIdentity()).rejects.toThrow('offline');
    request.mockResolvedValue(new Response('{"matches":[]}'));
    await other.ensureIdentity();
    expect(request).toHaveBeenCalledTimes(3);
});

it('recovers with the cookie when no local seat is stored and distinguishes denial from network errors', async () => {
    const rooms = new Rooms('https://game.example');
    const session = { matchID: 'abc', playerID: '0', credentials: 'secret', playerName: '棋友' };
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(session)));
    vi.stubGlobal('fetch', request);
    expect(rooms.read('abc')).toBeNull();
    expect(await rooms.recover('abc')).toEqual(session);
    expect(request.mock.calls[0][0]).toBe('https://game.example/games/XiongHan/abc/session');
    expect(request.mock.calls[0][1].credentials).toBe('include');
    request.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    expect(await rooms.recover('abc')).toBeNull();
    request.mockRejectedValueOnce(new TypeError('offline'));
    await expect(rooms.recover('abc')).rejects.toThrow('offline');
});

it('migrates the legacy recent seat before requesting server history, only once', async () => {
    const rooms = new Rooms('https://game.example');
    const session = {
        matchID: 'old',
        playerID: '1' as const,
        credentials: 'secret',
        playerName: '棋友',
    };
    vi.spyOn(rooms, 'latest').mockReturnValue(session);
    const resume = vi.spyOn(rooms, 'resume').mockResolvedValue(session);
    const request = vi
        .fn()
        .mockImplementation(() => Promise.resolve(new Response('{"matches":[]}')));
    vi.stubGlobal('fetch', request);
    await rooms.mine(new AbortController().signal);
    await rooms.mine(new AbortController().signal);
    expect(resume).toHaveBeenCalledExactlyOnceWith(session);
    expect(request).toHaveBeenCalledTimes(2);
});
