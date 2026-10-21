import { describe, expect, it } from 'vitest';
import { PositionEditor } from './editor.js';
import { Board } from './board.js';
import { Kind, Side } from './piece.js';

const p = Board.indexOf;
const red = (kind: Kind) => ({ side: Side.Red, kind });

describe('position editor', () => {
    it('edits an isolated draft, restores pieces within their original counts and resets', () => {
        const board = new Board().data;
        const editor = new PositionEditor(board);
        expect(editor.canStart()).toBe(true);
        expect(editor.remaining(Side.Red, Kind.Chariot)).toBe(0);
        expect(editor.place(red(Kind.Chariot), p(3, 8))).toBe(false);
        expect(editor.remove(p(2, 12))).toBe(true);
        expect(board[p(2, 12)]?.kind).toBe(Kind.Chariot);
        expect(editor.remaining(Side.Red, Kind.Chariot)).toBe(1);
        expect(editor.place(red(Kind.Chariot), p(3, 8))).toBe(true);
        expect(editor.remaining(Side.Red, Kind.Chariot)).toBe(0);
        expect(editor.move(p(3, 8), p(5, 8))).toBe(true);
        editor.reset();
        expect(editor.data).toEqual(board);
    });

    it('always preserves kings and refuses replacing or duplicating them', () => {
        const editor = new PositionEditor(new Board().data);
        expect(editor.remove(p(6, 11))).toBe(false);
        expect(editor.move(p(5, 11), p(6, 11))).toBe(false);
        expect(editor.place(red(Kind.King), p(6, 10))).toBe(false);
        expect(editor.move(p(6, 11), p(6, 10))).toBe(true);
        editor.clear();
        expect(editor.data.filter(Boolean)).toHaveLength(2);
        expect(editor.data[p(6, 10)]?.kind).toBe(Kind.King);
        expect(editor.canStart()).toBe(false);
        expect(editor.move(p(6, 10), p(5, 10))).toBe(true);
        expect(editor.canStart()).toBe(true);
    });

    it('enforces reachable placement regions for both sides without imposing move paths', () => {
        for (const side of [Side.Red, Side.Black]) {
            const editor = new PositionEditor(new Board().data);
            editor.clear();
            const y = (value: number) => (side === Side.Black ? value : 12 - value);
            const piece = (kind: Kind) => ({ side, kind });
            expect(editor.place(piece(Kind.Advisor), p(6, y(2)))).toBe(true);
            expect(editor.place(piece(Kind.Advisor), p(5, y(2)))).toBe(false);
            expect(editor.place(piece(Kind.Elephant), p(2, y(3)))).toBe(true);
            expect(editor.place(piece(Kind.Elephant), p(2, y(5)))).toBe(false);
            expect(editor.place(piece(Kind.Pawn), p(3, y(5)))).toBe(false);
            expect(editor.place(piece(Kind.Pawn), p(3, y(7)))).toBe(true);
            expect(editor.place(piece(Kind.Guard), p(4, y(5)))).toBe(true);
            expect(editor.place(piece(Kind.Guard), p(3, y(5)))).toBe(false);
            expect(editor.place(piece(Kind.Train), p(6, 6))).toBe(true);
            expect(editor.place(piece(Kind.Train), p(5, 6))).toBe(false);
            expect(editor.place(piece(Kind.Horse), -1)).toBe(false);
            expect(editor.place(piece(Kind.Horse), 169)).toBe(false);
        }
    });

    it('replaces the target without switching selection and returns it to inventory', () => {
        const editor = new PositionEditor(new Board().data);
        const from = p(2, 8);
        const to = p(4, 8);
        expect(editor.move(from, from)).toBe(false);
        expect(editor.data[from]?.kind).toBe(Kind.Pawn);
        expect(editor.move(from, to)).toBe(true);
        expect(editor.data[from]).toBeNull();
        expect(editor.data[to]).toEqual(red(Kind.Pawn));
        expect(editor.remaining(Side.Red, Kind.Pawn)).toBe(1);
        expect(editor.move(to, p(3, 8))).toBe(false);
        expect(editor.data[to]).toEqual(red(Kind.Pawn));
        expect(editor.move(to, p(6, 11))).toBe(false);
        expect(editor.data[p(6, 11)]?.kind).toBe(Kind.King);
    });

    it('rejects stacked uncrossed pawns, including on the wall, for either side', () => {
        for (const side of [Side.Red, Side.Black]) {
            const editor = new PositionEditor(new Board().data);
            editor.clear();
            editor.move(p(6, 11), p(5, 11));
            const y = (value: number) => (side === Side.Black ? value : 12 - value);
            const pawn = { side, kind: Kind.Pawn };
            const from = p(8, y(4));
            expect(editor.place(pawn, from)).toBe(true);
            expect(editor.canPlace(pawn, p(8, y(5)))).toBe(false);
            expect(editor.place(pawn, p(8, y(6)))).toBe(false);
            expect(editor.move(from, p(8, y(5)))).toBe(true);
            expect(editor.move(p(8, y(5)), p(8, y(6)))).toBe(true);
            expect(editor.place(pawn, p(6, y(4)))).toBe(true);
            const snapshot = editor.data.slice();
            expect(editor.move(p(6, y(4)), p(8, y(5)))).toBe(false);
            expect(editor.data).toEqual(snapshot);
            expect(editor.place(pawn, p(8, y(7)))).toBe(true);
            expect(editor.place(pawn, p(8, y(8)))).toBe(true);
            expect(editor.canStart()).toBe(true);
            const invalid = editor.data.slice();
            invalid[p(8, y(4))] = pawn;
            expect(new PositionEditor(invalid).canStart()).toBe(false);
            expect(editor.move(p(6, y(4)), p(8, y(6)))).toBe(true);
            expect(editor.canStart()).toBe(true);
        }
    });

    it('validates kings before invoking game rules and rejects checked starting positions', () => {
        const board = new Board().data;
        board[p(6, 11)] = null;
        expect(new PositionEditor(board).canStart()).toBe(false);
        expect(new PositionEditor([]).canStart()).toBe(false);
        const editor = new PositionEditor(new Board().data);
        editor.clear();
        editor.move(p(6, 11), p(5, 11));
        expect(editor.place(red(Kind.Chariot), p(6, 3))).toBe(true);
        expect(editor.canStart()).toBe(false);
    });
});
