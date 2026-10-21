import type { GameState } from '@xionghan/core/game';
import { Side } from '@xionghan/core/piece';
import pick from '@/assets/audio/pick.ogg';
import illegal from '@/assets/audio/illegal.ogg';
import moveSelf from '@/assets/audio/move-self.ogg';
import moveOpponent from '@/assets/audio/move-opponent.ogg';
import captureSelf from '@/assets/audio/capture-self.ogg';
import captureOpponent from '@/assets/audio/capture-opponent.ogg';
import checkSelf from '@/assets/audio/check-self.ogg';
import checkOpponent from '@/assets/audio/check-opponent.ogg';
import win from '@/assets/audio/checkmate.ogg';
import start from '@/assets/audio/start.ogg';

const tracks = {
    move: { [Side.Red]: moveSelf, [Side.Black]: moveOpponent },
    capture: { [Side.Red]: captureSelf, [Side.Black]: captureOpponent },
    check: { [Side.Red]: checkSelf, [Side.Black]: checkOpponent },
};

export class GameSounds {
    private enabled = false;
    private volume = 1;
    private current: HTMLAudioElement | null = null;

    constructor(
        private previous: GameState,
        private previousStep?: number,
    ) {}

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;

        if (!enabled) this.stop();
    }

    setVolume(volume: number): void {
        this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;

        if (this.current) this.current.volume = this.volume;
    }

    start(): void {
        this.play(start);
    }

    pick(): void {
        this.play(pick);
    }

    illegal(): void {
        this.play(illegal);
    }

    update(state: GameState, isCheck: boolean, winner: Side | null = null, step?: number): void {
        const before = this.previous;
        const duplicate =
            step === this.previousStep &&
            state.lastMove?.from === before.lastMove?.from &&
            state.lastMove?.to === before.lastMove?.to &&
            state.board.every(
                (piece, index) =>
                    piece?.side === before.board[index]?.side &&
                    piece?.kind === before.board[index]?.kind,
            );
        const forward = step === undefined || step === (this.previousStep ?? step) + 1;
        this.previousStep = step;

        // 静音期间也跟进局面，重新开启时不补播过去的走子。
        this.previous = state;

        // 服务端确认会重发同一局面，不能截断客户端刚播放的音效。
        if (duplicate) return;

        if (!state.lastMove || !forward) {
            this.stop();
            return;
        }

        if (!this.enabled || state.lastMove === before.lastMove) return;

        const { to } = state.lastMove;
        const side = state.board[to]!.side;

        if (winner) {
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
        this.current.volume = this.volume;
        // 浏览器可能限制音频播放；音效失败不应中断对局。
        void this.current.play().catch(() => {});
    }
}
