import { Board, type BoardData, type Index } from '@/core/board';
import { Kind, Side } from '@/core/piece';
import { Rules } from '@/core/rules';
import type { RecordData } from '@/core/record';

export interface GameState {
    record?: RecordData;
    board: BoardData;
    lastMove: { from: Index; to: Index } | null;
    winner: Side | null;
}

export class Game {
    private readonly board: Board;
    private readonly rules: Rules;

    constructor(private readonly state: GameState) {
        this.board = new Board(state.board);
        this.rules = new Rules(this.board);
    }

    static initialState(): GameState {
        return { board: new Board().data, lastMove: null, winner: null };
    }

    tryMove(from: Index, to: Index, side: Side): boolean {
        if (
            this.state.winner ||
            !Number.isInteger(from) ||
            !Number.isInteger(to) ||
            from < 0 ||
            from >= Board.SIZE * Board.SIZE ||
            to < 0 ||
            to >= Board.SIZE * Board.SIZE ||
            this.board.at(from)?.side !== side ||
            !this.rules.findLegalMoves(from).includes(to)
        ) {
            return false;
        }

        const captured = this.board.move(from, to);

        this.state.lastMove = { from, to };

        if (captured?.kind === Kind.King || !this.rules.hasLegalMove(Side.opposite(side))) {
            this.state.winner = side;
        }

        return true;
    }

    findLegalMoves(from: Index): Index[] {
        return this.state.winner ? [] : this.rules.findLegalMoves(from);
    }

    findForbiddenMoves(from: Index): Index[] {
        return this.state.winner ? [] : this.rules.findForbiddenMoves(from);
    }

    isCheck(side: Side): boolean {
        return this.rules.isCheck(side);
    }
}
