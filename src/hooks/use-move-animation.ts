import { useLayoutEffect, useRef, useState } from 'react';
import type { GameState } from '@/core/game';
import type { Piece } from '@/core/piece';
import type { Index } from '@/core/board';

export function useMoveAnimation(state: GameState) {
    const boardRef = useRef<HTMLDivElement>(null);
    const previousState = useRef(state);
    const [captured, setCaptured] = useState<{ index: Index; piece: Piece } | null>(null);

    useLayoutEffect(() => {
        const previous = previousState.current;
        const { lastMove } = state;

        previousState.current = state;

        if (
            !lastMove ||
            lastMove === previous.lastMove ||
            matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            setCaptured(null);
            return;
        }

        const taken = previous.board[lastMove.to];

        setCaptured(taken ? { index: lastMove.to, piece: taken } : null);

        const board = boardRef.current;
        const from = board?.querySelector<HTMLElement>(`#point-${lastMove.from}`);
        const to = board?.querySelector<HTMLElement>(`#point-${lastMove.to}`);
        const piece = to?.querySelector<HTMLElement>('.piece');

        if (!from || !to || !piece) return;

        const start = from.getBoundingClientRect();
        const end = to.getBoundingClientRect();
        const animation = piece.animate(
            [{ translate: `${start.x - end.x}px ${start.y - end.y}px` }, { translate: '0px 0px' }],
            { duration: 220, easing: 'ease-out' },
        );

        // 移动途中置于其他棋子之上；快速连续走子或重置时清理动画。
        to.style.zIndex = '3';
        animation.onfinish = () => to.style.removeProperty('z-index');

        return () => {
            animation.cancel();
            to.style.removeProperty('z-index');
        };
    }, [state]);

    return { boardRef, captured, clearCapture: () => setCaptured(null) };
}
