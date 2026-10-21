import { afterEach, describe, expect, it, vi } from 'vitest';

const { FakePeer, FakeConnection } = vi.hoisted(() => {
    class Events {
        handlers = new Map<string, ((...args: any[]) => void)[]>();
        on(name: string, callback: (...args: any[]) => void) {
            this.handlers.set(name, [...(this.handlers.get(name) ?? []), callback]);
        }
        emit(name: string, ...args: unknown[]) {
            this.handlers.get(name)?.forEach((callback) => callback(...args));
        }
    }
    class FakeConnection extends Events {
        open = false;
        send = vi.fn();
        close = vi.fn(() => {
            this.open = false;
            this.emit('close');
        });
        constructor(readonly peer: string) {
            super();
        }
        establish() {
            this.open = true;
            this.emit('open');
        }
    }
    class FakePeer extends Events {
        static instances: FakePeer[] = [];
        destroyed = false;
        disconnected = false;
        reconnect = vi.fn();
        connect = vi.fn((id: string) => new FakeConnection(id));
        destroy = vi.fn(() => {
            this.destroyed = true;
        });
        constructor(..._args: unknown[]) {
            super();
            FakePeer.instances.push(this);
        }
    }
    return { FakePeer, FakeConnection };
});

vi.mock('peerjs', () => ({ default: FakePeer }));
import { PeerRoom } from '@/network/peer-room';

afterEach(() => {
    vi.useRealTimers();
    FakePeer.instances.length = 0;
});

describe('PeerRoom lifecycle', () => {
    it('allows idle invitations and refuses a third player without affecting the opponent', () => {
        vi.useFakeTimers();
        const room = new PeerRoom(null, () => {});
        room.start();
        const peer = FakePeer.instances.at(-1)!;
        peer.emit('open');
        vi.advanceTimersByTime(60000);
        expect(room.status).toContain('等待对方加入');
        const opponent = new FakeConnection('opponent');
        peer.emit('connection', opponent);
        opponent.establish();
        opponent.emit('data', { type: 'hello', version: 1 });
        opponent.emit('data', { type: 'ack', step: 0 });
        expect(room.game.ready).toBe(true);
        const stranger = new FakeConnection('stranger');
        peer.emit('connection', stranger);
        stranger.establish();
        expect(stranger.close).toHaveBeenCalled();
        expect(opponent.close).not.toHaveBeenCalled();
        peer.emit('disconnected');
        expect(peer.reconnect).toHaveBeenCalled();
        peer.emit('open');
        expect(room.status).toContain('已连接');
        room.close();
        expect(peer.destroy).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('pauses on heartbeat loss, ignores old messages and only resumes with the original player', () => {
        vi.useFakeTimers();
        const room = new PeerRoom(null, () => {});
        room.start();
        const peer = FakePeer.instances.at(-1)!;
        peer.emit('open');
        const connection = new FakeConnection('opponent');
        peer.emit('connection', connection);
        connection.establish();
        connection.emit('data', { type: 'ack', step: 0 });
        expect(room.game.ready).toBe(true);
        vi.advanceTimersByTime(21000);
        expect(room.game.ready).toBe(false);
        expect(connection.close).toHaveBeenCalled();
        connection.emit('data', { type: 'ack', step: 0 });
        expect(room.game.ready).toBe(false);
        const stranger = new FakeConnection('stranger');
        peer.emit('connection', stranger);
        stranger.establish();
        expect(stranger.close).toHaveBeenCalled();
        const restored = new FakeConnection('opponent');
        peer.emit('connection', restored);
        restored.establish();
        restored.emit('data', { type: 'hello', version: 1 });
        restored.emit('data', { type: 'ack', step: 0 });
        expect(room.game.ready).toBe(true);
        room.close();
    });

    it('retries a failed guest connection and cleans up timers and signaling', () => {
        vi.useFakeTimers();
        const room = new PeerRoom(`xh-${'a'.repeat(32)}`, () => {});
        room.start();
        const peer = FakePeer.instances.at(-1)!;
        peer.emit('open');
        expect(peer.connect).toHaveBeenCalledOnce();
        vi.advanceTimersByTime(33000);
        expect(room.status).toContain('超时');
        room.reconnect();
        expect(peer.connect).toHaveBeenCalledTimes(2);
        peer.destroyed = true;
        room.reconnect();
        expect(FakePeer.instances).toHaveLength(2);
        room.close();
        expect(vi.getTimerCount()).toBe(0);
    });
});
