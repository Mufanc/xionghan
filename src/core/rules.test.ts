import { describe, expect, it } from 'vitest';
import { Board, type BoardData } from '@/core/board';
import { Kind, Side } from '@/core/piece';
import { Rules } from '@/core/rules';

const p = Board.indexOf;

function fixture(...pieces: [Side, Kind, number, number][]): BoardData {
    const board: BoardData = Array(Board.SIZE * Board.SIZE).fill(null);
    for (const [side, x, y] of [
        [Side.Black, 5, 1],
        [Side.Red, 7, 11],
    ] as const) {
        if (!pieces.some(([color, kind]) => color === side && kind === Kind.King)) {
            board[p(x, y)] = { side, kind: Kind.King };
        }
    }
    for (const [side, kind, x, y] of pieces) board[p(x, y)] = { side, kind };
    return board;
}

const kings: [Side, Kind, number, number][] = [
    [Side.Black, Kind.King, 6, 1],
    [Side.Red, Kind.King, 6, 11],
    [Side.Red, Kind.Pawn, 6, 8],
];

function targets(board: BoardData, x: number, y: number) {
    return new Rules(new Board(board)).findLegalMoves(p(x, y)).map(Board.coordinatesOf);
}

describe('default position', () => {
    it('preserves supplied positions and resets their array in place', () => {
        const initial = new Board().data;
        const board = new Board();
        const data = board.data;
        board.move(p(2, 8), p(2, 5));
        const resumed = new Board(data);
        expect(resumed.at(p(2, 8))).toBeNull();
        expect(resumed.at(p(2, 5))?.side).toBe(Side.Red);
        resumed.reset();
        expect(resumed.data).toBe(data);
        expect(board.data).toEqual(initial);
        resumed.reset();
        expect(data).toEqual(initial);
    });

    it('creates independent default boards and reports captures without applying rules', () => {
        const board = new Board();
        const another = new Board();
        const captured = board.at(p(2, 4));
        expect(board.move(p(2, 8), p(2, 4))).toBe(captured);
        expect(board.at(p(2, 4))?.side).toBe(Side.Red);
        expect(another.at(p(2, 4))?.side).toBe(Side.Black);
        expect(another.at(p(2, 8))?.side).toBe(Side.Red);
    });

    it('sets up 44 pieces with red below and all ten kinds per side', () => {
        const board = new Board().data;
        expect(board.filter(Boolean)).toHaveLength(44);
        for (const side of [Side.Red, Side.Black]) {
            expect(board.filter((piece) => piece?.side === side)).toHaveLength(22);
            expect(
                new Set(board.filter((piece) => piece?.side === side).map((piece) => piece!.kind))
                    .size,
            ).toBe(10);
        }
        expect(board[p(6, 11)]).toEqual({ side: Side.Red, kind: Kind.King });
        expect(new Rules(new Board(board)).isCheck(Side.Red)).toBe(false);
        expect(new Rules(new Board(board)).isCheck(Side.Black)).toBe(false);
        expect(new Rules(new Board(board)).hasLegalMove(Side.Red)).toBe(true);
    });

    it('reads without mutation and applies moves directly to the supplied board', () => {
        const board = new Board().data;
        const snapshot = JSON.stringify(board);
        const next = new Board(board);
        new Rules(next).findLegalMoves(p(2, 8));
        expect(JSON.stringify(board)).toBe(snapshot);
        expect(next.move(p(2, 8), p(2, 5))).toBeNull();
        expect(next.at(p(2, 8))).toBeNull();
        expect(next.at(p(2, 5))?.kind).toBe(Kind.Pawn);
        expect(board[p(2, 8)]).toBeNull();
        expect(board[p(2, 5)]?.kind).toBe(Kind.Pawn);
    });
});

describe('piece rules', () => {
    it('keeps kings and advisors within the palace', () => {
        const board = fixture(...kings, [Side.Black, Kind.Advisor, 5, 1]);
        expect(targets(board, 6, 1)).not.toContainEqual({ x: 6, y: 0 });
        expect(targets(board, 5, 1)).toEqual([{ x: 6, y: 2 }]);
    });

    it('blocks elephant eyes and the wall', () => {
        const board = fixture([Side.Black, Kind.Elephant, 4, 5], [Side.Red, Kind.Pawn, 5, 4]);
        expect(targets(board, 4, 5)).toEqual([{ x: 2, y: 3 }]);
    });

    it('supports both long horse and L moves, with the correct legs', () => {
        const board = fixture([Side.Black, Kind.Horse, 6, 6]);
        expect(new Rules(new Board(board)).findLegalMoves(p(6, 6))).toHaveLength(12);
        board[p(7, 6)] = { side: Side.Red, kind: Kind.Pawn };
        expect(targets(board, 6, 6)).not.toContainEqual({ x: 8, y: 7 });
        expect(targets(board, 6, 6)).not.toContainEqual({ x: 9, y: 6 });
        expect(targets(board, 6, 6)).toContainEqual({ x: 7, y: 8 });
        board[p(6, 8)] = { side: Side.Red, kind: Kind.Pawn };
        expect(targets(board, 6, 6)).not.toContainEqual({ x: 6, y: 9 });
        expect(targets(board, 6, 6)).toContainEqual({ x: 7, y: 8 });
    });

    it('stops a chariot at the first occupied point', () => {
        const board = fixture([Side.Black, Kind.Chariot, 0, 0], [Side.Red, Kind.Pawn, 0, 3]);
        expect(targets(board, 0, 0)).toContainEqual({ x: 0, y: 3 });
        expect(targets(board, 0, 0)).not.toContainEqual({ x: 0, y: 4 });
    });

    it('requires exactly one screen for cannon captures', () => {
        const board = fixture(
            [Side.Black, Kind.Cannon, 0, 0],
            [Side.Black, Kind.Pawn, 0, 2],
            [Side.Red, Kind.Pawn, 0, 5],
            [Side.Red, Kind.Pawn, 0, 7],
        );
        expect(targets(board, 0, 0)).toContainEqual({ x: 0, y: 1 });
        expect(targets(board, 0, 0)).not.toContainEqual({ x: 0, y: 3 });
        expect(targets(board, 0, 0)).toContainEqual({ x: 0, y: 5 });
        expect(targets(board, 0, 0)).not.toContainEqual({ x: 0, y: 7 });
    });

    it.each([Side.Black, Side.Red] as const)(
        'handles %s pawn river, captures and direction',
        (side) => {
            const y = (value: number) => (side === Side.Black ? value : 12 - value);
            const board = fixture([side, Kind.Pawn, 2, y(4)]);
            expect(targets(board, 2, y(4))).toEqual(
                expect.arrayContaining([5, 6, 7].map((value) => ({ x: 2, y: y(value) }))),
            );
            expect(new Rules(new Board(board)).findLegalMoves(p(2, y(4)))).toHaveLength(3);
            board[p(2, y(6))] = {
                side: side === Side.Black ? Side.Red : Side.Black,
                kind: Kind.Pawn,
            };
            expect(targets(board, 2, y(4))).toEqual([{ x: 2, y: y(5) }]);
            const crossed = fixture([side, Kind.Pawn, 2, y(7)]);
            expect(targets(crossed, 2, y(7))).toEqual(
                expect.arrayContaining([
                    { x: 1, y: y(7) },
                    { x: 3, y: y(7) },
                    { x: 2, y: y(8) },
                ]),
            );
            expect(new Rules(new Board(crossed)).findLegalMoves(p(2, y(7)))).toHaveLength(3);
        },
    );

    it('allows adjacent pawn capture before crossing', () => {
        const board = fixture([Side.Black, Kind.Pawn, 2, 4], [Side.Red, Kind.Guard, 2, 5]);
        expect(targets(board, 2, 4)).toEqual([{ x: 2, y: 5 }]);
    });

    it('stops trains at the next star and restricts captures to star departures', () => {
        const board = fixture([Side.Black, Kind.Train, 0, 0]);
        expect(targets(board, 0, 0)).toEqual([
            { x: 1, y: 1 },
            { x: 2, y: 2 },
            { x: 3, y: 3 },
        ]);
        board[p(2, 2)] = { side: Side.Red, kind: Kind.Pawn };
        expect(targets(board, 0, 0)).toEqual([
            { x: 1, y: 1 },
            { x: 2, y: 2 },
        ]);
        const offStar = fixture([Side.Black, Kind.Train, 1, 1], [Side.Red, Kind.Pawn, 2, 2]);
        expect(targets(offStar, 1, 1)).not.toContainEqual({ x: 2, y: 2 });
        expect(targets(offStar, 1, 1)).not.toContainEqual({ x: 2, y: 0 });
    });

    it('keeps trains on the same track throughout the move', () => {
        const board = fixture([Side.Black, Kind.Train, 4, 4]);
        expect(targets(board, 4, 4)).not.toContainEqual({ x: 7, y: 1 });
        expect(targets(board, 4, 4)).not.toContainEqual({ x: 1, y: 7 });
        expect(targets(board, 4, 4)).toContainEqual({ x: 5, y: 5 });
        expect(targets(board, 4, 4)).toContainEqual({ x: 6, y: 6 });
    });

    it('lets guards move even distances and capture only two points away', () => {
        const board = fixture([Side.Black, Kind.Guard, 0, 5], [Side.Red, Kind.Pawn, 6, 5]);
        expect(targets(board, 0, 5)).toEqual([
            { x: 2, y: 5 },
            { x: 4, y: 5 },
        ]);
        board[p(2, 5)] = { side: Side.Red, kind: Kind.Pawn };
        expect(targets(board, 0, 5)).toEqual([{ x: 2, y: 5 }]);
        board[p(1, 5)] = { side: Side.Black, kind: Kind.Pawn };
        expect(targets(board, 0, 5)).toEqual([]);
    });

    it('lets catapults slide but only capture adjacent unprotected targets', () => {
        const board = fixture(
            [Side.Black, Kind.Catapult, 4, 4],
            [Side.Red, Kind.Pawn, 5, 4],
            [Side.Red, Kind.Pawn, 4, 7],
        );
        expect(targets(board, 4, 4)).toContainEqual({ x: 5, y: 4 });
        expect(targets(board, 4, 4)).not.toContainEqual({ x: 4, y: 7 });
        expect(targets(board, 4, 4)).toContainEqual({ x: 4, y: 6 });
        board[p(5, 5)] = { side: Side.Black, kind: Kind.Guard };
        expect(targets(board, 4, 4)).not.toContainEqual({ x: 5, y: 4 });
    });
});

describe('king safety and endings', () => {
    it('rejects exposing facing kings', () => {
        const board = fixture(...kings);
        board[p(6, 8)] = { side: Side.Red, kind: Kind.Chariot };
        expect(new Rules(new Board(board)).findLegalMoves(p(6, 8))).not.toContain(p(5, 8));
    });

    it('detects a pawn attacking a king directly in front', () => {
        const board = fixture(...kings, [Side.Black, Kind.Pawn, 6, 10]);
        expect(new Rules(new Board(board)).isCheck(Side.Red)).toBe(true);
        expect(new Rules(new Board(board)).findLegalMoves(p(6, 8))).toEqual([]);
    });

    it('permits capturing a checking piece', () => {
        const board = fixture(...kings, [Side.Black, Kind.Chariot, 5, 11]);
        expect(new Rules(new Board(board)).isCheck(Side.Red)).toBe(true);
        expect(new Rules(new Board(board)).findLegalMoves(p(6, 11))).toContain(p(5, 11));
    });

    it('treats no legal move as a loss, including stalemate', () => {
        const board = fixture(
            [Side.Red, Kind.King, 6, 11],
            [Side.Black, Kind.King, 6, 1],
            [Side.Black, Kind.Chariot, 5, 9],
            [Side.Black, Kind.Chariot, 7, 9],
            [Side.Black, Kind.Pawn, 6, 9],
        );
        expect(new Rules(new Board(board)).isCheck(Side.Red)).toBe(false);
        expect(new Rules(new Board(board)).hasLegalMove(Side.Red)).toBe(false);
    });

    it('detects facing kings', () => {
        const board = fixture([Side.Red, Kind.King, 6, 11], [Side.Black, Kind.King, 6, 1]);
        expect(new Rules(new Board(board)).isCheck(Side.Red)).toBe(true);
        expect(new Rules(new Board(board)).isCheck(Side.Black)).toBe(true);
    });
});
