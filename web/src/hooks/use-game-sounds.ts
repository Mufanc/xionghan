import { useEffect, useRef, useState } from 'react';
import { GameSounds } from '@/audio/game-sounds';
import { Side } from '@xionghan/core/piece';
import { Game } from '@xionghan/core/game';
import type { GameState } from '@xionghan/core/game';

export function useGameSounds(
    state: GameState,
    enabled: boolean,
    winner: Side | null,
    step: number,
    volume: number,
    startKey?: string,
    selfSide = Side.Red,
) {
    const started = useRef(false);
    const [sounds] = useState(() => new GameSounds(state, step));

    useEffect(() => {
        sounds.setVolume(volume);
        sounds.setEnabled(enabled);
    }, [sounds, enabled, volume]);

    useEffect(() => {
        const mover = state.lastMove ? state.board[state.lastMove.to]?.side : undefined;
        // 联机预览落子后 ctx 可能尚未换方，音效只看实际落子方攻击的王。
        const game = new Game(state);
        const isCheck = mover ? game.isCheck(Side.opposite(mover)) : false;
        // 本地预测落子时 ctx.gameover 尚未确认，将死音效也以实际局面为准。
        const result = winner ?? (mover ? game.getWinner() : null);

        sounds.update(state, isCheck, result, step, selfSide);
    }, [sounds, state, winner, step, selfSide]);

    useEffect(() => () => sounds.stop(), [sounds]);

    useEffect(() => {
        if (!startKey || started.current) return;

        let cancelled = false;

        // 等挂载完成，避免 StrictMode 的模拟卸载立即截断开局音效。
        queueMicrotask(() => {
            if (cancelled || started.current) return;
            started.current = true;

            if (startKey !== 'local') {
                try {
                    const key = `xionghan.start-sound:${startKey}`;
                    if (localStorage.getItem(key)) return;
                    localStorage.setItem(key, 'played');
                } catch {
                    // 无法保存时仍播放，本次连接不重复触发。
                }
            }

            sounds.start();
        });

        return () => {
            cancelled = true;
        };
    }, [sounds, startKey]);

    return sounds;
}
