import { Game } from './game.js';
import { RandomBot, Step } from 'boardgame.io/ai';
import { Client } from 'boardgame.io/client';
import { expect, it } from 'vitest';
import { gameConfig, playerSide } from './boardgame.js';
import { Board } from './board.js';
import { Kind, Side } from './piece.js';
import { Rules } from './rules.js';

it.each(Array.from({ length: 10 }, (_, index) => `random-${index + 1}`))(
    'plays a legal random game with seed %s',
    async (seed) => {
        const client = Client({ game: gameConfig, numPlayers: 2 });
        const bot = new RandomBot({ enumerate: gameConfig.ai!.enumerate, seed });
        let plies = 0;

        while (!client.getState()!.ctx.gameover && plies < 500) {
            const before = client.getState()!;
            const side = playerSide(before.ctx.currentPlayer);
            const action = await Step(client, bot);
            const after = client.getState()!;
            const rules = new Rules(new Board(after.G.board));
            const context = `${seed}, ply ${++plies}`;

            expect(action, context).toBeDefined();
            expect(after._stateID, context).toBe(before._stateID + 1);
            expect(after.G.board, context).toHaveLength(Board.SIZE * Board.SIZE);
            expect(
                after.G.board.filter((piece) => piece?.kind === Kind.King),
                context,
            ).toHaveLength(2);
            expect(rules.isCheck(side), context).toBe(false);

            const { from, to } = after.G.lastMove!;
            expect(after.G.board[from], context).toBeNull();
            expect(after.G.board[to], context).toEqual(before.G.board[from]);
            expect(after.G.board.filter(Boolean).length, context).toBe(
                before.G.board.filter(Boolean).length - (before.G.board[to] ? 1 : 0),
            );

            if (after.ctx.gameover) {
                expect(new Game(after.G).getWinner(), context).toBe(side);
                expect(after.ctx.gameover, context).toEqual({ winner: side });
                expect(rules.hasLegalMove(Side.opposite(side)), context).toBe(false);
                expect(
                    gameConfig.ai!.enumerate(after.G, after.ctx, after.ctx.currentPlayer),
                    context,
                ).toEqual([]);
            } else {
                expect(after.ctx.currentPlayer, context).not.toBe(before.ctx.currentPlayer);
                expect(new Game(after.G).getWinner(), context).toBeNull();
            }
        }

        console.info(
            `${seed}: ${plies} plies, ${new Game(client.getState()!.G).getWinner() ?? 'step limit reached'}`,
        );
    },
    120_000,
);
