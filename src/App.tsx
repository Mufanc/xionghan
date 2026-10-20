import { useState, type KeyboardEvent } from 'react';
import { Client, type BoardProps } from 'boardgame.io/react';
import { BoardArt } from '@/components/BoardArt';
import { gameConfig, playerSide } from '@/adapters/boardgame';
import { Board, type Index } from '@/core/board';
import { Side, Kind, Piece } from '@/core/piece';
import { Game, type GameState } from '@/core/game';

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
    const [notice, setNotice] = useState('');
    const [confirmReset, setConfirmReset] = useState(false);
    const game = new Game(G);
    const board = G.board;
    const side = playerSide(ctx.currentPlayer);
    const piece = selected === null ? null : board[selected];
    const destinations = selected === null ? [] : game.findLegalMoves(selected);
    const checked = !G.winner && game.isCheck(side);
    const sideName = (value: string) => (value === Side.Red ? '红方' : '黑方');
    const status = G.winner
        ? `${sideName(G.winner)}胜`
        : `${sideName(side)}行棋${checked ? ' · 将军' : ''}`;

    function pick(index: Index) {
        if (G.winner) return;

        setCursor(index);
        setNotice('');

        if (index === selected) {
            setSelected(null);
        } else if (board[index]?.side === side) {
            setSelected(index);
        } else if (selected !== null && destinations.includes(index)) {
            moves.move(selected, index);
            setSelected(null);
        } else if (selected !== null) {
            setNotice('这里不能落子，请选择有圆点或圆环标记的位置。');
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
            setNotice('');
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
        setNotice('');
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
                    className="board"
                    role="group"
                    aria-label="13乘13棋盘，方向键移动焦点，回车选子或落子，Escape取消选择"
                >
                    <BoardArt />
                    {G.board.map((occupant, index) => {
                        const { x, y } = Board.coordinatesOf(index);
                        const possible = destinations.includes(index);
                        const last = G.lastMove?.from === index || G.lastMove?.to === index;
                        const kingChecked =
                            occupant?.side === side && occupant.kind === Kind.King && checked;
                        const label = `${'ABCDEFGHIJKLM'[x]}${y + 1}${occupant ? ` ${sideName(occupant.side)}${Piece.nameOf(occupant.side, occupant.kind)}` : ' 空位'}`;

                        return (
                            <button
                                key={index}
                                id={`point-${index}`}
                                className={`point${selected === index ? ' selected' : ''}${last ? ' last' : ''}${possible ? ' possible' : ''}${kingChecked ? ' checked' : ''}`}
                                tabIndex={cursor === index ? 0 : -1}
                                aria-label={`${label}${possible ? '，可落子' : ''}`}
                                aria-pressed={selected === index}
                                disabled={!!G.winner}
                                onClick={() => pick(index)}
                                onFocus={() => setCursor(index)}
                                onKeyDown={(event) => navigate(event, index)}
                            >
                                {occupant && (
                                    <span className={`piece ${occupant.side}`}>
                                        <span>{Piece.nameOf(occupant.side, occupant.kind)}</span>
                                    </span>
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
                    {notice ||
                        (G.winner
                            ? '对局结束，点击「新局」再来一盘。'
                            : piece
                              ? `${Piece.nameOf(piece.side, piece.kind)} · ${hints[piece.kind]}`
                              : '点选己方棋子，再点选落点。红方先行。')}
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
