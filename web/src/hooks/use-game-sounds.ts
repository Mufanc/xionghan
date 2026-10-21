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
        const isCheck = mover ? new Game(state).isCheck(Side.opposite(mover)) : false;

        sounds.update(state, isCheck, winner, step);
    }, [sounds, state, winner, step]);

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
