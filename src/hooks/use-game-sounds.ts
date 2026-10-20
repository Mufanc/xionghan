import { useEffect, useState } from 'react';
import { GameSounds } from '@/audio/game-sounds';
import type { GameState } from '@/core/game';

export function useGameSounds(state: GameState, isCheck: boolean, enabled: boolean) {
    const [sounds] = useState(() => new GameSounds(state));

    useEffect(() => {
        sounds.setEnabled(enabled);
    }, [sounds, enabled]);

    useEffect(() => {
        sounds.update(state, isCheck);
    }, [sounds, state, isCheck]);

    useEffect(() => () => sounds.stop(), [sounds]);

    return sounds;
}
