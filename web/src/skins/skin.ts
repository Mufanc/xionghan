import { BlobReader, ZipReader } from '@zip.js/zip.js';
import type { CSSProperties } from 'react';
import { Kind, Side, type Piece } from '@xionghan/core/piece';
import { parseSkinMetadata, type SkinMetadata } from '@/skins/metadata';
import { parseNinePatch, type NinePatch } from '@/skins/nine-patch';

const MiB = 1024 * 1024;
const maxFileSize = 12 * MiB;
const maxTotalSize = 48 * MiB;
const filenames = new Set([
    'board.png',
    'background.png',
    'panel.png',
    'panel.9.png',
    'record.png',
    'record.9.png',
    'skin.properties',
    ...Object.values(Side).flatMap((side) =>
        Object.values(Kind).map(
            (kind) => `${side === Side.Red ? 'r' : 'b'}-${kind.toLowerCase()}.png`,
        ),
    ),
]);

export class Skin {
    private info?: SkinMetadata;
    private urls = new Map<string, string>();
    private patches = new Map<string, NinePatch>();

    get metadata(): SkinMetadata {
        if (!this.info) throw new Error('皮肤缺少 skin.properties');

        return this.info;
    }

    pieceUrl(piece: Piece): string | undefined {
        return this.url(`${piece.side === Side.Red ? 'r' : 'b'}-${piece.kind.toLowerCase()}.png`);
    }

    url(filename: string): string | undefined {
        return this.urls.get(filename);
    }

    panelStyle(): CSSProperties | undefined {
        const name = this.url('panel.9.png') || this.url('panel.png') ? 'panel' : 'record';
        const patch = this.patches.get(`${name}.9.png`);
        const image = this.url(patch ? `${name}.9.png` : `${name}.png`);

        if (!image) return undefined;

        return {
            '--panel-background': patch ? 'none' : `url("${image}")`,
            '--panel-border-image': patch ? `url("${image}")` : 'none',
            '--panel-slices': patch ? `${patch.slices.join(' ')} fill` : '0',
            '--panel-border-width': patch
                ? patch.slices.map((value) => `${value}px`).join(' ')
                : '0',
            '--panel-top': `${patch?.padding[0] ?? 0}px`,
            '--panel-right': `${patch?.padding[1] ?? 0}px`,
            '--panel-bottom': `${patch?.padding[2] ?? 0}px`,
            '--panel-left': `${patch?.padding[3] ?? 0}px`,
        } as CSSProperties;
    }

    dispose(): void {
        for (const url of this.urls.values()) URL.revokeObjectURL(url);

        this.urls.clear();
        this.patches.clear();
    }

    static async load(archive: Blob): Promise<Skin> {
        if (!archive.size || archive.size > 20 * MiB) throw new Error('皮肤 ZIP 不得超过 20 MB');

        const reader = new ZipReader(new BlobReader(archive), { useWebWorkers: false });
        const skin = new Skin();
        let entries = 0;
        let expanded = 0;
        let pixels = 0;

        try {
            for await (const entry of reader.getEntriesGenerator()) {
                if (++entries > 128) throw new Error('皮肤 ZIP 文件数量过多');
                if (entry.directory || !filenames.has(entry.filename)) continue;
                if (entry.encrypted) throw new Error('不支持加密皮肤');
                if (entry.filename === 'skin.properties' && skin.info)
                    throw new Error('文件重复：skin.properties');
                if (skin.urls.has(entry.filename)) throw new Error(`文件重复：${entry.filename}`);
                if (
                    entry.uncompressedSize > maxFileSize ||
                    expanded + entry.uncompressedSize > maxTotalSize
                ) {
                    throw new Error('皮肤解压后的图片体积过大');
                }

                const metadata = entry.filename === 'skin.properties';
                const limit = metadata ? 16 * 1024 : maxFileSize;

                if (entry.uncompressedSize > limit) throw new Error(`${entry.filename} 体积过大`);

                const chunks: Uint8Array<ArrayBuffer>[] = [];
                let size = 0;
                const writable = new WritableStream<Uint8Array>({
                    write(chunk) {
                        size += chunk.byteLength;
                        expanded += chunk.byteLength;

                        if (size > limit || expanded > maxTotalSize) {
                            throw new Error('皮肤解压后的图片体积过大');
                        }

                        chunks.push(new Uint8Array(chunk));
                    },
                });
                await entry.getData(writable, { checkSignature: true });

                const blob = new Blob(chunks, { type: 'image/png' });
                if (metadata) {
                    let text: string;

                    try {
                        text = new TextDecoder('utf-8', { fatal: true }).decode(
                            await blob.arrayBuffer(),
                        );
                    } catch {
                        throw new Error('skin.properties 必须为 UTF-8 编码');
                    }

                    skin.info = parseSkinMetadata(text);
                    continue;
                }

                const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
                const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];

                if (
                    header.length !== 24 ||
                    signature.some((byte, index) => header[index] !== byte)
                ) {
                    throw new Error(`不是有效的 PNG：${entry.filename}`);
                }

                const view = new DataView(header.buffer);
                const width = view.getUint32(16);
                const height = view.getUint32(20);

                pixels += width * height;

                if (
                    !width ||
                    !height ||
                    width > 4096 ||
                    height > 4096 ||
                    pixels > 32 * 1024 * 1024
                ) {
                    throw new Error(`图片尺寸过大或无效：${entry.filename}`);
                }

                let bitmap: ImageBitmap;

                try {
                    bitmap = await createImageBitmap(blob);
                } catch {
                    throw new Error(`无法解码图片：${entry.filename}`);
                }

                try {
                    let image = blob;

                    if (entry.filename.endsWith('.9.png')) {
                        const canvas = document.createElement('canvas');

                        canvas.width = width;
                        canvas.height = height;

                        const context = canvas.getContext('2d', { willReadFrequently: true });

                        if (!context) throw new Error('无法解析点九图');

                        context.drawImage(bitmap, 0, 0);

                        try {
                            skin.patches.set(
                                entry.filename,
                                parseNinePatch(
                                    width,
                                    height,
                                    context.getImageData(0, 0, width, height).data,
                                ),
                            );
                        } catch (error) {
                            throw new Error(`${entry.filename}：${(error as Error).message}`);
                        }

                        canvas.width = width - 2;
                        canvas.height = height - 2;
                        context.drawImage(
                            bitmap,
                            1,
                            1,
                            width - 2,
                            height - 2,
                            0,
                            0,
                            width - 2,
                            height - 2,
                        );
                        image = await new Promise<Blob>((resolve, reject) =>
                            canvas.toBlob((result) => {
                                if (result) resolve(result);
                                else reject(new Error('点九图裁剪失败'));
                            }, 'image/png'),
                        );
                    }

                    skin.urls.set(entry.filename, URL.createObjectURL(image));
                } finally {
                    bitmap.close();
                }
            }

            if (!skin.info) throw new Error('ZIP 根目录中缺少 skin.properties');
            if (!skin.urls.size) throw new Error('ZIP 根目录中未找到支持的皮肤图片');

            return skin;
        } catch (error) {
            skin.dispose();
            throw error;
        } finally {
            await reader.close();
        }
    }
}
