import type { Game as GameConfig } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { gameConfig, playerSide } from './boardgame.js';
import type { GameState } from './game.js';
import { GameRecord } from './record.js';

export interface Takeback {
    id: number;
    playerID: string;
    targetStep: number;
    // 使用持久化的绝对期限判定失效，重启和重连不会延长申请。
    expiresAt: number;
}

export function takebackSteps(G: GameState, currentPlayer: string, playerID: string): number {
    const steps = currentPlayer === playerID ? 2 : 1;
    const moves = G.record?.moves ?? [];

    if (!['0', '1'].includes(playerID) || G.takebackUsed?.[playerID]) return 0;

    return moves.length >= steps && moves[moves.length - steps]?.side === playerSide(playerID)
        ? steps
        : 0;
}

export const onlineGameConfig: GameConfig<GameState> = {
    ...gameConfig,
    turn: { minMoves: 0, maxMoves: 1, activePlayers: ['0', '1'] },
    onEnd: ({ G }) => {
        delete G.takeback;
        delete G.drawOffer;
    },
    moves: {
        move: {
            move(context, from, to) {
                const { G, ctx, playerID } = context;

                if (
                    playerID !== ctx.currentPlayer ||
                    (G.takeback?.playerID === playerID && G.takeback.expiresAt > Date.now())
                ) {
                    return INVALID_MOVE;
                }

                const move = gameConfig.moves!.move;
                const result =
                    typeof move === 'function'
                        ? move(context, from, to)
                        : move.move(context, from, to);

                if (result === INVALID_MOVE) return result;

                if (G.takeback && G.takeback.expiresAt <= Date.now()) delete G.takeback;
                if (G.takebackUsed) G.takebackUsed[playerID] = false;
                if (G.drawUsed) G.drawUsed[playerID] = false;
                if (G.drawOffer && G.drawOffer.expiresAt <= Date.now()) delete G.drawOffer;
            },
        },
        resign: {
            client: false,
            noLimit: true,
            move({ G, ctx, playerID, events }) {
                if (
                    ctx.gameover ||
                    !['0', '1'].includes(playerID) ||
                    (G.record?.moves.length ?? 0) < 2
                )
                    return INVALID_MOVE;

                events.endGame({
                    winner: playerSide(playerID === '0' ? '1' : '0'),
                    reason: 'resign',
                });
            },
        },
        offerDraw: {
            client: false,
            noLimit: true,
            move({ G, ctx, playerID }) {
                if (
                    ctx.gameover ||
                    !['0', '1'].includes(playerID) ||
                    (G.record?.moves.length ?? 0) < 2 ||
                    G.drawUsed?.[playerID] ||
                    (G.takeback && G.takeback.expiresAt > Date.now()) ||
                    (G.drawOffer && G.drawOffer.expiresAt > Date.now())
                )
                    return INVALID_MOVE;

                G.drawSerial = (G.drawSerial ?? 0) + 1;
                G.drawOffer = { id: G.drawSerial, playerID, expiresAt: Date.now() + 10000 };
                G.drawUsed ??= {};
                G.drawUsed[playerID] = true;
            },
        },
        respondDraw: {
            client: false,
            noLimit: true,
            ignoreStaleStateID: true,
            move({ G, playerID, events }, id: number, accept: boolean) {
                const offer = G.drawOffer;

                if (
                    !offer ||
                    offer.id !== id ||
                    offer.playerID === playerID ||
                    !['0', '1'].includes(playerID) ||
                    typeof accept !== 'boolean' ||
                    offer.expiresAt <= Date.now()
                )
                    return INVALID_MOVE;

                delete G.drawOffer;
                if (accept) events.endGame({ draw: true, reason: 'agreement' });
            },
        },
        requestTakeback: {
            client: false,
            noLimit: true,
            move({ G, ctx, playerID }) {
                const steps = takebackSteps(G, ctx.currentPlayer, playerID);

                if (
                    !steps ||
                    (G.takeback && G.takeback.expiresAt > Date.now()) ||
                    (G.drawOffer && G.drawOffer.expiresAt > Date.now())
                )
                    return INVALID_MOVE;

                G.takebackSerial = (G.takebackSerial ?? 0) + 1;
                G.takeback = {
                    id: G.takebackSerial,
                    playerID,
                    targetStep: G.record!.moves.length - steps,
                    expiresAt: Date.now() + 10000,
                };
                G.takebackUsed ??= {};
                G.takebackUsed[playerID] = true;
            },
        },
        respondTakeback: {
            client: false,
            ignoreStaleStateID: true,
            noLimit: true,
            move({ G, playerID, events }, id: number, accept: boolean) {
                const request = G.takeback;

                if (
                    !request ||
                    request.id !== id ||
                    request.playerID === playerID ||
                    !['0', '1'].includes(playerID) ||
                    typeof accept !== 'boolean' ||
                    request.expiresAt <= Date.now()
                )
                    return INVALID_MOVE;

                if (accept) {
                    const record = G.record!;
                    const step = request.targetStep;

                    if (
                        record.moves.length - step < 1 ||
                        record.moves.length - step > 2 ||
                        record.moves[step]?.side !== playerSide(request.playerID)
                    )
                        return INVALID_MOVE;

                    const restored = new GameRecord(record).stateAt(step);
                    G.board = restored.board;
                    G.lastMove = restored.lastMove;
                    record.moves.length = step;
                    G.takebackUsed = { '0': true, '1': true };
                    events.endTurn({ next: request.playerID });
                }

                delete G.takeback;
            },
        },
    },
};
