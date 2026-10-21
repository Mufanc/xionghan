import { Board, type BoardData, type Index } from '@/core/board';
import { Kind, Side } from '@/core/piece';
import { Rules } from '@/core/rules';
import type { RecordData } from '@/core/record';

export interface GameState {
    record?: RecordData;
    board: BoardData;
    lastMove: { from: Index; to: Index } | null;
}

export class Game {
    private readonly board: Board;
    private readonly rules: Rules;

    constructor(private readonly state: GameState) {
        this.board = new Board(state.board);
        this.rules = new Rules(this.board);
    }

    static initialState(): GameState {
        return { board: new Board().data, lastMove: null };
    }

    tryMove(from: Index, to: Index, side: Side): boolean {
        if (
            !Number.isInteger(from) ||
            !Number.isInteger(to) ||
            from < 0 ||
            from >= Board.SIZE * Board.SIZE ||
            to < 0 ||
            to >= Board.SIZE * Board.SIZE ||
            this.board.at(from)?.side !== side ||
            !this.rules.isLegalMove(from, to)
        ) {
            return false;
        }

        this.board.move(from, to);

        this.state.lastMove = { from, to };

        return true;
    }

    findLegalMoves(from: Index): Index[] {
        return this.rules.findLegalMoves(from);
    }

    findForbiddenMoves(from: Index): Index[] {
        return this.rules.findForbiddenMoves(from);
    }

    getWinner(): Side | null {
        const lastMove = this.state.lastMove;
        const side = lastMove ? this.board.at(lastMove.to)?.side : undefined;

        if (!side) return null;

        const opponent = Side.opposite(side);
        const kingExists = this.state.board.some(
            (piece) => piece?.side === opponent && piece.kind === Kind.King,
        );

        return !kingExists || !this.rules.hasLegalMove(opponent) ? side : null;
    }

    isCheck(side: Side): boolean {
        return this.rules.isCheck(side);
    }
}
