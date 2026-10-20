import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Client, type BoardProps } from 'boardgame.io/react';
import { BoardArt } from '@/components/BoardArt';
import { PieceArt } from '@/components/PieceArt';
import { PiecePicker } from '@/components/PiecePicker';
import { PositionMark } from '@/components/PositionMark';
import { PositionEditor } from '@/core/editor';
import { gameConfig, gameFromPosition, playerSide } from '@/adapters/boardgame';
import { Board, type BoardData, type Index } from '@/core/board';
import { Side, Kind, Piece } from '@/core/piece';
import { Game, type GameState } from '@/core/game';
import { useGameSounds } from '@/hooks/use-game-sounds';
import { useMoveAnimation } from '@/hooks/use-move-animation';

interface GameBoardProps extends BoardProps<GameState> {
    onApplyPosition: (board: BoardData) => void;
    soundEnabled: boolean;
    onSoundEnabledChange: (enabled: boolean) => void;
}

function GameBoard({
    G,
    ctx,
    moves,
    onApplyPosition,
    soundEnabled,
    onSoundEnabledChange,
}: GameBoardProps) {
    const [selected, setSelected] = useState<Index | null>(null);
    const [cursor, setCursor] = useState<Index>(149);
    const [confirmReset, setConfirmReset] = useState(false);
    const [draft, setDraft] = useState<BoardData | null>(null);
    const [picker, setPicker] = useState<Index | null>(null);
    const editor = draft ? new PositionEditor(draft) : null;
    const game = new Game(G);
    const board = draft ?? G.board;
    const side = playerSide(ctx.currentPlayer);
    const destinations = editor || selected === null ? [] : game.findLegalMoves(selected);
    const forbiddenDestinations =
        editor || selected === null ? [] : game.findForbiddenMoves(selected);
    const isCheck = !editor && !G.winner && game.isCheck(side);
    const unavailablePieces = isCheck
        ? board.flatMap((occupant, index) =>
              occupant?.side === side && game.findLegalMoves(index).length === 0 ? [index] : [],
          )
        : [];
    const sounds = useGameSounds(G, isCheck, soundEnabled && !editor);
    const { boardRef, captured, clearCapture } = useMoveAnimation(G, !editor);
    const sideName = (value: string) => (value === Side.Red ? '红方' : '黑方');
    const status = editor
        ? '摆子中'
        : G.winner
          ? `${sideName(G.winner)}胜`
          : `${sideName(side)}行棋${isCheck ? ' · 将军' : ''}`;

    useEffect(() => {
        if (picker === null) return;

        const dismiss = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('.piece-picker')) return;

            event.preventDefault();
            event.stopPropagation();
            setPicker(null);
        };
        const escape = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') setPicker(null);
        };

        document.addEventListener('click', dismiss, true);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('click', dismiss, true);
            document.removeEventListener('keydown', escape);
        };
    }, [picker]);

    function editAt(index: Index) {
        if (!editor) return;

        let success = true;

        if (selected === index) {
            success = editor.remove(index);
        } else if (selected !== null) {
            success = editor.move(selected, index);
        } else {
            if (board[index]) {
                setSelected(index);
            } else if (
                [Side.Red, Side.Black].some((side) =>
                    Object.values(Kind).some((kind) => editor.remaining(side, kind) > 0),
                )
            ) {
                setPicker(index);
            }

            return;
        }

        if (!success) return;

        setDraft(editor.data);
        setSelected(null);
        setPicker(null);
    }

    function beginEdit() {
        setDraft(G.board.slice());
        setSelected(null);
        setPicker(null);
        setConfirmReset(false);
    }

    function cancelEdit() {
        setDraft(null);
        setSelected(null);
        setPicker(null);
    }

    function saveEdit() {
        if (!editor || !editor.canStart()) return;

        onApplyPosition(editor.data);
    }

    function placeAt(piece: Piece) {
        if (!editor || picker === null || !editor.place(piece, picker)) return;

        setDraft(editor.data);
        setPicker(null);
    }

    function pick(index: Index) {
        if (editor) {
            setCursor(index);
            editAt(index);
            return;
        }

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
            setPicker(null);
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

        onApplyPosition(new Board().data);
        setSelected(null);
        setConfirmReset(false);
    }

    return (
        <main className={`game${editor ? ' editing' : ''}`}>
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
                        onClick={() => onSoundEnabledChange(!soundEnabled)}
                    >
                        音效 {soundEnabled ? '开' : '关'}
                    </button>
                    {editor ? (
                        <>
                            <button onClick={saveEdit}>开始对弈</button>
                            <button onClick={cancelEdit}>取消摆子</button>
                        </>
                    ) : (
                        <>
                            <button onClick={beginEdit}>摆子</button>
                            {confirmReset && <span>结束当前对局？</span>}
                            <button onClick={newGame}>
                                {confirmReset ? '确认新局' : '新局'}
                                <span aria-hidden="true"> ↻</span>
                            </button>
                            {confirmReset && (
                                <button onClick={() => setConfirmReset(false)}>取消</button>
                            )}
                        </>
                    )}
                </div>
            </header>
            <section className="play-area" aria-label="匈汉象棋对局">
                {editor && (
                    <div className="editor-toolbar">
                        <button
                            onClick={() => {
                                editor.clear();
                                setDraft(editor.data);
                                setSelected(null);
                                setPicker(null);
                            }}
                        >
                            清空棋盘
                        </button>
                        <button
                            onClick={() => {
                                editor.reset();
                                setDraft(editor.data);
                                setSelected(null);
                                setPicker(null);
                            }}
                        >
                            默认布局
                        </button>
                    </div>
                )}
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
                    {board.map((occupant, index) => {
                        const { x, y } = Board.coordinatesOf(index);
                        const possible = destinations.includes(index);
                        const forbidden = forbiddenDestinations.includes(index);
                        const lastFrom = !editor && G.lastMove?.from === index;
                        const lastTo = !editor && G.lastMove?.to === index;
                        const isKingInCheck =
                            occupant?.side === side && occupant.kind === Kind.King && isCheck;
                        const isDefeatedKing =
                            !editor &&
                            !!G.winner &&
                            occupant?.kind === Kind.King &&
                            occupant.side !== G.winner;
                        const unavailable = unavailablePieces.includes(index);
                        const active = selected === index || (!!editor && picker === index);
                        const label = `${'ABCDEFGHIJKLM'[x]}${y + 1}${occupant ? ` ${sideName(occupant.side)}${Piece.nameOf(occupant.side, occupant.kind)}` : ' 空位'}`;

                        return (
                            <button
                                key={index}
                                id={`point-${index}`}
                                className={`point${active ? ' selected' : ''}${possible ? ' possible' : ''}${isKingInCheck ? ' checked' : ''}${isDefeatedKing ? ' defeated' : ''}${unavailable ? ' unavailable' : ''}`}
                                tabIndex={cursor === index ? 0 : -1}
                                aria-label={`${label}${possible ? '，可落子' : ''}${forbidden ? '，禁着：会使己方王受攻击或两王照面' : ''}${lastFrom ? '，上一步起点' : ''}${lastTo ? '，上一步落点' : ''}`}
                                aria-pressed={active}
                                aria-disabled={(!editor && !!G.winner) || unavailable}
                                disabled={!editor && !!G.winner}
                                onClick={() => pick(index)}
                                onFocus={() => setCursor(index)}
                                onKeyDown={(event) => navigate(event, index)}
                            >
                                {occupant && (
                                    <span className={`piece ${occupant.side}`}>
                                        <PieceArt piece={occupant} />
                                    </span>
                                )}
                                {!editor && captured?.index === index && (
                                    <span
                                        className={`piece captured-piece ${captured.piece.side}`}
                                        aria-hidden="true"
                                        onAnimationEnd={clearCapture}
                                    >
                                        <PieceArt piece={captured.piece} />
                                    </span>
                                )}
                                {lastFrom && <span className="last-from-mark" aria-hidden="true" />}
                                {(lastTo || (editor && active)) && <PositionMark />}
                                {forbidden && (
                                    <span className="move-mark forbidden-mark" aria-hidden="true" />
                                )}
                                {possible && (
                                    <span className={occupant ? 'capture-mark' : 'move-mark'} />
                                )}
                            </button>
                        );
                    })}
                    {editor && picker !== null && (
                        <PiecePicker editor={editor} index={picker} onSelect={placeAt} />
                    )}
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
            </footer>
        </main>
    );
}

export default function App() {
    const [position, setPosition] = useState<BoardData | null>(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const GameClient = useMemo(
        () =>
            Client<GameState, GameBoardProps>({
                game: position ? gameFromPosition(position) : gameConfig,
                board: GameBoard,
                numPlayers: 2,
                debug: import.meta.env.DEV,
            }),
        [position],
    );

    return (
        <GameClient
            onApplyPosition={setPosition}
            soundEnabled={soundEnabled}
            onSoundEnabledChange={setSoundEnabled}
        />
    );
}
