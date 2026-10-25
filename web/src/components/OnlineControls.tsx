import { useEffect, useRef, useState } from 'react';
import type { Takeback } from '@xionghan/core/online';

interface OnlineControlsProps {
    status: string;
    waiting: boolean;
    finished: boolean;
    connected: boolean;
    canRequest: boolean;
    playerID: string;
    pending: Takeback | null;
    steps: number;
    now: number;
    onRequest: () => void;
    onRespond: (id: number, accept: boolean) => void;
    onInvite: () => void;
    onExport: () => void;
    onLobby: () => void;
}

export function OnlineControls(props: OnlineControlsProps) {
    const { pending, steps, now, playerID, finished } = props;
    const previous = useRef<{ request: Takeback; steps: number } | null>(null);
    const [result, setResult] = useState('');
    const ownRequest = pending?.playerID === playerID;
    const seconds = pending ? Math.max(0, Math.ceil((pending.expiresAt - now) / 1000)) : 0;

    useEffect(() => {
        if (pending) {
            previous.current = { request: pending, steps };
            setResult('');
            return;
        }

        const last = previous.current;
        previous.current = null;

        if (!last || finished) return;

        setResult(
            steps < last.steps
                ? '已悔棋'
                : now >= last.request.expiresAt
                  ? '申请超时，已取消'
                  : '悔棋申请已拒绝',
        );
        const timer = setTimeout(() => setResult(''), 3000);

        return () => clearTimeout(timer);
    }, [pending, finished]);

    return (
        <section className="online-controls" aria-label="联机操作">
            <h2
                className="online-title"
                role="status"
                key={pending?.id ?? (result || props.status)}
            >
                {pending
                    ? ownRequest
                        ? '等待对方确认悔棋'
                        : '对方申请悔棋'
                    : result || props.status}
            </h2>
            <div className="online-buttons">
                {pending && !ownRequest ? (
                    <>
                        <button
                            className="ui-button primary"
                            disabled={!props.connected}
                            onClick={() => props.onRespond(pending.id, true)}
                        >
                            同意
                        </button>
                        <button
                            className="ui-button"
                            disabled={!props.connected}
                            onClick={() => props.onRespond(pending.id, false)}
                        >
                            拒绝（{seconds}s）
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            className="ui-button"
                            disabled={
                                !!pending || (!props.waiting && !finished && !props.canRequest)
                            }
                            onClick={
                                props.waiting
                                    ? props.onInvite
                                    : finished
                                      ? props.onExport
                                      : props.onRequest
                            }
                        >
                            {pending
                                ? `等待回应（${seconds}s）`
                                : props.waiting
                                  ? '邀请朋友'
                                  : finished
                                    ? '导出棋谱'
                                    : '悔棋'}
                        </button>
                        <button className="ui-button" onClick={props.onLobby}>
                            返回大厅
                        </button>
                    </>
                )}
            </div>
        </section>
    );
}
