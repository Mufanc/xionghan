import { describe, expect, it } from 'vitest';
import { parseNinePatch } from '@/skins/nine-patch';

function fixture() {
    const width = 12;
    const height = 10;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const mark = (x: number, y: number) => {
        pixels[(y * width + x) * 4 + 3] = 255;
    };
    for (let x = 3; x <= 8; x++) mark(x, 0);
    for (let y = 2; y <= 7; y++) mark(0, y);
    return { width, height, pixels, mark };
}

describe('single-region nine-patch markers', () => {
    it('excludes the marker border and uses the entire image when content markers are omitted', () => {
        const { width, height, pixels } = fixture();
        expect(parseNinePatch(width, height, pixels)).toEqual({
            slices: [1, 2, 1, 2],
            padding: [0, 0, 0, 0],
        });
    });
    it('derives content padding independently from stretch slices', () => {
        const { width, height, pixels, mark } = fixture();
        for (let x = 4; x <= 7; x++) mark(x, height - 1);
        for (let y = 3; y <= 6; y++) mark(width - 1, y);
        expect(parseNinePatch(width, height, pixels).padding).toEqual([2, 3, 2, 3]);
    });
    it('rejects missing, separated and non-black markers, including corners', () => {
        const a = fixture();
        a.mark(10, 0);
        expect(() => parseNinePatch(a.width, a.height, a.pixels)).toThrow('一段');
        const b = fixture();
        b.pixels[3 * 4] = 120;
        expect(() => parseNinePatch(b.width, b.height, b.pixels)).toThrow('纯黑');
        const c = fixture();
        c.mark(0, 0);
        expect(() => parseNinePatch(c.width, c.height, c.pixels)).toThrow('四角');
        expect(() => parseNinePatch(3, 3, new Uint8ClampedArray(36))).toThrow('必须');
    });
    it('allows a one-pixel stretch region and zero fixed edges', () => {
        const pixels = new Uint8ClampedArray(36);
        pixels[7] = 255;
        pixels[15] = 255;
        expect(parseNinePatch(3, 3, pixels)).toEqual({
            slices: [0, 0, 0, 0],
            padding: [0, 0, 0, 0],
        });
    });
});
