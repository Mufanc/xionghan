import { useState, type KeyboardEvent } from 'react';
import { Client, type BoardProps } from 'boardgame.io/react';
import { BoardArt } from '@/components/BoardArt';
import { PieceArt } from '@/components/PieceArt';
import { gameConfig, playerSide } from '@/adapters/boardgame';
import { Board, type Index } from '@/core/board';
import { Side, Kind, Piece } from '@/core/piece';
import { Game, type GameState } from '@/core/game';
import { useGameSounds } from '@/hooks/use-game-sounds';
import { useMoveAnimation } from '@/hooks/use-move-animation';

const hints: Record<Kind, string> = {
    [Kind.King]: '宫内直走一格；两王不可照面。',
    [Kind.Advisor]: '宫内斜走一格。',
    [Kind.Elephant]: '斜走两格，不可塞象眼，不越长城。',
    [Kind.Horse]: '走日字或直走三格；马腿被挡时不可走。',
    [Kind.Chariot]: '沿横线、竖线行走，不可越子。',
    [Kind.Cannon]: '直线行走；吃子时必须隔一个棋子。',
    [Kind.Pawn]: '过河前可直进至对岸第一线，吃子只前进一步；过河后可前进或横走一格。',
    [Kind.Train]: '沿斜轨行走，不能越过星点；只有从星点出发才能吃子。',
    [Kind.Guard]: '横走偶数格，不可越子；只能吃相隔两格的棋子。',
    [Kind.Catapult]: '沿直线或斜线行走；只能吃周围一格内、未被邻子保护的棋子。',
};

function GameBoard({ G, ctx, moves, reset }: BoardProps<GameState>) {
    const [selected, setSelected] = useState<Index | null>(null);
    const [cursor, setCursor] = useState<Index>(149);
    const [confirmReset, setConfirmReset] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const game = new Game(G);
    const board = G.board;
    const side = playerSide(ctx.currentPlayer);
    const piece = selected === null ? null : board[selected];
    const destinations = selected === null ? [] : game.findLegalMoves(selected);
    const forbiddenDestinations = selected === null ? [] : game.findForbiddenMoves(selected);
    const isCheck = !G.winner && game.isCheck(side);
    const unavailablePieces = isCheck
        ? board.flatMap((occupant, index) =>
              occupant?.side === side && game.findLegalMoves(index).length === 0 ? [index] : [],
          )
        : [];
    const sounds = useGameSounds(G, isCheck, soundEnabled);
    const { boardRef, captured, clearCapture } = useMoveAnimation(G);
    const sideName = (value: string) => (value === Side.Red ? '红方' : '黑方');
    const status = G.winner
        ? `${sideName(G.winner)}胜`
        : `${sideName(side)}行棋${isCheck ? ' · 将军' : ''}`;

    function pick(index: Index) {
        if (G.winner || unavailablePieces.includes(index)) return;

        setCursor(index);

        if (index === selected) {
            setSelected(null);
        } else if (board[index]?.side === side) {
            setSelected(index);
            sounds.pick();
        } else if (selected !== null && destinations.includes(index)) {
            moves.move(selected, index);
            setSelected(null);
        } else if (selected !== null && forbiddenDestinations.includes(index)) {
            sounds.illegal();
        } else if (selected !== null) {
            setSelected(null);
        }
    }

    function navigate(event: KeyboardEvent<HTMLButtonElement>, index: Index) {
        const { x, y } = Board.coordinatesOf(index);

        const offsets: Record<string, number> = {
            ArrowLeft: x > 0 ? -1 : 0,
            ArrowRight: x < 12 ? 1 : 0,
            ArrowUp: y > 0 ? -Board.SIZE : 0,
            ArrowDown: y < 12 ? Board.SIZE : 0,
        };

        if (event.key === 'Escape') {
            setSelected(null);
        }

        if (!(event.key in offsets)) return;

        event.preventDefault();

        const next = index + offsets[event.key];

        setCursor(next);
        document.getElementById(`point-${next}`)?.focus();
    }

    function newGame() {
        if (G.lastMove && !confirmReset) {
            setConfirmReset(true);
            return;
        }

        reset();
        setSelected(null);
        setConfirmReset(false);
    }

    return (
        <main className="game">
            <header className="topbar">
                <div className="identity">
                    <span className="seal" aria-hidden="true">
                        弈
                    </span>
                    <h1>
                        匈汉象棋<small>十三路 · 同屏对弈</small>
                    </h1>
                </div>
                <div className="new-game">
                    <button
                        className="sound-toggle"
                        role="switch"
                        aria-label="音效"
                        aria-checked={soundEnabled}
                        onClick={() => setSoundEnabled(!soundEnabled)}
                    >
                        音效 {soundEnabled ? '开' : '关'}
                    </button>
                    {confirmReset && <span>结束当前对局？</span>}
                    <button onClick={newGame}>
                        {confirmReset ? '确认新局' : '新局'}
                        <span aria-hidden="true"> ↻</span>
                    </button>
                    {confirmReset && <button onClick={() => setConfirmReset(false)}>取消</button>}
                </div>
            </header>
            <section className="play-area" aria-label="匈汉象棋对局">
                <div className="player-bar">
                    <span className={`player ${Side.Black}`}>
                        <i />
                        黑方
                    </span>
                    <span>單 · 氏 · 都</span>
                </div>
                <div
                    ref={boardRef}
                    className="board"
                    role="group"
                    aria-label="13乘13棋盘，方向键移动焦点，回车选子或落子，Escape取消选择"
                >
                    <BoardArt />
                    {G.board.map((occupant, index) => {
                        const { x, y } = Board.coordinatesOf(index);
                        const possible = destinations.includes(index);
                        const forbidden = forbiddenDestinations.includes(index);
                        const lastFrom = G.lastMove?.from === index;
                        const lastTo = G.lastMove?.to === index;
                        const isKingInCheck =
                            occupant?.side === side && occupant.kind === Kind.King && isCheck;
                        const isDefeatedKing =
                            !!G.winner &&
                            occupant?.kind === Kind.King &&
                            occupant.side !== G.winner;
                        const unavailable = unavailablePieces.includes(index);
                        const label = `${'ABCDEFGHIJKLM'[x]}${y + 1}${occupant ? ` ${sideName(occupant.side)}${Piece.nameOf(occupant.side, occupant.kind)}` : ' 空位'}`;

                        return (
                            <button
                                key={index}
                                id={`point-${index}`}
                                className={`point${selected === index ? ' selected' : ''}${possible ? ' possible' : ''}${isKingInCheck ? ' checked' : ''}${isDefeatedKing ? ' defeated' : ''}${unavailable ? ' unavailable' : ''}`}
                                tabIndex={cursor === index ? 0 : -1}
                                aria-label={`${label}${possible ? '，可落子' : ''}${forbidden ? '，禁着：会使己方王受攻击或两王照面' : ''}${lastFrom ? '，上一步起点' : ''}${lastTo ? '，上一步落点' : ''}`}
                                aria-pressed={selected === index}
                                aria-disabled={!!G.winner || unavailable}
                                disabled={!!G.winner}
                                onClick={() => pick(index)}
                                onFocus={() => setCursor(index)}
                                onKeyDown={(event) => navigate(event, index)}
                            >
                                {occupant && (
                                    <span className={`piece ${occupant.side}`}>
                                        <PieceArt piece={occupant} />
                                    </span>
                                )}
                                {captured?.index === index && (
                                    <span
                                        className={`piece captured-piece ${captured.piece.side}`}
                                        aria-hidden="true"
                                        onAnimationEnd={clearCapture}
                                    >
                                        <PieceArt piece={captured.piece} />
                                    </span>
                                )}
                                {lastFrom && <span className="last-from-mark" aria-hidden="true" />}
                                {lastTo && (
                                    <svg
                                        className="last-to-mark"
                                        viewBox="0 0 100 100"
                                        aria-hidden="true"
                                    >
                                        <path
                                            className="last-to-outline"
                                            d="M5 20V5H20 M80 5H95V20 M95 80V95H80 M20 95H5V80"
                                        />
                                        <path d="M5 20V5H20 M80 5H95V20 M95 80V95H80 M20 95H5V80" />
                                    </svg>
                                )}
                                {forbidden && (
                                    <span className="move-mark forbidden-mark" aria-hidden="true" />
                                )}
                                {possible && (
                                    <span className={occupant ? 'capture-mark' : 'move-mark'} />
                                )}
                            </button>
                        );
                    })}
                </div>
                <div className="player-bar">
                    <span className={`player ${Side.Red}`}>
                        <i />
                        红方
                    </span>
                    <span>皇 · 仕 · 相</span>
                </div>
            </section>
            <footer className="game-footer">
                <div className={`status ${G.winner ?? side}`} role="status">
                    <i />
                    {status}
                </div>
                <p aria-live="polite">
                    {G.winner
                        ? '对局结束，点击「新局」再来一盘。'
                        : piece
                          ? `${Piece.nameOf(piece.side, piece.kind)} · ${hints[piece.kind]}${forbiddenDestinations.length ? ' 红点为禁着：会使己方王受攻击或两王照面。' : ''}`
                          : '点选己方棋子，再点选落点。红方先行。'}
                </p>
            </footer>
        </main>
    );
}

export default Client({
    game: gameConfig,
    board: GameBoard,
    numPlayers: 2,
    debug: import.meta.env.DEV,
});
