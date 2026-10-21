import type { BoardData, Index } from './board.js';
import type { Game as GameConfig } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { Game, type GameState } from './game.js';
import { Side } from './piece.js';
import { PositionEditor } from './editor.js';
import { GameRecord } from './record.js';

export const playerSide = (player: string): Side => (player === '0' ? Side.Red : Side.Black);

export const gameConfig: GameConfig<GameState> = {
    name: 'XiongHan',
    minPlayers: 2,
    maxPlayers: 2,
    setup: () => Game.initialState(),
    turn: { minMoves: 1, maxMoves: 1 },
    disableUndo: true,
    events: { endTurn: false, pass: false, endGame: false },
    moves: {
        move({ G, ctx }, from: Index, to: Index) {
            const game = new Game(G);
            const record = G.record ?? GameRecord.create(G).data;
            const side = playerSide(ctx.currentPlayer);
            const board = G.board.slice();

            if (!game.tryMove(from, to, playerSide(ctx.currentPlayer))) {
                return INVALID_MOVE;
            }

            record.moves.push({ from, to, side, name: GameRecord.describe(board, from, to) });
            G.record = record;
        },
    },
    endIf: ({ G }) => {
        const winner = new Game(G).getWinner();

        return winner ? { winner } : undefined;
    },
    ai: {
        enumerate(G, ctx, playerID) {
            if (ctx.gameover || playerID !== ctx.currentPlayer) return [];

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
        setup: () => ({ board: editor.data.slice(), lastMove: null }),
    };
}

export function gameFromSession(game: GameState, currentPlayer: '0' | '1'): GameConfig<GameState> {
    return {
        ...gameConfig,
        setup: () => structuredClone(game),
        turn: {
            ...gameConfig.turn,
            order: {
                first: () => Number(currentPlayer),
                next: ({ ctx }) => (ctx.playOrderPos + 1) % 2,
            },
        },
    };
}
