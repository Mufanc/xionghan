import { Board, type BoardData, type Index } from './board.js';
import { type GameState } from './game.js';
import { Kind, Piece, Side } from './piece.js';

export interface RecordedMove {
    from: Index;
    to: Index;
    side: Side;
    name: string;
}

export interface RecordData {
    initial: Omit<GameState, 'record'>;
    moves: RecordedMove[];
}

export class GameRecord {
    constructor(readonly data: RecordData) {}

    static create(state: GameState): GameRecord {
        return new GameRecord({
            initial: {
                board: state.board.slice(),
                lastMove: state.lastMove,
            },
            moves: [],
        });
    }

    static describe(board: BoardData, from: Index, to: Index): string {
        const piece = board[from]!;
        const start = Board.coordinatesOf(from);
        const end = Board.coordinatesOf(to);
        const columns = 'ABCDEFGHIJKLM';
        const peers = board.flatMap((other, index) =>
            other?.side === piece.side && other.kind === piece.kind ? [index] : [],
        );
        const sameFile = peers
            .filter((index) => index % Board.SIZE === start.x)
            .sort((a, b) => (piece.side === Side.Red ? a - b : b - a));
        let name = Piece.nameOf(piece.side, piece.kind) + columns[start.x];

        if (sameFile.length > 1) {
            const rank = sameFile.indexOf(from);
            const prefix =
                rank === 0
                    ? '前'
                    : rank === sameFile.length - 1
                      ? '后'
                      : sameFile.length === 3
                        ? '中'
                        : '二三四'[rank - 1];
            const repeatedFiles = new Set(
                peers
                    .filter((index) =>
                        peers.some(
                            (other) => other !== index && other % Board.SIZE === index % Board.SIZE,
                        ),
                    )
                    .map((index) => index % Board.SIZE),
            );

            name =
                prefix +
                (piece.kind === Kind.Pawn && repeatedFiles.size > 1 && prefix !== '中'
                    ? columns[start.x]
                    : Piece.nameOf(piece.side, piece.kind));
        }

        if (start.y === end.y) return name + '平' + columns[end.x];

        const forward = piece.side === Side.Red ? end.y < start.y : end.y > start.y;

        return (
            name +
            (forward ? '进' : '退') +
            (start.x === end.x ? Math.abs(end.y - start.y) : columns[end.x])
        );
    }

    stateAt(step: number): GameState {
        if (!Number.isInteger(step) || step < 0 || step > this.data.moves.length) {
            throw new RangeError('Invalid record step');
        }

        const state: GameState = {
            board: this.data.initial.board.map((piece) => piece && { ...piece }),
            lastMove: this.data.initial.lastMove && { ...this.data.initial.lastMove },
        };
        const board = new Board(state.board);

        for (const { from, to } of this.data.moves.slice(0, step)) {
            board.move(from, to);
            state.lastMove = { from, to };
        }

        return state;
    }
}
