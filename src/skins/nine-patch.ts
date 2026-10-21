export interface NinePatch {
    slices: [number, number, number, number];
    padding: [number, number, number, number];
}

// 坐标以去掉四周标记线后的图片为准，结束位置不包含在区间内。
export function parseNinePatch(
    width: number,
    height: number,
    pixels: Uint8ClampedArray,
): NinePatch {
    if (width < 3 || height < 3 || pixels.length !== width * height * 4) {
        throw new Error('点九图尺寸无效');
    }

    function marked(x: number, y: number): boolean {
        const offset = (y * width + x) * 4;
        const [r, g, b, a] = pixels.subarray(offset, offset + 4);

        if (a === 0) return false;
        if (r === 0 && g === 0 && b === 0 && a === 255) return true;

        throw new Error('点九图边缘只能使用纯黑或透明像素');
    }

    function range(length: number, at: (index: number) => boolean, required: boolean) {
        let start = -1;
        let end = -1;

        for (let index = 0; index < length; index++) {
            if (!at(index)) continue;
            if (end !== -1 && end !== index) throw new Error('点九图每条边只支持一段标记');
            if (start === -1) start = index;

            end = index + 1;
        }

        if (start === -1) {
            if (required) throw new Error('点九图顶部和左侧必须标记拉伸区');

            return [0, length];
        }

        return [start, end];
    }

    for (const [x, y] of [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
    ]) {
        if (marked(x, y)) throw new Error('点九图四角必须透明');
    }

    const w = width - 2;
    const h = height - 2;
    const [left, right] = range(w, (x) => marked(x + 1, 0), true);
    const [top, bottom] = range(h, (y) => marked(0, y + 1), true);
    const [contentLeft, contentRight] = range(w, (x) => marked(x + 1, height - 1), false);
    const [contentTop, contentBottom] = range(h, (y) => marked(width - 1, y + 1), false);

    return {
        slices: [top, w - right, h - bottom, left],
        padding: [contentTop, w - contentRight, h - contentBottom, contentLeft],
    };
}
