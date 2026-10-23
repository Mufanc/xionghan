import wasmURL from './engine.wasm?url';
import { Side } from '@xionghan/core/piece';
import type { SearchRequest, SearchReply } from './protocol';

self.onmessage = async ({ data }: MessageEvent<SearchRequest>) => {
    try {
        const response = await fetch(wasmURL);

        if (!response.ok) throw new Error('无法下载棋力引擎。');

        const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {
            env: {
                now_ms: () => performance.now(),
                cell: (position: number, square: number) => data.positions[position][square],
            },
        });
        const choose = instance.exports.choose as (
            ms: number,
            black: number,
            positions: number,
        ) => number;
        const packed = choose(
            data.milliseconds,
            Number(data.side === Side.Black),
            data.positions.length,
        );
        const move =
            packed === 0 ? null : { from: Math.floor((packed - 1) / 169), to: (packed - 1) % 169 };

        self.postMessage({ move } satisfies SearchReply);
    } catch (error) {
        self.postMessage({
            error: error instanceof Error ? error.message : '棋力引擎运行失败。',
        } satisfies SearchReply);
    }
};
