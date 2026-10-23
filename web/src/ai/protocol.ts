import { type BoardData } from '@xionghan/core/board';
import { type GameState } from '@xionghan/core/game';
import { Kind, Side } from '@xionghan/core/piece';

const kinds = [
    Kind.King,
    Kind.Advisor,
    Kind.Elephant,
    Kind.Horse,
    Kind.Chariot,
    Kind.Cannon,
    Kind.Pawn,
    Kind.Train,
    Kind.Guard,
    Kind.Catapult,
];

export interface SearchRequest {
    positions: number[][];
    side: Side;
    milliseconds: number;
}

export type SearchReply = { move: { from: number; to: number } | null } | { error: string };

export function encodeBoard(board: BoardData): number[] {
    return board.map((piece) =>
        piece ? 1 + kinds.indexOf(piece.kind) + (piece.side === Side.Black ? 16 : 0) : 0,
    );
}

export function searchRequest(game: GameState, side: Side, milliseconds = 3000): SearchRequest {
    const board = (game.record?.initial.board ?? game.board).slice();
    const positions = [encodeBoard(board)];

    for (const move of game.record?.moves ?? []) {
        board[move.to] = board[move.from];
        board[move.from] = null;
        positions.push(encodeBoard(board));
    }

    if (JSON.stringify(positions.at(-1)) !== JSON.stringify(encodeBoard(game.board))) {
        throw new Error('棋谱与当前局面不一致。');
    }

    return { positions, side, milliseconds };
}
