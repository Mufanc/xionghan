import { Client } from 'boardgame.io/client';
import { gameConfig, playerSide } from '@/adapters/boardgame';
import { Game } from '@/core/game';
import { Board } from '@/core/board';

export type Player = '0' | '1';
type Move = [number, number];
const isIndex = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < Board.SIZE ** 2;

/** 只传走法；接收方通过 bgio 重放，不接受远端直接覆盖局面或胜负。 */
export class OnlineGame {
    private readonly client = Client({ game: gameConfig, debug: false });
    private history: Move[] = [];
    private pending: Move | null = null;
    ready = false;

    constructor(
        readonly player: Player,
        private readonly send: (message: unknown) => void,
        private readonly changed: () => void,
    ) {}

    get state() {
        return this.client.getState()!;
    }

    disconnect() {
        this.ready = false;
        this.changed();
    }

    connect() {
        this.ready = false;
        this.send({ type: 'hello', version: 1 });
        this.changed();
    }

    private sync() {
        this.send({ type: 'history', moves: this.history });
    }

    private canMove(from: number, to: number, player: Player) {
        const { G, ctx } = this.state;

        return (
            !ctx.gameover &&
            ctx.currentPlayer === player &&
            G.board[from]?.side === playerSide(player) &&
            new Game(G).findLegalMoves(from).includes(to)
        );
    }

    private apply(from: number, to: number) {
        this.client.moves.move(from, to);
        this.history.push([from, to]);
    }

    move(from: number, to: number) {
        if (!this.ready || !isIndex(from) || !isIndex(to) || !this.canMove(from, to, this.player)) {
            return;
        }

        this.ready = false;

        if (this.player === '0') {
            this.apply(from, to);
            this.sync();
        } else {
            this.pending = [from, to];
            this.send({ type: 'move', step: this.history.length, from, to });
        }

        this.changed();
    }

    receive(value: unknown): boolean {
        if (!value || typeof value !== 'object') return false;

        const message = value as Record<string, unknown>;

        if (message.type === 'hello') {
            if (message.version !== 1) return false;
            if (this.player === '0') this.sync();
        } else if (message.type === 'move' && this.player === '0') {
            if (
                !this.ready ||
                message.step !== this.history.length ||
                !isIndex(message.from) ||
                !isIndex(message.to) ||
                !this.canMove(message.from, message.to, '1')
            ) {
                return false;
            }

            this.ready = false;
            this.apply(message.from, message.to);
            this.sync();
        } else if (message.type === 'history' && this.player === '1') {
            const moves = message.moves;

            // shortcut: 限制不可信消息至两万步，更长棋局需改为分段同步。
            if (
                !Array.isArray(moves) ||
                moves.length < this.history.length ||
                moves.length > 20000
            ) {
                return false;
            }

            for (let index = 0; index < moves.length; index++) {
                const move = moves[index];
                const known = this.history[index];

                if (
                    !Array.isArray(move) ||
                    move.length !== 2 ||
                    !isIndex(move[0]) ||
                    !isIndex(move[1]) ||
                    (known && (known[0] !== move[0] || known[1] !== move[1]))
                ) {
                    return false;
                }
            }

            // 先完整校验增量，避免无效消息只应用一半。
            const trial = {
                board: structuredClone(this.state.G.board),
                lastMove: this.state.G.lastMove,
            };
            let player = this.state.ctx.currentPlayer as Player;
            let pending = this.pending;

            for (const [from, to] of moves.slice(this.history.length)) {
                const game = new Game(trial);

                if (player === '1') {
                    if (!pending || pending[0] !== from || pending[1] !== to) return false;

                    pending = null;
                }

                if (game.getWinner() || !game.tryMove(from, to, playerSide(player))) return false;

                player = player === '0' ? '1' : '0';
            }

            for (const [from, to] of moves.slice(this.history.length)) this.apply(from, to);

            this.pending = null;
            this.ready = true;
            this.send({ type: 'ack', step: this.history.length });
        } else if (message.type === 'ack' && this.player === '0') {
            if (message.step !== this.history.length) return false;

            this.ready = true;
        } else {
            return false;
        }

        this.changed();

        return true;
    }
}
