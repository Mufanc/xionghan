import Peer, { type DataConnection } from 'peerjs';
import { OnlineGame } from '@/network/online-game';

const host = 'xionghan-peer-xviexerlgo.cn-hangzhou.fcapp.run';
const roomPattern = /^xh-[a-f0-9]{32}$/;

export function parseRoom(input: string): string | null {
    const trimmed = input.trim();
    if (roomPattern.test(trimmed)) return trimmed;

    try {
        const room = new URL(trimmed).searchParams.get('room');

        return room && roomPattern.test(room) ? room : null;
    } catch {
        return null;
    }
}

export class PeerRoom {
    readonly game: OnlineGame;
    readonly id: string;
    status = '正在连接信令服务…';
    private peer: Peer | null = null;
    private connection: DataConnection | null = null;
    private opponent: string | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private deadline = 0;
    private lastSeen = 0;
    private closed = false;

    constructor(
        readonly target: string | null,
        private readonly changed: () => void,
    ) {
        this.id = `xh-${crypto.randomUUID().replaceAll('-', '')}`;
        this.game = new OnlineGame(target ? '1' : '0', (message) => this.send(message), changed);
    }

    get invitation() {
        const url = new URL(location.href);
        url.searchParams.set('room', this.id);
        url.hash = '';

        return url.href;
    }

    start() {
        this.closed = false;
        if (this.timer) clearInterval(this.timer);

        this.peer = new Peer(this.id, {
            host,
            port: 443,
            path: '/peerjs',
            secure: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.cloudflare.com:3478' },
                    { urls: 'stun:stun.l.google.com:19302' },
                ],
            },
        });
        this.peer.on('open', () => {
            if (this.closed || this.connection?.open) return;

            if (this.target) this.join();
            else {
                this.deadline = 0;
                this.update('等待对方加入 · 你执红');
            }
        });
        this.peer.on('connection', (connection) => {
            if (
                this.closed ||
                this.target ||
                this.connection ||
                (this.opponent && this.opponent !== connection.peer)
            ) {
                connection.on('open', () => connection.close());
                return;
            }

            this.attach(connection);
        });
        this.peer.on('disconnected', () => {
            if (!this.closed && !this.peer?.destroyed) this.peer?.reconnect();
        });
        this.peer.on('error', () => {
            if (this.closed) return;

            if (!this.connection?.open) this.fail('连接失败，请重试并确认对方仍在页面中');
        });
        this.deadline = Date.now() + 30000;
        this.timer = setInterval(() => {
            if (this.connection?.open) {
                if (Date.now() - this.lastSeen > 20000) {
                    this.fail('对方连接中断，对局已暂停');
                } else {
                    this.send({ type: 'ping' });
                }
            } else if (this.deadline && Date.now() > this.deadline) {
                this.fail('连接超时，请重试；当前网络可能无法直连');
            }
        }, 3000);
    }

    private update(status: string) {
        this.status = status;
        this.changed();
    }

    private send(message: unknown) {
        try {
            if (!this.connection?.open) throw new Error('Disconnected');

            this.connection.send(message);
        } catch {
            this.fail('连接已中断，对局已暂停');
        }
    }

    private join() {
        if (!this.peer || !this.target || this.connection) return;

        this.attach(this.peer.connect(this.target, { reliable: true, serialization: 'json' }));
    }

    private attach(connection: DataConnection) {
        this.connection = connection;
        this.deadline = Date.now() + 30000;
        this.update('正在建立点对点连接…');
        connection.on('open', () => {
            if (this.connection !== connection || this.closed) return;

            this.opponent = connection.peer;
            this.lastSeen = Date.now();
            this.deadline = 0;
            this.game.connect();
        });
        connection.on('data', (data) => {
            if (this.connection !== connection || this.closed) return;

            this.lastSeen = Date.now();

            if (data && typeof data === 'object' && 'type' in data) {
                if (data.type === 'ping') {
                    this.send({ type: 'pong' });
                    return;
                }

                if (data.type === 'pong') return;
            }

            if (!this.game.receive(data)) {
                this.fail('对局数据不一致，连接已暂停');
            } else {
                this.update(`已连接 · 你执${this.target ? '黑' : '红'}`);
            }
        });
        connection.on('close', () => {
            if (this.connection === connection) this.fail('对方已断开，对局已暂停');
        });
        connection.on('error', () => {
            if (this.connection === connection) this.fail('连接失败，请重试');
        });
    }

    private fail(status: string) {
        const connection = this.connection;
        this.connection = null;
        this.deadline = 0;
        connection?.close();
        this.game.disconnect();
        this.update(status);
    }

    reconnect() {
        this.fail('正在重新连接…');
        this.deadline = Date.now() + 30000;

        if (!this.peer || this.peer.destroyed) this.start();
        else if (this.peer.disconnected) this.peer.reconnect();
        else if (this.target) this.join();
        else {
            this.deadline = 0;
            this.update('等待原对手重新连接 · 你执红');
        }
    }

    close() {
        this.closed = true;
        if (this.timer) clearInterval(this.timer);
        this.connection = null;
        this.peer?.destroy();
    }
}
