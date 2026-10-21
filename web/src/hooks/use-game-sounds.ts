import { useEffect, useState } from 'react';
import { GameSounds } from '@/audio/game-sounds';
import type { Side } from '@xionghan/core/piece';
import type { GameState } from '@xionghan/core/game';

export function useGameSounds(
    state: GameState,
    isCheck: boolean,
    enabled: boolean,
    winner: Side | null,
    step: number,
    volume: number,
) {
    const [sounds] = useState(() => new GameSounds(state, step));

    useEffect(() => {
        sounds.setVolume(volume);
        sounds.setEnabled(enabled);
    }, [sounds, enabled, volume]);

    useEffect(() => {
        sounds.update(state, isCheck, winner, step);
    }, [sounds, state, isCheck, winner, step]);

    useEffect(() => () => sounds.stop(), [sounds]);

    return sounds;
}
