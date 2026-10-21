import { LobbyClient, LobbyClientError } from 'boardgame.io/client';

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

    constructor(server = import.meta.env.VITE_API_SERVER_URL || location.origin) {
        this.server = server.replace(/\/$/, '');
        this.lobby = new LobbyClient({ server: this.server });
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

    async resume(session: RoomSession) {
        try {
            await this.lobby.updatePlayer(
                'XiongHan',
                session.matchID,
                {
                    playerID: session.playerID,
                    credentials: session.credentials,
                    newName: session.playerName,
                },
                { signal: AbortSignal.timeout(10000) },
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

        const joined = await this.lobby.joinMatch(
            'XiongHan',
            matchID,
            {
                playerName,
                playerID,
            },
            { signal: AbortSignal.timeout(10000) },
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
            await this.lobby.leaveMatch('XiongHan', matchID, {
                playerID: session.playerID,
                credentials: session.credentials,
            });
            throw new Error('浏览器无法保存座位，请允许本地存储后再加入。');
        }

        return session;
    }

    async create(name: string, side: '0' | '1') {
        if (!name.trim() || name.trim().length > 24) throw new Error('称呼请填写 1 至 24 个字。');

        const { matchID } = await this.lobby.createMatch(
            'XiongHan',
            {
                numPlayers: 2,
                unlisted: true,
            },
            { signal: AbortSignal.timeout(10000) },
        );

        return this.join(matchID, name, side);
    }
}
