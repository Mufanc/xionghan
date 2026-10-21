import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { SkinDialog } from '@/components/SkinDialog';
import { Skin } from '@/skins/skin';
import { SkinStore, type SkinEntry } from '@/skins/store';
import '@/skins/skins.css';

interface Skins {
    skin: Skin | null;
    entries: Omit<SkinEntry, 'archive'>[];
    active: string | null;
    busy: boolean;
    error: string;
    dropFiles: (files: File[]) => void;
    openDialog: () => void;
    select: (id: string | null) => Promise<void>;
    importFile: (file: File) => Promise<void>;
    remove: (id: string) => Promise<void>;
}

const SkinContext = createContext<Skins | null>(null);
const store = new SkinStore();

export function useSkins() {
    return useContext(SkinContext);
}

export function SkinProvider({ children }: { children: ReactNode }) {
    const [skin, setSkin] = useState<Skin | null>(null);
    const [entries, setEntries] = useState<SkinEntry[]>([]);
    const [active, setActive] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const mounted = useRef(false);
    const locked = useRef(true);

    useEffect(() => {
        let cancelled = false;
        mounted.current = true;

        void (async () => {
            let loaded: Skin | null = null;

            try {
                const saved = await store.read();
                const current = saved.entries.find((entry) => entry.id === saved.active);

                if (cancelled) return;

                setEntries(saved.entries);

                if (current) loaded = await Skin.load(current.archive);
                if (cancelled) return;

                setActive(current?.id ?? null);
                setSkin(loaded);
                loaded = null;
            } catch (cause) {
                if (!cancelled) setError(`无法恢复皮肤：${(cause as Error).message}`);
            } finally {
                loaded?.dispose();

                if (!cancelled) {
                    locked.current = false;
                    setBusy(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            mounted.current = false;
        };
    }, []);

    useEffect(() => () => skin?.dispose(), [skin]);

    async function change(id: string | null, imported?: File, remove?: string) {
        if (locked.current) return;

        locked.current = true;
        setBusy(true);
        setError('');
        let loaded: Skin | null = null;

        try {
            let entry = entries.find((item) => item.id === id);

            if (imported) {
                if (!/\.zip$/i.test(imported.name)) throw new Error('请选择 ZIP 皮肤包');

                loaded = await Skin.load(imported);
                entry = {
                    ...loaded.metadata,
                    archive: new Blob([imported], { type: 'application/zip' }),
                };
                id = entry.id;
            } else {
                if (id && !entry) throw new Error('皮肤不存在');
                if (id !== active) loaded = entry ? await Skin.load(entry.archive) : null;
            }

            await store.write(id, imported ? entry : undefined, remove);

            if (!mounted.current) return;

            if (id !== active || imported) {
                setSkin(loaded);
                loaded = null;
            }

            setActive(id);
            setEntries((previous) => {
                const remaining = previous.filter(
                    (item) => item.id !== remove && (!imported || item.id !== id),
                );

                return imported && entry ? [...remaining, entry] : remaining;
            });
        } catch (cause) {
            if (mounted.current) setError((cause as Error).message || '无法加载皮肤');
        } finally {
            loaded?.dispose();
            locked.current = false;

            if (mounted.current) setBusy(false);
        }
    }

    function importFile(file: File) {
        return change(null, file);
    }

    function dropFiles(files: File[]) {
        if (locked.current) {
            setError('皮肤正在加载，请稍后再试');
            return;
        }

        if (files.length !== 1) {
            setError('请一次拖入一个 ZIP 皮肤包');
            return;
        }

        void importFile(files[0]);
    }

    const background = skin?.url('background.png');

    return (
        <SkinContext
            value={{
                skin,
                entries,
                active,
                busy,
                error,
                select: (id) => change(id),
                dropFiles,
                openDialog: () => setDialogOpen(true),
                importFile,
                remove: (id) => change(id === active ? null : active, undefined, id),
            }}
        >
            <div
                className="skin-surface"
                style={background ? { backgroundImage: `url("${background}")` } : undefined}
            >
                {children}
                {dialogOpen && <SkinDialog onClose={() => setDialogOpen(false)} />}
            </div>
        </SkinContext>
    );
}
