import { useEffect, useState } from 'react';
import { Game, type GameState } from '@xionghan/core/game';
import { Side } from '@xionghan/core/piece';
import { searchRequest, type SearchReply } from './protocol';

export function useComputer(
    game: GameState,
    side: Side,
    enabled: boolean,
    onMove: (from: number, to: number) => void,
) {
    const [error, setError] = useState('');
    const [draw, setDraw] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!enabled) return;

        let active = true;
        let worker: Worker | undefined;
        const fail = (message: string) => {
            if (active) setError(message);
            clearTimeout(timeout);
            worker?.terminate();
        };
        const timeout = setTimeout(() => fail('引擎响应超时，请重试。'), 15_000);

        setError('');
        setDraw(false);

        try {
            worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
            worker.onerror = () => fail('无法运行棋力引擎，请重试。');
            worker.onmessage = ({ data }: MessageEvent<SearchReply>) => {
                if (!active) return;

                clearTimeout(timeout);
                worker?.terminate();

                if ('error' in data) {
                    setError(data.error);
                } else if (!data.move) {
                    setDraw(true);
                } else if (
                    game.board[data.move.from]?.side !== side ||
                    !new Game(game).findLegalMoves(data.move.from).includes(data.move.to)
                ) {
                    setError('引擎返回了非法走法，请重试。');
                } else {
                    onMove(data.move.from, data.move.to);
                }
            };
            worker.postMessage(searchRequest(game, side));
        } catch (error) {
            clearTimeout(timeout);
            fail(error instanceof Error ? error.message : '无法启动棋力引擎。');
        }

        return () => {
            active = false;
            clearTimeout(timeout);
            worker?.terminate();
        };
    }, [game, side, enabled, onMove, attempt]);

    return { error, draw, retry: () => setAttempt((value) => value + 1) };
}
