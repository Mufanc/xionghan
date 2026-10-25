import { useEffect, useId, useRef, useState } from 'react';
import { GameActions, type GameAction } from './GameActions';
import type { Takeback } from '@xionghan/core/online';

interface OnlineControlsProps {
    status: string;
    waiting: boolean;
    finished: boolean;
    connected: boolean;
    canRequest: boolean;
    playerID: string;
    pending: Takeback | null;
    drawOffer?: { id: number; playerID: string; expiresAt: number } | null;
    canOfferDraw?: boolean;
    onOfferDraw?: () => void;
    onRespondDraw?: (id: number, accept: boolean) => void;
    onResign?: () => void;
    steps: number;
    now: number;
    onRequest: () => void;
    onRespond: (id: number, accept: boolean) => void;
    onInvite: () => void;
    onExport: () => void;
    onLobby: () => void;
}

export function OnlineControls(props: OnlineControlsProps) {
    const { steps, now, playerID, finished } = props;
    const pending = props.pending ?? props.drawOffer;
    const requestName = props.drawOffer && !props.pending ? '和棋' : '悔棋';
    const resignDialog = useRef<HTMLDialogElement>(null);
    const menuID = useId();
    const menu = useRef<HTMLDivElement>(null);
    const actions: GameAction[] = [
        {
            id: 'draw',
            label: '提和',
            placement: !props.waiting && !finished ? 'menu' : 'hidden',
            disabled: !props.connected || steps < 2 || !!pending || !props.canOfferDraw,
            onClick: () => props.onOfferDraw?.(),
        },
        {
            id: 'resign',
            label: '认输',
            placement: !props.waiting && !finished ? 'menu' : 'hidden',
            disabled: !props.connected || steps < 2,
            onClick: () => resignDialog.current?.showModal(),
        },
        {
            id: 'export',
            label: '导出棋谱',
            placement: finished ? 'hidden' : 'menu',
            onClick: props.onExport,
        },
        { id: 'lobby', label: '返回大厅', placement: 'menu', onClick: props.onLobby },
    ];
    const previous = useRef<{ request: { id: number; expiresAt: number }; steps: number } | null>(
        null,
    );
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
                  : `${requestName}申请已拒绝`,
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
                        ? `等待对方确认${requestName}`
                        : `对方申请${requestName}`
                    : result || props.status}
            </h2>
            <div className="online-buttons">
                {pending && !ownRequest ? (
                    <>
                        <button
                            className="ui-button primary"
                            disabled={!props.connected}
                            onClick={() =>
                                (props.pending ? props.onRespond : props.onRespondDraw)?.(
                                    pending.id,
                                    true,
                                )
                            }
                        >
                            同意
                        </button>
                        <button
                            className="ui-button"
                            disabled={!props.connected}
                            onClick={() =>
                                (props.pending ? props.onRespond : props.onRespondDraw)?.(
                                    pending.id,
                                    false,
                                )
                            }
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
                        <button
                            className="ui-button"
                            popoverTarget={menuID}
                            onClick={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();

                                if (menu.current) {
                                    menu.current.style.right = `${window.innerWidth - rect.right}px`;
                                    menu.current.style.bottom = `${window.innerHeight - rect.top + 8}px`;
                                }
                            }}
                        >
                            更多
                        </button>
                    </>
                )}
            </div>
            {(!pending || ownRequest) && (
                <div
                    id={menuID}
                    ref={menu}
                    className="game-menu online-menu"
                    popover="auto"
                    aria-label="对局操作"
                >
                    <GameActions
                        actions={actions}
                        placement="menu"
                        onBeforeAction={() => menu.current?.hidePopover()}
                    />
                </div>
            )}
            <dialog
                ref={resignDialog}
                className="reset-dialog"
                aria-labelledby={`${menuID}-resign-title`}
            >
                <h2 id={`${menuID}-resign-title`}>确认认输？</h2>
                <p>认输后，本局结束，对方获胜。</p>
                <div>
                    <button className="ui-button" onClick={() => resignDialog.current?.close()}>
                        取消
                    </button>
                    <button
                        className="ui-button primary"
                        disabled={!props.connected || finished || steps < 2}
                        onClick={() => {
                            resignDialog.current?.close();
                            props.onResign?.();
                        }}
                    >
                        确认认输
                    </button>
                </div>
            </dialog>
        </section>
    );
}
