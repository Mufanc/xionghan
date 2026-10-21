import { useLayoutEffect, useRef, useState } from 'react';
import type { Piece } from '@xionghan/core/piece';
import type { BoardData, Index } from '@xionghan/core/board';

export interface MoveAnimationState {
    board: BoardData;
    lastMove: { from: Index; to: Index } | null;
}

export function useMoveAnimation(state: MoveAnimationState, enabled = true, step?: number) {
    const boardRef = useRef<HTMLDivElement>(null);
    const previousState = useRef({ state, step });
    const [captured, setCaptured] = useState<{ index: Index; piece: Piece } | null>(null);

    useLayoutEffect(() => {
        const previous = previousState.current;
        const delta =
            step !== undefined && previous.step !== undefined ? step - previous.step : null;
        const backwards = delta === -1;
        const lastMove = backwards ? previous.state.lastMove : state.lastMove;

        previousState.current = { state, step };

        if (
            !enabled ||
            !lastMove ||
            (delta !== null ? Math.abs(delta) !== 1 : lastMove === previous.state.lastMove) ||
            matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            setCaptured(null);
            return;
        }

        const taken = backwards ? null : previous.state.board[lastMove.to];

        setCaptured(taken ? { index: lastMove.to, piece: taken } : null);

        const move = backwards ? { from: lastMove.to, to: lastMove.from } : lastMove;
        const board = boardRef.current;
        const from = board?.querySelector<HTMLElement>(`#point-${move.from}`);
        const to = board?.querySelector<HTMLElement>(`#point-${move.to}`);
        const piece = to?.querySelector<HTMLElement>('.piece');

        if (!from || !to || !piece) return;

        const start = from.getBoundingClientRect();
        const end = to.getBoundingClientRect();
        const animation = piece.animate(
            [{ translate: `${start.x - end.x}px ${start.y - end.y}px` }, { translate: '0px 0px' }],
            { duration: 220, easing: 'ease-out' },
        );

        const restored =
            backwards && state.board[move.from]
                ? from
                      .querySelector<HTMLElement>('.piece')
                      ?.animate([{ opacity: 0 }, { opacity: 1 }], {
                          duration: 220,
                          easing: 'ease-out',
                      })
                : undefined;

        // 移动途中置于其他棋子之上；快速连续走子或重置时清理动画。
        to.style.zIndex = '3';
        animation.onfinish = () => to.style.removeProperty('z-index');

        return () => {
            animation.cancel();
            restored?.cancel();
            to.style.removeProperty('z-index');
        };
    }, [state, enabled, step]);

    return { boardRef, captured, clearCapture: () => setCaptured(null) };
}
