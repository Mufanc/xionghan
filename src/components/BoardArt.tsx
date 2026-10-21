import { Board } from '@/core/board';

const lines = Array.from({ length: Board.SIZE }, (_, index) => index * 100 + 50);
const stars = [
    [0, 0],
    [6, 0],
    [12, 0],
    [3, 3],
    [9, 3],
    [0, 6],
    [6, 6],
    [12, 6],
    [3, 9],
    [9, 9],
    [0, 12],
    [6, 12],
    [12, 12],
];

export function BoardArt({ flipped = false }: { flipped?: boolean }) {
    return (
        <svg
            className="board-art"
            viewBox="0 0 1300 1300"
            aria-hidden="true"
            style={{ rotate: flipped ? '180deg' : undefined }}
        >
            <rect width="1300" height="1300" fill="bisque" />
            <g stroke="#35352f" fill="none">
                <rect x="30" y="30" width="1240" height="1240" strokeWidth="10" />
                {lines.map((value) => (
                    <g key={value} strokeWidth="2.5">
                        <path d={`M50 ${value}H1250`} />
                        <path d={`M${value} 50V550 M${value} 600V700 M${value} 750V1250`} />
                    </g>
                ))}
                <path
                    d="M550 150L750 350M750 150L550 350M550 950L750 1150M750 950L550 1150"
                    strokeWidth="2.5"
                />
                <path
                    d="M50 50L1250 1250M50 1250L1250 50M50 650L650 50L1250 650L650 1250Z"
                    strokeWidth="2"
                    strokeDasharray="12 25 12 50"
                />
                {stars.map(([x, y]) => (
                    <g
                        key={`${x}-${y}`}
                        transform={`translate(${50 + x * 100} ${50 + y * 100})`}
                        strokeWidth="4"
                    >
                        {x > 0 && y > 0 && <path d="M-8 -24V-8H-24" />}
                        {x < 12 && y > 0 && <path d="M8 -24V-8H24" />}
                        {x > 0 && y < 12 && <path d="M-8 24V8H-24" />}
                        {x < 12 && y < 12 && <path d="M8 24V8H24" />}
                    </g>
                ))}
                {[5, 7].map((y) =>
                    Array.from({ length: 7 }, (_, i) => (
                        <circle
                            key={`${i}-${y}`}
                            cx={50 + i * 200}
                            cy={50 + y * 100}
                            r={i % 2 === 0 ? 10 : 6}
                            fill="bisque"
                            strokeWidth="3"
                        />
                    )),
                )}
            </g>
            <g fill="#35352f">
                {[1, 3, 5, 7, 9, 11].map((y) =>
                    Array.from({ length: y % 4 === 3 ? 3 : 4 }, (_, i) => (
                        <circle
                            key={`${i}-${y}`}
                            cx={50 + (i * 4 + (y % 4 === 3 ? 2 : 0)) * 100}
                            cy={50 + y * 100}
                            r="5"
                        />
                    )),
                )}
                {lines.map((x, index) => (
                    <g key={x}>
                        <circle
                            cx={x}
                            cy="650"
                            r="15"
                            fill="bisque"
                            stroke="#35352f"
                            strokeWidth="2.5"
                        />
                        <text
                            x={x}
                            transform={flipped ? `rotate(180 ${x} 650)` : undefined}
                            y="651"
                            fontSize="18"
                            fontWeight="700"
                            fontFamily="BoardColumns, serif"
                            textAnchor="middle"
                            dominantBaseline="middle"
                        >
                            {'ABCDEFGHIJKLM'[index]}
                        </text>
                    </g>
                ))}
            </g>
        </svg>
    );
}
