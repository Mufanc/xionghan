import { Board, type BoardData } from '@xionghan/core/board';
import { Game, type GameState } from '@xionghan/core/game';
import { GameRecord } from '@xionghan/core/record';
import { Kind, Piece, Side } from '@xionghan/core/piece';

export interface SavedSession {
    version: 1;
    game: GameState;
    currentPlayer: '0' | '1';
    draft: BoardData | null;
    soundEnabled: boolean;
    volume?: number;
    recordVisible?: boolean;
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
            (saved.volume !== undefined &&
                (typeof saved.volume !== 'number' ||
                    !Number.isFinite(saved.volume) ||
                    saved.volume < 0 ||
                    saved.volume > 1)) ||
            (saved.recordVisible !== undefined && typeof saved.recordVisible !== 'boolean') ||
            !saved.game ||
            (saved.game.winner !== undefined &&
                saved.game.winner !== null &&
                !isSide(saved.game.winner)) ||
            !isBoard(saved.game.board, saved.game.board?.[saved.game.lastMove?.to]?.side ?? null) ||
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

        const winner = new Game(saved.game).getWinner();
        const record = saved.game.record;

        if (record !== undefined) {
            if (
                !record ||
                !record.initial ||
                (record.initial.winner !== undefined && record.initial.winner !== null) ||
                !isBoard(record.initial.board) ||
                !Array.isArray(record.moves)
            )
                return null;

            const replay: GameState = {
                board: structuredClone(record.initial.board),
                lastMove: record.initial.lastMove,
            };
            const game = new Game(replay);
            let previousSide: Side | null = null;

            for (const move of record.moves) {
                if (
                    !move ||
                    !isSide(move.side) ||
                    !isIndex(move.from) ||
                    !isIndex(move.to) ||
                    move.side === previousSide ||
                    replay.board[move.from]?.side !== move.side ||
                    move.name !== GameRecord.describe(replay.board, move.from, move.to) ||
                    !game.tryMove(move.from, move.to, move.side)
                )
                    return null;

                // 能走出合法的下一步，就已证明上一局面并非将死或困毙。
                previousSide = move.side;
            }

            if (
                JSON.stringify(replay.board) !== JSON.stringify(saved.game.board) ||
                JSON.stringify(replay.lastMove) !== JSON.stringify(saved.game.lastMove) ||
                (!winner &&
                    previousSide &&
                    (saved.currentPlayer === '0' ? Side.Red : Side.Black) !==
                        Side.opposite(previousSide))
            )
                return null;
        }

        if (saved.game.winner !== undefined && saved.game.winner !== winner) return null;

        // 旧存档保留局面与棋谱，胜负由 boardgame.io 初始化时重新计算。
        delete saved.game.winner;

        if (record) delete record.initial.winner;

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
