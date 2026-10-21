import { useEffect, useState, type SubmitEvent } from 'react';
import type { LobbyAPI } from 'boardgame.io';
import { Rooms, roomIDFrom, roomError, type RoomSession } from './rooms';
import './rooms.css';

interface RoomPageProps {
    rooms: Rooms;
    matchID: string;
    onEnter: (session: RoomSession, created?: boolean) => void;
    onBack: () => void;
    onFind: (matchID: string) => void;
}

export function RoomPage({ rooms, matchID, onEnter, onBack, onFind }: RoomPageProps) {
    const [name, setName] = useState('');
    const [side, setSide] = useState<'0' | '1'>('0');
    const [input, setInput] = useState('');
    const [match, setMatch] = useState<LobbyAPI.Match | null>(null);
    const [busy, setBusy] = useState(!!matchID);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const [saved, setSaved] = useState(() => rooms.read(matchID));

    useEffect(() => {
        if (!matchID) return;

        const controller = new AbortController();
        let cancelled = false;
        setBusy(true);
        setError('');

        void (async () => {
            try {
                const metadata = await rooms.get(matchID, controller.signal);
                const session = rooms.read(matchID);
                if (cancelled) return;

                setMatch(metadata);

                if (session) {
                    try {
                        await rooms.resume(session);
                        if (!cancelled) onEnter(session);
                    } catch (error) {
                        if (cancelled) return;
                        setSaved(rooms.read(matchID));
                        throw error;
                    }
                }
            } catch (error) {
                if (!cancelled) setError(roomError(error));
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [matchID, rooms, retry, onEnter]);

    async function enter(create: boolean) {
        setBusy(true);
        setError('');

        try {
            onEnter(
                create ? await rooms.create(name, side) : await rooms.join(matchID, name),
                create,
            );
        } catch (error) {
            setError(roomError(error));
            if (matchID) setMatch(await rooms.get(matchID).catch(() => null));
        } finally {
            setBusy(false);
        }
    }

    function find(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        try {
            onFind(roomIDFrom(input));
        } catch (error) {
            setError(roomError(error));
        }
    }

    const recent = !matchID ? rooms.latest() : null;
    const full = match?.players.every((player) => !!player.name);

    return (
        <main className="room-page">
            <header className="room-header">
                <div className="identity">
                    <span className="seal" aria-hidden="true">
                        弈
                    </span>
                    <h1>
                        联机对弈<small>匈汉象棋</small>
                    </h1>
                </div>
                <button className="ui-button quiet" onClick={onBack}>
                    返回本地
                </button>
            </header>
            <section className="room-card" aria-busy={busy}>
                <h2>{matchID ? '加入对局' : '邀友对弈'}</h2>
                {matchID ? (
                    <>
                        <p className="room-id">房间 {matchID}</p>
                        {match && (
                            <div className="room-seats">
                                {match.players.map((player) => (
                                    <div key={player.id}>
                                        <span className={player.id === 0 ? 'RED' : 'BLACK'}>
                                            {player.id === 0 ? '红方' : '黑方'}
                                        </span>
                                        <strong>{player.name || '虚位以待'}</strong>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <p>创建房间，将邀请链接发给朋友。</p>
                )}
                {recent && (
                    <button className="ui-button" onClick={() => onFind(recent.matchID)}>
                        继续上一盘联机
                    </button>
                )}
                {!saved && (!matchID || (match && !full)) && (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void enter(!matchID);
                        }}
                    >
                        <label className="room-field">
                            称呼
                            <input
                                value={name}
                                maxLength={24}
                                required
                                autoComplete="nickname"
                                placeholder="怎么称呼你"
                                onChange={(event) => setName(event.target.value)}
                            />
                        </label>
                        {!matchID && (
                            <fieldset className="room-side">
                                <legend>执子</legend>
                                {(['0', '1'] as const).map((id) => (
                                    <label key={id}>
                                        <input
                                            type="radio"
                                            name="side"
                                            value={id}
                                            checked={side === id}
                                            onChange={() => setSide(id)}
                                        />
                                        {id === '0' ? '红方' : '黑方'}
                                    </label>
                                ))}
                            </fieldset>
                        )}
                        <button className="ui-button primary" disabled={busy || !name.trim()}>
                            {busy ? '连接中…' : matchID ? '加入对局' : '创建房间'}
                        </button>
                    </form>
                )}
                {matchID && (saved || full || !match) && (
                    <p>{busy ? '正在连接房间…' : full ? '房间已满。' : '暂未连接到房间。'}</p>
                )}
                {error && (
                    <p className="room-error" role="alert">
                        {error}
                    </p>
                )}
                {matchID && !busy && (
                    <button
                        className="ui-button quiet"
                        onClick={() => setRetry((value) => value + 1)}
                    >
                        刷新房间
                    </button>
                )}
                {!matchID && (
                    <form className="room-join" onSubmit={find}>
                        <label className="room-field">
                            已有邀请
                            <input
                                value={input}
                                required
                                placeholder="粘贴邀请链接或房间号"
                                onChange={(event) => setInput(event.target.value)}
                            />
                        </label>
                        <button className="ui-button" disabled={busy}>
                            查看房间
                        </button>
                    </form>
                )}
            </section>
        </main>
    );
}

export function ConnectionPending({ onBack }: { onBack: () => void }) {
    return (
        <div className="room-page room-card" role="status">
            <h2>正在连接对局…</h2>
            <p>连接恢复后会自动回到棋盘。</p>
            <button className="ui-button" onClick={onBack}>
                返回本地
            </button>
        </div>
    );
}
