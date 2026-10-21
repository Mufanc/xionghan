import { useSkins } from '@/skins/SkinProvider';
import { Piece } from '@xionghan/core/piece';

export function PieceArt({ piece }: { piece: Piece }) {
    const url = useSkins()?.skin?.pieceUrl(piece);

    if (url) return <img className="skin-piece" src={url} alt="" draggable={false} />;

    return (
        <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="piece-face" cx="50" cy="50" r="47" strokeWidth="3.5" />
            <circle cx="50" cy="50" r="38" fill="none" strokeWidth="1.5" />
            <text x="50" y="50" fontSize="50" textAnchor="middle" dominantBaseline="central">
                {Piece.nameOf(piece.side, piece.kind)}
            </text>
        </svg>
    );
}
