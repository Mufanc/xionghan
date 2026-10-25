import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { Skin } from '@/skins/skin';
import { Kind, Side } from '@xionghan/core/piece';

// Header-only fixtures isolate archive validation; real PNG decoding is checked in the browser.
function png(width = 2, height = width) {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return bytes;
}

async function zip(files: Record<string, Uint8Array>, withMetadata = true) {
    const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false });
    const contents = withMetadata
        ? { 'skin.properties': new TextEncoder().encode('id=test.skin\nname=测试皮肤'), ...files }
        : files;
    for (const [filename, bytes] of Object.entries(contents))
        await writer.add(filename, new Uint8ArrayReader(bytes));
    return writer.close();
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('skin ZIP loading', () => {
    it('loads legacy filenames, ignores unrelated files, falls back per resource and releases URLs', async () => {
        const close = vi.fn();
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close }));
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const skin = await Skin.load(
            await zip({
                'r-king.png': png(213, 212),
                'board.png': png(1300, 1299),
                'readme.txt': new Uint8Array([1]),
            }),
        );
        expect(skin.pieceUrl({ side: Side.Red, kind: Kind.King })).toBe('blob:test');
        expect(skin.pieceUrl({ side: Side.Black, kind: Kind.King })).toBeUndefined();
        expect(skin.url('board.png')).toBe('blob:test');
        expect(skin.panelStyle()).toBeUndefined();
        expect(close).toHaveBeenCalledTimes(2);
        skin.dispose();
        skin.dispose();
        expect(revoke).toHaveBeenCalledTimes(2);
    });
    it('rejects unusable ZIPs and excessive dimensions before decoding', async () => {
        const decode = vi.fn();
        vi.stubGlobal('createImageBitmap', decode);
        await expect(Skin.load(new Blob(['not a zip']))).rejects.toThrow();
        await expect(Skin.load(await zip({ 'nested/board.png': png() }))).rejects.toThrow('根目录');
        await expect(Skin.load(await zip({ 'board.png': new Uint8Array([1]) }))).rejects.toThrow(
            'PNG',
        );
        await expect(Skin.load(await zip({ 'board.png': png(4097) }))).rejects.toThrow('尺寸');
        expect(decode).not.toHaveBeenCalled();
    });
    it('uses one shared panel, preferring panel nine-patch over plain and legacy frames', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
        let id = 0;
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++id}`);
        const pixels = new Uint8ClampedArray(6 * 6 * 4);
        const mark = (x: number, y: number) => {
            pixels[(y * 6 + x) * 4 + 3] = 255;
        };
        mark(2, 0);
        mark(3, 0);
        mark(0, 2);
        mark(0, 3);
        mark(2, 5);
        mark(3, 5);
        mark(5, 2);
        mark(5, 3);
        vi.stubGlobal('document', {
            createElement: () => ({
                getContext: () => ({ drawImage: vi.fn(), getImageData: () => ({ data: pixels }) }),
                toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['cropped'])),
            }),
        });
        const skin = await Skin.load(
            await zip({
                'panel.png': png(),
                'record.png': png(),
                'record.9.png': png(6),
                'panel.9.png': png(6),
            }),
        );
        expect(skin.panelStyle()).toMatchObject({
            '--panel-background': 'none',
            '--panel-border-image': 'url("blob:4")',
            '--panel-slices': '1 1 1 1 fill',
            '--panel-border-width': '1px 1px 1px 1px',
            '--panel-top': '1px',
            '--panel-right': '1px',
            '--panel-bottom': '1px',
            '--panel-left': '1px',
        });
        skin.dispose();
    });

    it('uses plain panels everywhere and falls back to legacy record images only when needed', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
        let id = 0;
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++id}`);
        const plain = await Skin.load(await zip({ 'record.png': png(), 'panel.png': png() }));
        expect(plain.panelStyle()).toMatchObject({
            '--panel-background': 'url("blob:2")',
            '--panel-border-image': 'none',
            '--panel-top': '0px',
        });
        plain.dispose();
        const legacy = await Skin.load(await zip({ 'record.png': png() }));
        expect(legacy.panelStyle()).toMatchObject({ '--panel-background': 'url("blob:3")' });
        legacy.dispose();
    });

    it('requires properties and uses metadata identity independently of ZIP naming', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:metadata-test');
        await expect(Skin.load(await zip({ 'board.png': png() }, false))).rejects.toThrow(
            '缺少 skin.properties',
        );
        const metadata = new TextEncoder().encode(
            'id=mufanc.bamboo\nname=清幽竹林\nauthor=Mufanc\nversion=2\ndescription=测试描述',
        );
        const skin = await Skin.load(
            await zip({ 'skin.properties': metadata, 'board.png': png() }),
        );
        expect(skin.metadata).toEqual({
            id: 'mufanc.bamboo',
            name: '清幽竹林',
            author: 'Mufanc',
            version: '2',
            description: '测试描述',
        });
        skin.dispose();
        await expect(
            Skin.load(
                await zip({
                    'skin.properties': new TextEncoder().encode('name=测试'),
                    'board.png': png(),
                }),
            ),
        ).rejects.toThrow('缺少 id');
        await expect(
            Skin.load(await zip({ 'skin.properties': new Uint8Array([255]), 'board.png': png() })),
        ).rejects.toThrow('UTF-8');
    });

    it('cleans up an already decoded image if a later entry fails', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:temporary');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        await expect(
            Skin.load(await zip({ 'board.png': png(), 'b-king.png': new Uint8Array([1]) })),
        ).rejects.toThrow('PNG');
        expect(revoke).toHaveBeenCalledWith('blob:temporary');
    });
});
