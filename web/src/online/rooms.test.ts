import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rooms, invitationURL, roomIDFrom, roomError } from './rooms';
import { LobbyClientError } from 'boardgame.io/client';

const values = new Map<string, string>();
const local = '{"keep":"local game"}';

beforeEach(() => {
    values.clear();
    values.set('xionghan.session', local);
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    });
});
afterEach(() => vi.unstubAllGlobals());

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

    it('creates an unlisted two-player room, selects a seat and authenticates resume', async () => {
        const rooms = new Rooms('https://game.example');
        const create = vi.spyOn(rooms.lobby, 'createMatch').mockResolvedValue({ matchID: 'abc' });
        const join = vi
            .spyOn(rooms.lobby, 'joinMatch')
            .mockResolvedValue({ playerID: '1', playerCredentials: 'secret' });
        const update = vi.spyOn(rooms.lobby, 'updatePlayer').mockResolvedValue(undefined);
        const session = await rooms.create('棋友', '1');
        expect(create.mock.calls[0][1]).toEqual({ numPlayers: 2, unlisted: true });
        expect(join.mock.calls[0][2]).toEqual({ playerName: '棋友', playerID: '1' });
        await rooms.resume(session);
        expect(update.mock.calls[0][2]).toEqual({
            playerID: '1',
            credentials: 'secret',
            newName: '棋友',
        });
    });

    it('releases a new seat when browser storage fails', async () => {
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
        await expect(rooms.join('abc', '棋友')).rejects.toThrow('无法保存座位');
        expect(leave.mock.calls[0][2]).toEqual({ playerID: '0', credentials: 'secret' });
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
