import { Kind, Side, type Piece } from './piece.js';

export type Index = number;
export type BoardData = (Piece | null)[];

export class Board {
    static readonly SIZE = 13;

    static indexOf(x: number, y: number): Index {
        return y * Board.SIZE + x;
    }

    static coordinatesOf(index: Index): { x: number; y: number } {
        return { x: index % Board.SIZE, y: Math.floor(index / Board.SIZE) };
    }

    readonly data: BoardData;

    constructor(data?: BoardData) {
        this.data = data ?? Array(Board.SIZE * Board.SIZE).fill(null);

        if (data === undefined) {
            this.reset();
        }
    }

    at(index: Index): Piece | null {
        return this.data[index] ?? null;
    }

    // The caller validates the move; Rules also uses this to simulate positions.
    move(from: Index, to: Index): Piece | null {
        const captured = this.at(to);

        this.data[to] = this.data[from];
        this.data[from] = null;

        return captured;
    }

    reset(): void {
        const pairs: [Kind, number, number][] = [
            [Kind.Advisor, 5, 1],
            [Kind.Elephant, 4, 1],
            [Kind.Horse, 3, 1],
            [Kind.Chariot, 2, 0],
            [Kind.Cannon, 1, 3],
            [Kind.Guard, 0, 5],
            [Kind.Train, 0, 0],
            [Kind.Catapult, 4, 0],
        ];

        this.data.fill(null);

        for (const side of [Side.Black, Side.Red] as const) {
            const put = (kind: Kind, x: number, y: number) => {
                this.data[Board.indexOf(x, side === Side.Red ? 12 - y : y)] = { side, kind };
            };

            put(Kind.King, 6, 1);

            for (const [kind, x, y] of pairs) {
                put(kind, x, y);
                put(kind, 12 - x, y);
            }

            for (let x = 2; x <= 10; x += 2) {
                put(Kind.Pawn, x, 4);
            }
        }
    }
}
