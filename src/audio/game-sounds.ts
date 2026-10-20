import type { GameState } from '@/core/game';
import { Side } from '@/core/piece';
import pick from '@/assets/audio/pick.ogg';
import illegal from '@/assets/audio/illegal.ogg';
import moveSelf from '@/assets/audio/move-self.ogg';
import moveOpponent from '@/assets/audio/move-opponent.ogg';
import captureSelf from '@/assets/audio/capture-self.ogg';
import captureOpponent from '@/assets/audio/capture-opponent.ogg';
import checkSelf from '@/assets/audio/check-self.ogg';
import checkOpponent from '@/assets/audio/check-opponent.ogg';
import win from '@/assets/audio/checkmate.ogg';

const tracks = {
    move: { [Side.Red]: moveSelf, [Side.Black]: moveOpponent },
    capture: { [Side.Red]: captureSelf, [Side.Black]: captureOpponent },
    check: { [Side.Red]: checkSelf, [Side.Black]: checkOpponent },
};

export class GameSounds {
    private enabled = false;
    private current: HTMLAudioElement | null = null;

    constructor(private previous: GameState) {}

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;

        if (!enabled) this.stop();
    }

    pick(): void {
        this.play(pick);
    }

    illegal(): void {
        this.play(illegal);
    }

    update(state: GameState, isCheck: boolean): void {
        const before = this.previous;

        // 静音期间也跟进局面，重新开启时不补播过去的走子。
        this.previous = state;

        if (!state.lastMove) {
            this.stop();
            return;
        }

        if (!this.enabled || state.lastMove === before.lastMove) return;

        const { to } = state.lastMove;
        const side = state.board[to]!.side;

        if (state.winner) {
            this.play(win);
        } else if (isCheck) {
            this.play(tracks.check[side]);
        } else if (before.board[to]) {
            this.play(tracks.capture[side]);
        } else {
            this.play(tracks.move[side]);
        }
    }

    stop(): void {
        if (!this.current) return;

        this.current.pause();
        this.current.currentTime = 0;
        this.current = null;
    }

    private play(source: string): void {
        if (!this.enabled) return;

        this.stop();
        this.current = new Audio(source);
        // 浏览器可能限制音频播放；音效失败不应中断对局。
        void this.current.play().catch(() => {});
    }
}
