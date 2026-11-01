import { GameRecord } from '@xionghan/core/record';
import { Game, type GameState } from '@xionghan/core/game';
import { PositionEditor } from '@xionghan/core/editor';
import { Board } from '@xionghan/core/board';
import { Kind, Side } from '@xionghan/core/piece';
import { parseSession } from './session';

export interface ImportedRecord {
    game: GameState;
    currentPlayer: '0' | '1';
}

export const MAX_RECORD_BYTES = 10 * 1024 * 1024;

export function serializeRecord(game: GameState, currentPlayer: string): string {
    return JSON.stringify({
        format: 'xionghan-record',
        version: 1,
        currentPlayer,
        game: {
            board: game.board,
            lastMove: game.lastMove,
            record: game.record ?? GameRecord.create(game).data,
        },
    });
}

function legacyIndex(value: unknown): number | null {
    if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return null;

    const { x, y } = value;

    return typeof x === 'number' &&
        typeof y === 'number' &&
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        x >= 0 &&
        x < Board.SIZE &&
        y >= 0 &&
        y < Board.SIZE
        ? Board.indexOf(x, y)
        : null;
}

function convertLegacyRecord(data: unknown) {
    if (
        !data ||
        typeof data !== 'object' ||
        !('board' in data) ||
        !data.board ||
        typeof data.board !== 'object' ||
        Array.isArray(data.board) ||
        !('current' in data) ||
        (data.current !== 'R' && data.current !== 'B') ||
        ('turn' in data && data.turn !== 0)
    ) {
        throw new Error('旧版棋谱的初始局面或行棋方无效。');
    }

    if (!('history' in data) || !Array.isArray(data.history) || data.history.length > 20000) {
        throw new Error('棋谱记录无效，最多支持 20000 手。');
    }

    const kinds = {
        King: Kind.King,
        Advisor: Kind.Advisor,
        Elephant: Kind.Elephant,
        Horse: Kind.Horse,
        Chariot: Kind.Chariot,
        Cannon: Kind.Cannon,
        Pawn: Kind.Pawn,
        Train: Kind.Train,
        Guard: Kind.Guard,
        Catapult: Kind.Catapult,
    };
    const board: GameState['board'] = Array(Board.SIZE ** 2).fill(null);

    for (const [key, piece] of Object.entries(data.board)) {
        const index = legacyIndex(piece);

        if (
            index === null ||
            !piece ||
            typeof piece !== 'object' ||
            !('color' in piece) ||
            (piece.color !== 'R' && piece.color !== 'B') ||
            !('type' in piece) ||
            typeof piece.type !== 'string' ||
            !Object.hasOwn(kinds, piece.type)
        ) {
            throw new Error('旧版棋谱包含无效棋子或坐标。');
        }

        const { x, y } = Board.coordinatesOf(index);

        if (key !== String(x * Board.SIZE + y)) throw new Error('旧版棋谱的棋盘索引与坐标不一致。');

        board[index] = {
            side: piece.color === 'R' ? Side.Red : Side.Black,
            kind: kinds[piece.type as keyof typeof kinds],
        };
    }

    if (!new PositionEditor(board).canStart()) throw new Error('棋谱校验失败：初始局面不合法。');

    const state: GameState = { board, lastMove: null };
    const record = GameRecord.create(state).data;
    const game = new Game(state);
    let side = data.current === 'R' ? Side.Red : Side.Black;

    for (const [index, move] of data.history.entries()) {
        const from = legacyIndex(move?.from);
        const to = legacyIndex(move?.to);

        if (from === null || to === null || state.board[from]?.side !== side || game.getWinner()) {
            throw new Error(`旧版棋谱第 ${index + 1} 手不合法。`);
        }

        const name = GameRecord.describe(state.board, from, to);

        if (!game.tryMove(from, to, side)) throw new Error(`旧版棋谱第 ${index + 1} 手不合法。`);

        record.moves.push({ from, to, side, name });
        side = Side.opposite(side);
    }

    state.record = record;

    return {
        format: 'xionghan-record',
        version: 1,
        game: state,
        currentPlayer: side === Side.Red ? '0' : '1',
    };
}

export function parseRecord(text: string): ImportedRecord {
    if (new Blob([text]).size > MAX_RECORD_BYTES) throw new Error('棋谱文件不能超过 10 MB。');

    let file;

    try {
        file = JSON.parse(text);
    } catch {
        throw new Error('无法读取棋谱，请选择匈汉象棋导出的 JSON 文件。');
    }

    if (file?.format === undefined && file?.version === 1 && file.data !== undefined) {
        file = convertLegacyRecord(file.data);
    }

    if (file?.format !== 'xionghan-record' || file.version !== 1) {
        throw new Error('不支持这个棋谱格式或版本。');
    }

    if (!Array.isArray(file.game?.record?.moves) || file.game.record.moves.length > 20000) {
        throw new Error('棋谱记录无效，最多支持 20000 手。');
    }

    const session = parseSession(
        JSON.stringify({
            version: 1,
            game: file.game,
            currentPlayer: file.currentPlayer,
            draft: null,
            soundEnabled: true,
        }),
    );

    if (!session) throw new Error('棋谱校验失败：局面或走棋记录不合法。');

    const initial = session.game.record!.initial;
    const initialSession = parseSession(
        JSON.stringify({
            version: 1,
            game: initial,
            currentPlayer: '0',
            draft: null,
            soundEnabled: true,
        }),
    );
    const editor = new PositionEditor(initial.board);

    if (
        !initialSession ||
        new Game(initial).getWinner() ||
        initial.board.some((piece, index) => piece && !editor.canPlace(piece, index)) ||
        (!initial.lastMove && !editor.canStart())
    ) {
        throw new Error('棋谱校验失败：初始局面不合法。');
    }

    return { game: session.game, currentPlayer: session.currentPlayer };
}

export function downloadRecord(game: GameState, currentPlayer: string): void {
    const blob = new Blob([serializeRecord(game, currentPlayer)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `匈汉象棋-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    // 给浏览器留出接管下载的时间。
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
