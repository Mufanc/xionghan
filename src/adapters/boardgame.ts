import type { BoardData, Index } from '@/core/board';
import type { Game as GameConfig } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { Game, type GameState } from '@/core/game';
import { Side } from '@/core/piece';
import { PositionEditor } from '@/core/editor';

export const playerSide = (player: string): Side => (player === '0' ? Side.Red : Side.Black);

export const gameConfig: GameConfig<GameState> = {
    name: 'XiongHan',
    setup: () => Game.initialState(),
    turn: { minMoves: 1, maxMoves: 1 },
    disableUndo: true,
    events: { endTurn: false, pass: false, endGame: false },
    moves: {
        move({ G, ctx }, from: Index, to: Index) {
            const game = new Game(G);

            if (!game.tryMove(from, to, playerSide(ctx.currentPlayer))) {
                return INVALID_MOVE;
            }
        },
    },
    endIf: ({ G }) => (G.winner ? { winner: G.winner } : undefined),
    ai: {
        enumerate(G, ctx, playerID) {
            if (G.winner || playerID !== ctx.currentPlayer) return [];

            const game = new Game(G);
            const side = playerSide(playerID);

            return G.board.flatMap((piece, from) =>
                piece?.side === side
                    ? game.findLegalMoves(from).map((to) => ({ move: 'move', args: [from, to] }))
                    : [],
            );
        },
    },
};

export function gameFromPosition(board: BoardData): GameConfig<GameState> {
    const editor = new PositionEditor(board);

    if (!editor.canStart()) throw new Error('Invalid starting position');

    return {
        ...gameConfig,
        setup: () => ({ board: editor.data.slice(), lastMove: null, winner: null }),
    };
}
