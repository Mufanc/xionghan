import { useSkins } from '@/skins/SkinProvider';
import { PieceArt } from '@/components/PieceArt';
import { PositionEditor } from '@/core/editor';
import { Board, type Index } from '@/core/board';
import { Kind, Side, Piece } from '@/core/piece';

interface Props {
    editor: PositionEditor;
    index: Index;
    onSelect: (piece: Piece) => void;
}

export function PiecePicker({ editor, index, onSelect }: Props) {
    const skin = useSkins()?.skin;
    const { x, y } = Board.coordinatesOf(index);

    return (
        <div
            className="piece-picker"
            role="dialog"
            aria-label="棋盒"
            style={{
                ...skin?.frameStyle('panel'),
                left: `clamp(8px, ${((x + 0.5) * 100) / 13}%, calc(100% - var(--picker-width) - 8px))`,
                [y < 6 ? 'top' : 'bottom']: `${((y < 6 ? y + 1 : 13 - y) * 100) / 13}%`,
            }}
        >
            {[Side.Black, Side.Red].map((side) => (
                <div
                    className="picker-pieces"
                    role="group"
                    aria-label={side === Side.Red ? '红方' : '黑方'}
                    key={side}
                >
                    {Object.values(Kind)
                        .filter((kind) => kind !== Kind.King)
                        .map((kind) => {
                            const remaining = editor.remaining(side, kind);
                            const piece = { side, kind };

                            return (
                                <button
                                    key={kind}
                                    className={`palette-piece${remaining === 0 ? ' empty' : ''}`}
                                    aria-label={`${side === Side.Red ? '红方' : '黑方'}${Piece.nameOf(side, kind)}，可用 ${remaining}`}
                                    disabled={remaining === 0 || !editor.canPlace(piece, index)}
                                    onClick={() => onSelect(piece)}
                                >
                                    <span className={`piece ${side}`}>
                                        <PieceArt piece={piece} />
                                    </span>
                                    {remaining > 0 && (
                                        <span className="piece-count">{remaining}</span>
                                    )}
                                </button>
                            );
                        })}
                </div>
            ))}
        </div>
    );
}
