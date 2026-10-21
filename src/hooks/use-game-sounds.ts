import { useEffect, useState } from 'react';
import { GameSounds } from '@/audio/game-sounds';
import type { Side } from '@/core/piece';
import type { GameState } from '@/core/game';

export function useGameSounds(
    state: GameState,
    isCheck: boolean,
    enabled: boolean,
    winner: Side | null,
) {
    const [sounds] = useState(() => new GameSounds(state));

    useEffect(() => {
        sounds.setEnabled(enabled);
    }, [sounds, enabled]);

    useEffect(() => {
        sounds.update(state, isCheck, winner);
    }, [sounds, state, isCheck, winner]);

    useEffect(() => () => sounds.stop(), [sounds]);

    return sounds;
}
