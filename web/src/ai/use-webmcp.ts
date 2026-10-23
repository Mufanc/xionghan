import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Game, type GameState } from '@xionghan/core/game';
import { Piece, Side } from '@xionghan/core/piece';

interface Position {
    game: GameState;
    side: Side;
    human: Side;
    enabled: boolean;
    canMove: boolean;
    winner: Side | null;
    draw: boolean;
    positionId: string;
}

interface Tool {
    name: string;
    description: string;
    inputSchema: object;
    annotations?: { readOnlyHint: boolean };
    execute: (input: Record<string, unknown>) => Promise<unknown>;
}

interface ModelContext {
    registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<unknown>;
}

export function computerTools(
    read: () => Position,
    move: (from: number, to: number) => void,
): Tool[] {
    let submitted: string | null = null;
    const reply = (value: unknown) => ({
        content: [{ type: 'text', text: JSON.stringify(value) }],
    });
    const current = () => {
        const state = read();
        if (!state.enabled) throw new Error('人机模式已退出。');
        return state;
    };

    return [
        {
            name: 'xionghan_get_position',
            description:
                '读取匈汉象棋人机对局。坐标 index=y*13+x，x 从左至右 0–12（A–M），y 从黑方底线至红方底线 0–12，不随棋盘翻转。返回双方棋子和玩家合法走法；电脑回合请稍后重新读取。',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: true },
            execute: async () => {
                const state = current();
                const game = new Game(state.game);
                const canMove = state.canMove && submitted !== state.positionId;

                return reply({
                    positionId: state.positionId,
                    currentPlayer: state.side,
                    human: state.human,
                    canMove,
                    winner: state.winner,
                    draw: state.draw,
                    lastMove: state.game.lastMove,
                    pieces: state.game.board.flatMap((piece, index) =>
                        piece
                            ? [
                                  {
                                      index,
                                      x: index % 13,
                                      y: Math.floor(index / 13),
                                      ...piece,
                                      name: Piece.nameOf(piece.side, piece.kind),
                                  },
                              ]
                            : [],
                    ),
                    legalMoves: canMove
                        ? state.game.board.flatMap((piece, from) =>
                              piece?.side === state.human
                                  ? game.findLegalMoves(from).map((to) => ({ from, to }))
                                  : [],
                          )
                        : [],
                });
            },
        },
        {
            name: 'xionghan_move',
            description:
                '代玩家在人机对局中走一步。先读取局面，从 legalMoves 中选取 from/to，并原样传入 positionId。仅在玩家回合可用；返回提交成功后，重新读取局面等待电脑应手。',
            inputSchema: {
                type: 'object',
                properties: {
                    positionId: { type: 'string' },
                    from: { type: 'integer', minimum: 0, maximum: 168 },
                    to: { type: 'integer', minimum: 0, maximum: 168 },
                },
                required: ['positionId', 'from', 'to'],
                additionalProperties: false,
            },
            execute: async ({ positionId, from, to }) => {
                const state = current();
                if (positionId !== state.positionId) throw new Error('局面已变化，请重新读取。');
                if (!state.canMove || submitted === positionId)
                    throw new Error('当前不能走棋，请重新读取局面。');
                if (
                    typeof from !== 'number' ||
                    typeof to !== 'number' ||
                    !Number.isInteger(from) ||
                    !Number.isInteger(to) ||
                    from < 0 ||
                    from > 168 ||
                    to < 0 ||
                    to > 168 ||
                    state.game.board[from]?.side !== state.human ||
                    !new Game(state.game).findLegalMoves(from).includes(to)
                ) {
                    throw new Error('非法走法。');
                }

                submitted = state.positionId;

                try {
                    move(from, to);
                } catch (error) {
                    submitted = null;
                    throw error;
                }

                return reply({ submitted: true });
            },
        },
    ];
}

export function useWebMCP(
    position: Omit<Position, 'positionId'>,
    move: (from: number, to: number) => void,
) {
    const positionId = useMemo(
        () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        [position.game, position.side],
    );
    const latest = useRef({ ...position, positionId, move });

    useLayoutEffect(() => {
        latest.current = { ...position, positionId, move };
    });
    useEffect(() => {
        if (!position.enabled) return;

        const context =
            (document as Document & { modelContext?: ModelContext }).modelContext ??
            (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
        if (!context) return;

        const controller = new AbortController();
        let active = true;
        const tools = computerTools(
            () => ({ ...latest.current, enabled: active && latest.current.enabled }),
            (from, to) => latest.current.move(from, to),
        );

        for (const tool of tools) {
            try {
                void Promise.resolve(
                    context.registerTool(tool, { signal: controller.signal }),
                ).catch(console.warn);
            } catch (error) {
                console.warn('WebMCP 工具注册失败', error);
            }
        }

        return () => {
            active = false;

            controller.abort();
        };
    }, [position.enabled]);
}
