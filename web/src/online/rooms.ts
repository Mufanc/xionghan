import { LobbyClient, LobbyClientError } from 'boardgame.io/client';
import type { Side } from '@xionghan/core/piece';
import type { ImportedRecord } from '@/storage/record-file';

export interface WaitingRoom {
    matchID: string;
    host: string;
    side: '0' | '1';
    createdAt: number;
}

export interface MyMatch {
    matchID: string;
    playerID: '0' | '1';
    players: { id: number; name?: string }[];
    gameover: { winner: Side } | null;
    updatedAt: number;
    expiresAt: number | null;
}

export interface RoomSession {
    matchID: string;
    playerID: '0' | '1';
    credentials: string;
    playerName: string;
}

export function roomIDFrom(value: string): string {
    let id = value.trim();

    if (/^https?:\/\//i.test(id)) {
        id = new URL(id).searchParams.get('room') ?? '';
    }

    if (!/^[\w-]{1,128}$/.test(id)) throw new Error('请输入有效的房间号或邀请链接。');

    return id;
}

export function invitationURL(matchID: string, base = location.href): string {
    const url = new URL(base);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', roomIDFrom(matchID));

    return url.href;
}

export function roomError(error: unknown): string {
    if (error instanceof LobbyClientError) {
        const status = Number(error.message.match(/HTTP status (\d+)/)?.[1]);

        if (status === 429) return '操作太频繁，请稍后再试。';
        if (status === 503) return '服务器房间已满，请稍后再试。';
        if (status === 404) return '房间不存在或已关闭。';
        if (status === 409) return '这个位置已有人加入，请重新查看房间。';
        if (status === 403) return '无法恢复这个座位，请重新加入。';
    }

    if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) {
        return '连接超时，请稍后重试。';
    }

    return error instanceof Error && !(error instanceof TypeError)
        ? error.message
        : '暂时无法连接服务端，请稍后重试。';
}

export class Rooms {
    readonly server: string;
    readonly lobby: LobbyClient;
    private identityRequest: Promise<void> | null = null;
    private migrated = false;

    constructor(server = import.meta.env.VITE_API_SERVER_URL || location.origin) {
        this.server = server.replace(/\/$/, '');
        this.lobby = new LobbyClient({ server: this.server });
    }

    private async request<T>(path: string, signal = AbortSignal.timeout(10000)): Promise<T> {
        const response = await fetch(`${this.server}/games/XiongHan/${path}`, {
            credentials: 'include',
            signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        });

        if (!response.ok) throw new LobbyClientError(`HTTP status ${response.status}`, {});

        return response.json();
    }

    ensureIdentity(): Promise<void> {
        return (this.identityRequest ??= this.request('me').then(
            () => {},
            (error) => {
                this.identityRequest = null;
                throw error;
            },
        ));
    }

    async mine(signal: AbortSignal): Promise<MyMatch[]> {
        await this.ensureIdentity();

        if (!this.migrated) {
            const legacy = this.latest();

            if (legacy) {
                try {
                    await this.resume(legacy);
                } catch (error) {
                    if (!(
                        error instanceof LobbyClientError &&
                        /HTTP status (403|404)/.test(error.message)
                    ))
                        throw error;
                }
            }

            this.migrated = true;
        }

        return (await this.request<{ matches: MyMatch[] }>('me', signal)).matches;
    }

    async recover(matchID: string): Promise<RoomSession | null> {
        await this.ensureIdentity();

        try {
            return await this.request<RoomSession>(`${roomIDFrom(matchID)}/session`);
        } catch (error) {
            if (error instanceof LobbyClientError && /HTTP status 403/.test(error.message))
                return null;
            throw error;
        }
    }

    record(matchID: string): Promise<ImportedRecord> {
        return this.request(`${roomIDFrom(matchID)}/record`);
    }

    private key(matchID: string) {
        return `xionghan.room:${this.server}:${matchID}`;
    }

    read(matchID: string): RoomSession | null {
        try {
            const value = JSON.parse(localStorage.getItem(this.key(matchID)) ?? 'null');

            return value &&
                value.matchID === matchID &&
                (value.playerID === '0' || value.playerID === '1') &&
                typeof value.credentials === 'string' &&
                value.credentials.length > 0 &&
                typeof value.playerName === 'string' &&
                value.playerName.length > 0
                ? value
                : null;
        } catch {
            return null;
        }
    }

    latest(): RoomSession | null {
        try {
            const id = localStorage.getItem(`xionghan.last-room:${this.server}`);
            return id ? this.read(id) : null;
        } catch {
            return null;
        }
    }

    forget(matchID: string) {
        localStorage.removeItem(this.key(matchID));
    }

    get(matchID: string, signal = AbortSignal.timeout(10000)) {
        return this.lobby.getMatch('XiongHan', roomIDFrom(matchID), {
            signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        });
    }

    async waiting(signal: AbortSignal): Promise<WaitingRoom[]> {
        const response = await fetch(`${this.server}/games/XiongHan/waiting`, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        });

        if (!response.ok) throw new LobbyClientError(`HTTP status ${response.status}`, {});

        return (await response.json()).rooms;
    }

    async resume(session: RoomSession) {
        await this.ensureIdentity();

        try {
            await this.lobby.updatePlayer(
                'XiongHan',
                session.matchID,
                {
                    playerID: session.playerID,
                    credentials: session.credentials,
                    newName: session.playerName,
                },
                { signal: AbortSignal.timeout(10000), credentials: 'include' },
            );
        } catch (error) {
            if (error instanceof LobbyClientError && /HTTP status (403|404)/.test(error.message)) {
                this.forget(session.matchID);
            }
            throw error;
        }

        return session;
    }

    async join(matchID: string, name: string, playerID?: '0' | '1'): Promise<RoomSession> {
        matchID = roomIDFrom(matchID);
        const playerName = name.trim();

        if (!playerName || playerName.length > 24) throw new Error('称呼请填写 1 至 24 个字。');

        await this.ensureIdentity();
        const joined = await this.lobby.joinMatch(
            'XiongHan',
            matchID,
            {
                playerName,
                playerID,
            },
            { signal: AbortSignal.timeout(10000), credentials: 'include' },
        );

        if (joined.playerID !== '0' && joined.playerID !== '1') {
            throw new Error('服务端返回了无效的座位。');
        }

        const session: RoomSession = {
            matchID,
            playerID: joined.playerID,
            credentials: joined.playerCredentials,
            playerName,
        };

        try {
            localStorage.setItem(this.key(matchID), JSON.stringify(session));
            localStorage.setItem(`xionghan.last-room:${this.server}`, matchID);
        } catch {
            // 座位已与 HttpOnly 身份关联，本地存储不可用不影响恢复。
        }

        return session;
    }

    async create(name: string, side: '0' | '1', unlisted = false) {
        if (!name.trim() || name.trim().length > 24) throw new Error('称呼请填写 1 至 24 个字。');

        await this.ensureIdentity();
        const { matchID } = await this.lobby.createMatch(
            'XiongHan',
            {
                numPlayers: 2,
                unlisted,
            },
            { signal: AbortSignal.timeout(10000), credentials: 'include' },
        );

        return this.join(matchID, name, side);
    }
}
