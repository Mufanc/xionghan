import { useEffect, useRef, useState } from 'react';
import { SkinDrop } from '@/skins/drop';
import { useSkins } from '@/skins/SkinProvider';

const defaultSkin = {
    id: null,
    name: '默认',
    author: 'Mufanc',
    version: '1.0',
    description: '经典棋盘与棋子',
};

export function SkinDialog({ onClose }: { onClose: () => void }) {
    const skins = useSkins()!;
    const [dragging, setDragging] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const element = dialog.current!;
        element.showModal();

        return () => element.close();
    }, []);

    useEffect(() => {
        const drop = new SkinDrop(dialog.current!, setDragging, skins.dropFiles);

        return () => drop.dispose();
    }, [skins.dropFiles]);

    return (
        <dialog
            ref={dialog}
            className={`skin-dialog${dragging ? ' drag-over' : ''}`}
            aria-labelledby="skins-title"
            onCancel={onClose}
        >
            <header>
                <h2 id="skins-title">皮肤</h2>
                <button className="ui-button quiet" onClick={onClose} aria-label="关闭皮肤设置">
                    关闭
                </button>
            </header>
            <div className="skin-list" aria-label="已保存的皮肤" aria-busy={skins.busy}>
                {[defaultSkin, ...skins.entries].map((entry) => (
                    <div
                        className="skin-row"
                        key={entry.id === null ? 'builtin:default' : `skin:${entry.id}`}
                    >
                        <button
                            className="skin-option"
                            aria-pressed={skins.active === entry.id}
                            disabled={skins.busy}
                            onClick={() => void skins.select(entry.id)}
                        >
                            <span className="skin-details">
                                <span className="skin-title">
                                    <span>{entry.name}</span>
                                    {entry.version && (
                                        <small className="skin-version">{entry.version}</small>
                                    )}
                                </span>
                                {(entry.author || entry.description) && (
                                    <small
                                        className="skin-caption"
                                        title={[entry.author, entry.description]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    >
                                        {[entry.author, entry.description]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </small>
                                )}
                            </span>
                            <span className="skin-check" aria-hidden="true">
                                {skins.active === entry.id ? '✓' : ''}
                            </span>
                        </button>
                        {entry.id !== null ? (
                            <button
                                className="ui-button quiet skin-delete"
                                disabled={skins.busy}
                                title="删除皮肤"
                                aria-label={`删除皮肤 ${entry.name}`}
                                onClick={() => void skins.remove(entry.id!)}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />
                                </svg>
                            </button>
                        ) : (
                            <span className="skin-delete-placeholder" aria-hidden="true" />
                        )}
                    </div>
                ))}
            </div>
            <p className="skin-error" role="status">
                {skins.error}
            </p>
            <footer>
                <span role="status">
                    {dragging ? '松开以导入 ZIP 皮肤' : '支持拖入 ZIP · 仅保存在本地'}
                </span>
                <button
                    className="ui-button"
                    disabled={skins.busy}
                    onClick={() => input.current?.click()}
                >
                    导入皮肤
                </button>
                <input
                    ref={input}
                    type="file"
                    accept=".zip,application/zip"
                    hidden
                    aria-label="皮肤 ZIP 文件"
                    onChange={(event) => {
                        const file = event.target.files?.[0];

                        event.target.value = '';

                        if (file) void skins.importFile(file);
                    }}
                />
            </footer>
        </dialog>
    );
}
