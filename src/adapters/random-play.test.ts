import { RandomBot, Step } from 'boardgame.io/ai';
import { Client } from 'boardgame.io/client';
import { expect, it } from 'vitest';
import { gameConfig, playerSide } from '@/adapters/boardgame';
import { Board } from '@/core/board';
import { Kind, Side } from '@/core/piece';
import { Rules } from '@/core/rules';

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
                expect(after.G.winner, context).toBe(side);
                expect(after.ctx.gameover, context).toEqual({ winner: side });
                expect(rules.hasLegalMove(Side.opposite(side)), context).toBe(false);
                expect(
                    gameConfig.ai!.enumerate(after.G, after.ctx, after.ctx.currentPlayer),
                    context,
                ).toEqual([]);
            } else {
                expect(after.ctx.currentPlayer, context).not.toBe(before.ctx.currentPlayer);
                expect(after.G.winner, context).toBeNull();
            }
        }

        console.info(
            `${seed}: ${plies} plies, ${client.getState()!.G.winner ?? 'step limit reached'}`,
        );
    },
    120_000,
);
