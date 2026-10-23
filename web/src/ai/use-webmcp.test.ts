import { expect, it, vi } from 'vitest';
import { Game } from '@xionghan/core/game';
import { Side } from '@xionghan/core/piece';
import { computerTools } from './use-webmcp';

function fixture() {
    const state = {
        game: Game.initialState(),
        side: Side.Red,
        human: Side.Red,
        enabled: true,
        canMove: true,
        winner: null,
        draw: false,
        positionId: 'one',
    };
    const move = vi.fn();
    const tools = computerTools(() => state, move);
    return { state, move, read: tools[0].execute, play: tools[1].execute };
}

it('exposes a complete board and only legal human moves', async () => {
    const { read } = fixture();
    const result = (await read({})) as { content: { text: string }[] };
    const position = JSON.parse(result.content[0].text);
    expect(position.pieces).toHaveLength(44);
    expect(position.legalMoves).toContainEqual({ from: 106, to: 67 });
    expect(
        position.legalMoves.every(
            ({ from }: { from: number }) =>
                position.pieces.find((piece: { index: number }) => piece.index === from).side ===
                Side.Red,
        ),
    ).toBe(true);
});

it('validates input, rejects stale requests and prevents double submission', async () => {
    const { play, move } = fixture();
    for (const args of [
        { positionId: 'old', from: 106, to: 67 },
        { positionId: 'one', from: -1, to: 67 },
        { positionId: 'one', from: '106', to: 67 },
        { positionId: 'one', from: 106, to: 106 },
        { positionId: 'one', from: 54, to: 67 },
    ])
        await expect(play(args)).rejects.toThrow();
    expect(move).not.toHaveBeenCalled();
    await play({ positionId: 'one', from: 106, to: 67 });
    await expect(play({ positionId: 'one', from: 106, to: 67 })).rejects.toThrow();
    expect(move).toHaveBeenCalledExactlyOnceWith(106, 67);
});

it('reads fresh state and blocks paused, computer-turn and departed games', async () => {
    const { state, read, play, move } = fixture();
    state.canMove = false;
    const result = (await read({})) as { content: { text: string }[] };
    expect(JSON.parse(result.content[0].text).legalMoves).toEqual([]);
    await expect(play({ positionId: 'one', from: 106, to: 67 })).rejects.toThrow();
    state.enabled = false;
    await expect(read({})).rejects.toThrow();
    await expect(play({ positionId: 'one', from: 106, to: 67 })).rejects.toThrow();
    expect(move).not.toHaveBeenCalled();
});
