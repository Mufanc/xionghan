import { Client } from 'boardgame.io/client';
import { afterEach, expect, it, vi } from 'vitest';
import { onlineGameConfig, takebackSteps } from './online.js';
import { Board } from './board.js';
import { Side, Kind } from './piece.js';

const p = Board.indexOf;
const red = [p(2, 8), p(2, 5)];
const black = [p(4, 4), p(4, 7)];

function game() {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    return Client({ game: onlineGameConfig, playerID: '0' });
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

it('blocks initial requests, wrong-turn moves, own responses and permits opponent moves during requests', () => {
    const client = game();
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback).toBeUndefined();
    client.updatePlayerID('1');
    client.moves.move(...black);
    expect(client.getState()!.G.record).toBeUndefined();
    client.updatePlayerID('0');
    client.moves.move(...red);
    expect(client.getState()!.ctx.currentPlayer).toBe('1');
    expect(takebackSteps(client.getState()!.G, '1', '1')).toBe(0);
    client.moves.requestTakeback();
    const pending = client.getState()!;
    expect(pending.G.takeback?.targetStep).toBe(0);
    expect(pending.ctx.currentPlayer).toBe('1');
    client.moves.respondTakeback(pending.G.takeback!.id, true);
    expect(client.getState()!.G).toEqual(pending.G);
    client.updatePlayerID('1');
    client.moves.move(...black);
    expect(client.getState()!.G.record?.moves).toHaveLength(2);
    expect(client.getState()!.G.takeback).toEqual(pending.G.takeback);
    client.updatePlayerID('0');
    client.moves.move(p(6, 8), p(6, 5));
    expect(client.getState()!.G.record?.moves).toHaveLength(2);
    client.updatePlayerID('1');
    client.moves.respondTakeback(pending.G.takeback!.id, true);
    expect(client.getState()!.G.record?.moves).toHaveLength(0);
    expect(client.getState()!.G.lastMove).toBeNull();
    expect(client.getState()!.ctx.currentPlayer).toBe('0');
    client.updatePlayerID('0');
    client.moves.move(...red);
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback?.id).toBe(2);
});

it('reverts two plies and preserves consumed requests across rollback', () => {
    const client = game();
    client.moves.move(...red);
    client.moves.requestTakeback();
    client.updatePlayerID('1');
    client.moves.respondTakeback(1, false);
    client.moves.move(...black);
    client.updatePlayerID('0');
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback).toBeUndefined();
    client.moves.move(p(6, 8), p(6, 5));
    client.updatePlayerID('1');
    client.moves.move(p(8, 4), p(8, 7));
    client.updatePlayerID('0');
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback?.targetStep).toBe(2);
    client.updatePlayerID('1');
    client.moves.respondTakeback(2, true);
    expect(client.getState()!.G.record?.moves).toHaveLength(2);
    expect(client.getState()!.G.lastMove).toEqual({ from: black[0], to: black[1] });
    expect(client.getState()!.ctx.currentPlayer).toBe('0');
    client.updatePlayerID('0');
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback).toBeUndefined();
});

it('expires at exactly ten seconds, rejects stale replies and permits play without a timer callback', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100000);
    const client = game();
    client.moves.move(...red);
    client.moves.requestTakeback();
    const request = client.getState()!.G.takeback!;
    client.updatePlayerID('1');
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback).toEqual(request);
    vi.setSystemTime(request.expiresAt);
    client.moves.respondTakeback(request.id, true);
    expect(client.getState()!.G.record?.moves).toHaveLength(1);
    client.moves.move(...black);
    expect(client.getState()!.G.takeback).toBeUndefined();
    client.updatePlayerID('0');
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback).toBeUndefined();
    client.moves.move(p(6, 8), p(6, 5));
    client.moves.requestTakeback();
    client.updatePlayerID('1');
    client.moves.respondTakeback(request.id, true);
    expect(client.getState()!.G.takeback?.id).toBe(2);
    client.moves.respondTakeback(2, false);
    client.moves.respondTakeback(2, true);
    expect(client.getState()!.G.record?.moves).toHaveLength(3);
});

it('restores captured pieces and the black turn', () => {
    const client = game();
    client.moves.move(...red);
    client.updatePlayerID('1');
    client.moves.move(p(2, 4), p(2, 5));
    client.moves.requestTakeback();
    client.updatePlayerID('0');
    client.moves.respondTakeback(1, true);
    expect(client.getState()!.G.board[p(2, 5)]?.side).toBe(Side.Red);
    expect(client.getState()!.G.board[p(2, 4)]?.side).toBe(Side.Black);
    expect(client.getState()!.ctx.currentPlayer).toBe('1');
});

it('clears pending requests on game over and forbids post-game takebacks', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const board = Array(Board.SIZE * Board.SIZE).fill(null);
    board[p(6, 11)] = { side: Side.Red, kind: Kind.King };
    board[p(5, 1)] = { side: Side.Black, kind: Kind.King };
    board[p(5, 3)] = { side: Side.Red, kind: Kind.Chariot };
    const client = Client({
        game: {
            ...onlineGameConfig,
            setup: () => ({
                board,
                lastMove: null,
                takeback: { id: 1, playerID: '1', targetStep: 0, expiresAt: Date.now() + 10000 },
            }),
        },
        playerID: '0',
    });
    client.moves.move(p(5, 3), p(5, 1));
    expect(client.getState()!.ctx.gameover).toEqual({ winner: Side.Red });
    expect(client.getState()!.G.takeback).toBeUndefined();
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback).toBeUndefined();
});

it.each([1, 2])(
    'locks both players after a %i-ply takeback until each makes a new move',
    (steps) => {
        const client = game();
        client.moves.move(...red);
        client.updatePlayerID('1');
        client.moves.move(...black);
        client.updatePlayerID('0');
        client.moves.move(p(6, 8), p(6, 5));
        client.updatePlayerID('1');
        client.moves.move(p(8, 4), p(8, 7));
        client.updatePlayerID('0');
        if (steps === 1) client.moves.move(p(10, 8), p(10, 5));
        client.moves.requestTakeback();
        client.updatePlayerID('1');
        client.moves.respondTakeback(1, true);
        expect(client.getState()!.G.takebackUsed).toEqual({ '0': true, '1': true });
        client.moves.requestTakeback();
        expect(client.getState()!.G.takeback).toBeUndefined();
        client.updatePlayerID('0');
        client.moves.requestTakeback();
        expect(client.getState()!.G.takeback).toBeUndefined();
        const column = steps === 1 ? 10 : 6;
        client.moves.move(p(column, 8), p(column, 5));
        expect(takebackSteps(client.getState()!.G, '1', '0')).toBe(1);
        client.updatePlayerID('1');
        client.moves.requestTakeback();
        expect(client.getState()!.G.takeback).toBeUndefined();
        client.moves.move(p(2, 4), p(2, 5));
        client.moves.requestTakeback();
        expect(client.getState()!.G.takeback?.playerID).toBe('1');
    },
);

it('blocks draw and resignation until both opening plies have been played', () => {
    const client = game();
    for (const opening of [false, true]) {
        if (opening) client.moves.move(...red);
        client.moves.resign();
        client.moves.offerDraw();
        expect(client.getState()!.ctx.gameover).toBeUndefined();
        expect(client.getState()!.G.drawOffer).toBeUndefined();
    }
    client.updatePlayerID('1');
    client.moves.move(...black);
    client.moves.resign();
    expect(client.getState()!.ctx.gameover).toEqual({ winner: Side.Red, reason: 'resign' });
});

it('negotiates a draw without advancing the turn and excludes takeback requests', () => {
    const client = game();
    client.moves.move(...red);
    client.updatePlayerID('1');
    client.moves.move(...black);
    client.moves.offerDraw();
    const offer = client.getState()!.G.drawOffer!;
    expect(client.getState()!.ctx.currentPlayer).toBe('0');
    client.moves.respondDraw(offer.id, true);
    expect(client.getState()!.ctx.gameover).toBeUndefined();
    client.updatePlayerID('0');
    client.moves.requestTakeback();
    expect(client.getState()!.G.takeback).toBeUndefined();
    client.moves.respondDraw(offer.id + 1, true);
    expect(client.getState()!.ctx.gameover).toBeUndefined();
    client.moves.respondDraw(offer.id, true);
    expect(client.getState()!.ctx.gameover).toEqual({ draw: true, reason: 'agreement' });
    expect(client.getState()!.G.drawOffer).toBeUndefined();
});

it('expires draw offers and requires a new move before offering again', () => {
    vi.useFakeTimers();
    const client = game();
    client.moves.move(...red);
    client.updatePlayerID('1');
    client.moves.move(...black);
    client.moves.offerDraw();
    const offer = client.getState()!.G.drawOffer!;
    vi.advanceTimersByTime(10001);
    client.updatePlayerID('0');
    client.moves.respondDraw(offer.id, true);
    expect(client.getState()!.ctx.gameover).toBeUndefined();
    client.updatePlayerID('1');
    client.moves.offerDraw();
    expect(client.getState()!.G.drawSerial).toBe(1);
    client.updatePlayerID('0');
    client.moves.move(p(6, 8), p(6, 5));
    client.updatePlayerID('1');
    client.moves.move(p(8, 4), p(8, 7));
    client.moves.offerDraw();
    expect(client.getState()!.G.drawSerial).toBe(2);
    client.moves.resign();
    expect(client.getState()!.G.drawOffer).toBeUndefined();
});
