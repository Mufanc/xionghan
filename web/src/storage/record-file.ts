import { GameRecord } from '@xionghan/core/record';
import { Game, type GameState } from '@xionghan/core/game';
import { PositionEditor } from '@xionghan/core/editor';
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

export function parseRecord(text: string): ImportedRecord {
    if (new Blob([text]).size > MAX_RECORD_BYTES) throw new Error('棋谱文件不能超过 10 MB。');

    let file;

    try {
        file = JSON.parse(text);
    } catch {
        throw new Error('无法读取棋谱，请选择匈汉象棋导出的 JSON 文件。');
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
