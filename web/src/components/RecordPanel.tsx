import { useEffect, useRef, type CSSProperties } from 'react';
import type { RecordData } from '@xionghan/core/record';
import { useSkins } from '@/skins/SkinProvider';
import { Side } from '@xionghan/core/piece';

interface RecordPanelProps {
    record: RecordData | undefined;
    step: number;
    onSelect?: (step: number) => void;
}

export function RecordPanel({ record, step, onSelect }: RecordPanelProps) {
    const frame = useSkins()?.skin?.frameStyle('record');
    const list = useRef<HTMLDivElement>(null);
    const moves = record?.moves ?? [];
    const offset = moves[0]?.side === Side.Black ? 1 : 0;
    const rounds = Math.ceil((moves.length + offset) / 2);

    useEffect(() => {
        const active = list.current?.querySelector<HTMLElement>('[aria-current="step"]');
        const container = list.current;

        if (!container || !active) return;

        const item = active.getBoundingClientRect();
        const bounds = container.getBoundingClientRect();

        if (item.top < bounds.top) container.scrollTop -= bounds.top - item.top;
        if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom;
        if (item.left < bounds.left) container.scrollLeft -= bounds.left - item.left;
        if (item.right > bounds.right) container.scrollLeft += item.right - bounds.right;
    }, [step]);

    return (
        <section
            className={`record-panel${frame ? ' skinned-record' : ''}`}
            aria-label="棋谱"
            style={
                frame
                    ? ({
                          ...frame,
                          '--record-background': frame.backgroundImage ?? 'none',
                          '--record-border-image': frame.borderImageSource ?? 'none',
                          '--record-slices': frame.borderImageSlice ?? '0',
                          '--record-border-width': frame.borderImageWidth ?? '0',
                          '--record-padding': frame.padding ?? '0px',
                      } as CSSProperties)
                    : undefined
            }
        >
            <h2>棋谱</h2>
            <div ref={list} className="record-list">
                {Array.from({ length: rounds }, (_, round) => (
                    <div className="record-round" key={round}>
                        <small>{round + 1}.</small>
                        {[0, 1].map((column) => {
                            const index = round * 2 + column - offset;
                            const move = moves[index];

                            return move ? (
                                <button
                                    key={column}
                                    className={move.side}
                                    aria-current={step === index + 1 ? 'step' : undefined}
                                    disabled={!onSelect}
                                    onClick={() => onSelect?.(index + 1)}
                                >
                                    {move.name}
                                </button>
                            ) : (
                                <span key={column} />
                            );
                        })}
                    </div>
                ))}
            </div>
            <div className="record-controls">
                <button
                    aria-label="起始局面"
                    title="起始局面"
                    onClick={() => onSelect?.(0)}
                    disabled={!onSelect || step === 0}
                >
                    |‹
                </button>
                <button
                    aria-label="上一步"
                    title="上一步"
                    onClick={() => onSelect?.(step - 1)}
                    disabled={!onSelect || step === 0}
                >
                    ‹
                </button>
                <span>
                    {step} / {moves.length}
                </span>
                <button
                    aria-label="下一步"
                    title="下一步"
                    onClick={() => onSelect?.(step + 1)}
                    disabled={!onSelect || step === moves.length}
                >
                    ›
                </button>
                <button
                    aria-label="最新局面"
                    title="最新局面"
                    onClick={() => onSelect?.(moves.length)}
                    disabled={!onSelect || step === moves.length}
                >
                    ›|
                </button>
            </div>
        </section>
    );
}
