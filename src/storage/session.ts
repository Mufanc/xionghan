import { Board, type BoardData } from '@/core/board';
import type { GameState } from '@/core/game';
import { Kind, Piece, Side } from '@/core/piece';

export interface SavedSession {
    version: 1;
    game: GameState;
    currentPlayer: '0' | '1';
    draft: BoardData | null;
    soundEnabled: boolean;
}

const key = 'xionghan.session';
const isSide = (value: unknown): value is Side => value === Side.Red || value === Side.Black;
const isIndex = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < Board.SIZE ** 2;

function isBoard(value: unknown, winner: Side | null = null): value is BoardData {
    if (!Array.isArray(value) || value.length !== Board.SIZE ** 2) return false;

    if (
        value.some(
            (piece) =>
                piece !== null &&
                (typeof piece !== 'object' ||
                    !isSide(piece.side) ||
                    !Object.values(Kind).includes(piece.kind)),
        )
    )
        return false;

    for (const side of [Side.Red, Side.Black]) {
        for (const kind of Object.values(Kind)) {
            const count = value.filter(
                (piece) => piece?.side === side && piece.kind === kind,
            ).length;

            if (count > Piece.initialCount(kind)) return false;
            if (kind === Kind.King && count !== 1 && (!winner || winner === side)) return false;
        }
    }

    return true;
}

export function loadSession(): SavedSession | null {
    try {
        const saved = JSON.parse(localStorage.getItem(key) ?? 'null');

        if (
            !saved ||
            saved.version !== 1 ||
            !['0', '1'].includes(saved.currentPlayer) ||
            typeof saved.soundEnabled !== 'boolean' ||
            !saved.game ||
            (saved.game.winner !== null && !isSide(saved.game.winner)) ||
            !isBoard(saved.game.board, saved.game.winner) ||
            (saved.draft !== null && !isBoard(saved.draft))
        )
            return null;

        const move = saved.game.lastMove;

        if (
            move !== null &&
            (!move ||
                !isIndex(move.from) ||
                !isIndex(move.to) ||
                move.from === move.to ||
                saved.game.board[move.from] !== null ||
                !saved.game.board[move.to])
        )
            return null;

        return saved;
    } catch {
        return null;
    }
}

export function saveSession(session: SavedSession): void {
    try {
        localStorage.setItem(key, JSON.stringify(session));
    } catch (error) {
        // 存储被禁用或容量耗尽时，仍允许继续对弈。
        console.warn('无法保存当前对局', error);
    }
}
