import type { SkinMetadata } from '@/skins/metadata';

export interface SkinEntry extends SkinMetadata {
    archive: Blob;
}

interface Preference {
    id: 'active';
    skinId: string | null;
}

export class SkinStore {
    private async open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('xionghan.skins', 1);

            request.onupgradeneeded = () => {
                request.result.createObjectStore('skins', { keyPath: 'id' });
                request.result.createObjectStore('preferences', { keyPath: 'id' });
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('请关闭其他页面后重试皮肤存储'));
            request.onsuccess = () => {
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
        });
    }

    async read(): Promise<{ entries: SkinEntry[]; active: string | null }> {
        const db = await this.open();

        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(['skins', 'preferences'], 'readonly');
                const skins = tx.objectStore('skins').getAll();
                const preference = tx.objectStore('preferences').get('active');

                tx.oncomplete = () =>
                    resolve({
                        entries: skins.result,
                        active: (preference.result as Preference | undefined)?.skinId ?? null,
                    });
                tx.onabort = () => reject(tx.error ?? new Error('读取皮肤失败'));
                tx.onerror = () => {};
            });
        } finally {
            db.close();
        }
    }

    async write(active: string | null, entry?: SkinEntry, remove?: string): Promise<void> {
        const db = await this.open();

        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(['skins', 'preferences'], 'readwrite');

                tx.oncomplete = () => resolve();
                tx.onabort = () => reject(tx.error ?? new Error('保存皮肤失败'));
                tx.onerror = () => {};
                tx.objectStore('preferences').put({
                    id: 'active',
                    skinId: active,
                } satisfies Preference);

                if (entry) tx.objectStore('skins').put(entry);
                if (remove) tx.objectStore('skins').delete(remove);
            });
        } finally {
            db.close();
        }
    }
}
