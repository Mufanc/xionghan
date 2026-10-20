import { Board, type BoardData, type Index } from '@/core/board';
import { Kind, Side, Piece } from '@/core/piece';
import { Rules } from '@/core/rules';

export class PositionEditor {
    private readonly board: Board;

    constructor(data: BoardData) {
        this.board = new Board(data.slice());
    }

    get data(): BoardData {
        return this.board.data;
    }

    remaining(side: Side, kind: Kind): number {
        return (
            Piece.initialCount(kind) -
            this.data.filter((p) => p?.side === side && p.kind === kind).length
        );
    }

    canPlace(piece: Piece, index: Index, from?: Index): boolean {
        if (!Number.isInteger(index) || index < 0 || index >= Board.SIZE * Board.SIZE) return false;

        const { x, y } = Board.coordinatesOf(index);
        const homeY = piece.side === Side.Black ? y : 12 - y;
        const palace = x >= 5 && x <= 7 && homeY >= 1 && homeY <= 3;

        switch (piece.kind) {
            case Kind.King:
                return palace;
            case Kind.Advisor:
                return palace && (x + homeY) % 2 === 0;
            case Kind.Elephant:
                return (
                    ((homeY === 1 || homeY === 5) && x % 4 === 0) || (homeY === 3 && x % 4 === 2)
                );
            case Kind.Pawn:
                if (homeY >= 7) return true;
                if (homeY < 4 || x < 2 || x > 10 || x % 2 !== 0) return false;

                // 未过城不能横走，同方在一列只能保留一枚未过城兵；替换目标和移动起点不计入。
                return !this.data.some((other, otherIndex) => {
                    if (
                        otherIndex === index ||
                        otherIndex === from ||
                        other?.side !== piece.side ||
                        other.kind !== Kind.Pawn
                    )
                        return false;

                    const position = Board.coordinatesOf(otherIndex);
                    const otherHomeY = piece.side === Side.Black ? position.y : 12 - position.y;

                    return position.x === x && otherHomeY <= 6;
                });
            case Kind.Guard:
                return homeY === 5 && x % 2 === 0;
            case Kind.Train:
                return (x + y) % 6 === 0 || (x - y) % 6 === 0;
            default:
                return true;
        }
    }

    place(piece: Piece, to: Index): boolean {
        if (
            !this.canPlace(piece, to) ||
            this.board.at(to)?.kind === Kind.King ||
            this.remaining(piece.side, piece.kind) <= 0
        )
            return false;

        this.data[to] = { ...piece };

        return true;
    }

    move(from: Index, to: Index): boolean {
        const piece = this.board.at(from);

        if (
            from === to ||
            !piece ||
            !this.canPlace(piece, to, from) ||
            this.board.at(to)?.kind === Kind.King
        )
            return false;

        this.board.move(from, to);

        return true;
    }

    remove(index: Index): boolean {
        const piece = this.board.at(index);

        if (!piece || piece.kind === Kind.King) return false;

        this.data[index] = null;

        return true;
    }

    clear(): void {
        for (let index = 0; index < this.data.length; index++) {
            if (this.data[index]?.kind !== Kind.King) this.data[index] = null;
        }
    }

    reset(): void {
        this.board.reset();
    }

    canStart(): boolean {
        if (this.data.length !== Board.SIZE * Board.SIZE) return false;

        if (
            this.data.some(
                (piece, index) =>
                    piece &&
                    (!Object.values(Side).includes(piece.side) ||
                        !Object.values(Kind).includes(piece.kind) ||
                        !this.canPlace(piece, index)),
            )
        )
            return false;

        for (const side of [Side.Red, Side.Black]) {
            if (this.remaining(side, Kind.King) !== 0) return false;

            for (const kind of Object.values(Kind)) {
                if (this.remaining(side, kind) < 0) return false;
            }
        }

        const rules = new Rules(this.board);

        return (
            !rules.isCheck(Side.Red) && !rules.isCheck(Side.Black) && rules.hasLegalMove(Side.Red)
        );
    }
}
