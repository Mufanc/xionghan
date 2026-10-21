import { useEffect, useState, type SubmitEvent } from 'react';
import type { LobbyAPI } from 'boardgame.io';
import {
    Rooms,
    roomIDFrom,
    roomError,
    type RoomSession,
    type WaitingRoom,
    type MyMatch,
} from './rooms';
import './rooms.css';
import { downloadRecord, type ImportedRecord } from '@/storage/record-file';
import { Side } from '@xionghan/core/piece';

interface RoomPageProps {
    rooms: Rooms;
    matchID: string;
    onEnter: (session: RoomSession, created?: boolean) => void;
    onBack: () => void;
    onFind: (matchID: string) => void;
    onReview?: (record: ImportedRecord) => void;
}

export function RoomPage({ rooms, matchID, onEnter, onBack, onFind, onReview }: RoomPageProps) {
    const [name, setName] = useState(() => rooms.latest()?.playerName ?? '');
    const [side, setSide] = useState<'0' | '1'>('0');
    const [unlisted, setUnlisted] = useState(false);
    const [waiting, setWaiting] = useState<WaitingRoom[]>([]);
    const [myMatches, setMyMatches] = useState<MyMatch[]>([]);
    const [listError, setListError] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [input, setInput] = useState('');
    const [match, setMatch] = useState<LobbyAPI.Match | null>(null);
    const [busy, setBusy] = useState(!!matchID);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const [saved, setSaved] = useState(() => rooms.read(matchID));

    useEffect(() => {
        if (matchID) return;

        const controller = new AbortController();
        let pending = false;

        async function refresh() {
            if (document.hidden || pending) return;
            pending = true;

            try {
                const [list, mine] = await Promise.all([
                    rooms.waiting(controller.signal),
                    rooms.mine(controller.signal),
                ]);

                if (!controller.signal.aborted) {
                    setWaiting(list);
                    setMyMatches(mine);
                    setListError('');
                    setLoaded(true);
                }
            } catch (error) {
                if (!controller.signal.aborted) setListError(roomError(error));
            } finally {
                pending = false;
            }
        }

        void refresh();
        const timer = window.setInterval(() => void refresh(), 5000);
        document.addEventListener('visibilitychange', refresh);

        return () => {
            controller.abort();
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [matchID, rooms]);

    useEffect(() => {
        if (!matchID) return;

        const controller = new AbortController();
        let cancelled = false;
        setBusy(true);
        setError('');

        void (async () => {
            try {
                const metadata = await rooms.get(matchID, controller.signal);
                const session = (await rooms.recover(matchID)) ?? rooms.read(matchID);
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

    async function enter(create: boolean, target = matchID) {
        setBusy(true);
        setError('');

        try {
            const session = create ? null : rooms.read(target);
            const joined = create
                ? await rooms.create(name, side, unlisted)
                : session
                  ? await rooms.resume(session)
                  : await rooms.join(target, name);

            onEnter(joined, create);
        } catch (error) {
            setError(roomError(error));
            if (matchID) setMatch(await rooms.get(matchID).catch(() => null));
        } finally {
            setBusy(false);
        }
    }

    async function openHistory(match: MyMatch, download = false) {
        setBusy(true);
        setError('');

        try {
            if (!match.gameover) {
                const session = await rooms.recover(match.matchID);
                if (!session) throw new Error('无法恢复这个座位。');
                onEnter(session);
            } else {
                const record = await rooms.record(match.matchID);
                if (download) downloadRecord(record.game, record.currentPlayer);
                else onReview?.(record);
            }
        } catch (error) {
            setError(roomError(error));
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
            <div className={!matchID ? 'room-lobby' : undefined}>
                <section className="room-card" aria-busy={busy}>
                    <h2>{matchID ? '加入对局' : '创建房间'}</h2>
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
                    ) : null}
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
                                <>
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
                                    <fieldset className="room-side">
                                        <legend>可见范围</legend>
                                        <label>
                                            <input
                                                type="radio"
                                                name="visibility"
                                                checked={!unlisted}
                                                onChange={() => setUnlisted(false)}
                                            />
                                            公开
                                        </label>
                                        <label>
                                            <input
                                                type="radio"
                                                name="visibility"
                                                checked={unlisted}
                                                onChange={() => setUnlisted(true)}
                                            />
                                            仅邀请
                                        </label>
                                    </fieldset>
                                </>
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
                {!matchID && (
                    <section className="room-card room-list" aria-label="公开房间">
                        <h2>等待对手</h2>
                        {listError ? (
                            <p role="status">{listError}</p>
                        ) : (
                            !waiting.length && (
                                <p>{loaded ? '暂时没有等待中的房间。' : '正在查看房间…'}</p>
                            )
                        )}
                        {waiting.map((room) => (
                            <div className="room-list-item" key={room.matchID}>
                                <div>
                                    <strong>{room.host}</strong>
                                    <span className={room.side === '0' ? 'RED' : 'BLACK'}>
                                        {room.side === '0' ? '执红 · 等待黑方' : '执黑 · 等待红方'}
                                    </span>
                                </div>
                                <button
                                    className="ui-button"
                                    disabled={busy || (!name.trim() && !rooms.read(room.matchID))}
                                    onClick={() => void enter(false, room.matchID)}
                                >
                                    {rooms.read(room.matchID) ? '回到房间' : '入座'}
                                </button>
                            </div>
                        ))}
                    </section>
                )}
            </div>
            {!matchID && myMatches.length > 0 && (
                <section className="room-card room-history" aria-label="我的对局">
                    <h2>我的对局</h2>
                    {[false, true].map((finished) => {
                        const matches = myMatches.filter((match) => !!match.gameover === finished);
                        return (
                            matches.length > 0 && (
                                <div key={String(finished)}>
                                    <h3>{finished ? '已结束' : '进行中'}</h3>
                                    {matches.map((match) => (
                                        <div className="room-list-item" key={match.matchID}>
                                            <div>
                                                <strong>
                                                    {match.players
                                                        .map((player) => player.name || '等待加入')
                                                        .join(' · ')}
                                                </strong>
                                                <span>
                                                    {match.gameover
                                                        ? `${match.gameover.winner === Side.Red ? '红方' : '黑方'}胜`
                                                        : `执${match.playerID === '0' ? '红' : '黑'}`}
                                                    {match.expiresAt &&
                                                        ` · 保留至 ${new Date(match.expiresAt).toLocaleString()}`}
                                                </span>
                                            </div>
                                            <div className="room-history-actions">
                                                <button
                                                    className="ui-button"
                                                    disabled={busy}
                                                    onClick={() => void openHistory(match)}
                                                >
                                                    {finished ? '复盘' : '继续'}
                                                </button>
                                                {finished && (
                                                    <button
                                                        className="ui-button quiet"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void openHistory(match, true)
                                                        }
                                                    >
                                                        导出
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        );
                    })}
                </section>
            )}
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
