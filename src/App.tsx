import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { Client, type BoardProps } from 'boardgame.io/react';
import { BoardArt } from '@/components/BoardArt';
import { PieceArt } from '@/components/PieceArt';
import { PiecePicker } from '@/components/PiecePicker';
import { PositionMark } from '@/components/PositionMark';
import { RecordPanel } from '@/components/RecordPanel';
import { GameRecord } from '@/core/record';
import { PositionEditor } from '@/core/editor';
import { gameConfig, gameFromPosition, gameFromSession, playerSide } from '@/adapters/boardgame';
import { Board, type BoardData, type Index } from '@/core/board';
import { Side, Kind, Piece } from '@/core/piece';
import { Game, type GameState } from '@/core/game';
import { useGameSounds } from '@/hooks/use-game-sounds';
import { useMoveAnimation } from '@/hooks/use-move-animation';
import { loadSession, saveSession } from '@/storage/session';

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

interface GameBoardProps extends BoardProps<GameState> {
    initialDraft: BoardData | null;
    recordVisible: boolean;
    onRecordVisibleChange: (visible: boolean) => void;
    onApplyPosition: (board: BoardData) => void;
    soundEnabled: boolean;
    onSoundEnabledChange: (enabled: boolean) => void;
}

function GameBoard({
    G,
    ctx,
    moves,
    onApplyPosition,
    initialDraft,
    recordVisible,
    onRecordVisibleChange,
    soundEnabled,
    onSoundEnabledChange,
}: GameBoardProps) {
    const [selected, setSelected] = useState<Index | null>(null);
    const [cursor, setCursor] = useState<Index>(149);
    const [confirmReset, setConfirmReset] = useState(false);
    const [draft, setDraft] = useState<BoardData | null>(initialDraft);
    const [picker, setPicker] = useState<Index | null>(null);
    const [reviewStep, setReviewStep] = useState<number | null>(null);
    const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
    const totalSteps = G.record?.moves.length ?? 0;
    const reviewing = reviewStep !== null && reviewStep < totalSteps;
    const displayed = useMemo(
        () => (reviewing && G.record ? new GameRecord(G.record).stateAt(reviewStep!) : G),
        [G, reviewing, reviewStep],
    );
    const editor = draft ? new PositionEditor(draft) : null;
    const game = new Game(displayed);
    const board = draft ?? displayed.board;
    const piece = selected === null ? null : board[selected];
    const side =
        reviewing && G.record
            ? (G.record.moves[reviewStep!]?.side ?? playerSide(ctx.currentPlayer))
            : playerSide(ctx.currentPlayer);
    const destinations =
        editor || reviewing || selected === null ? [] : game.findLegalMoves(selected);
    const forbiddenDestinations =
        editor || reviewing || selected === null ? [] : game.findForbiddenMoves(selected);
    const isCheck = !editor && !displayed.winner && game.isCheck(side);
    const unavailablePieces = isCheck
        ? board.flatMap((occupant, index) =>
              occupant?.side === side && game.findLegalMoves(index).length === 0 ? [index] : [],
          )
        : [];
    const sounds = useGameSounds(
        G,
        !G.winner && new Game(G).isCheck(playerSide(ctx.currentPlayer)),
        soundEnabled && !editor && !reviewing,
    );
    const { boardRef, captured, clearCapture } = useMoveAnimation(G, !editor && !reviewing);
    const sideName = (value: string) => (value === Side.Red ? '红方' : '黑方');
    const status = editor
        ? '摆子中'
        : reviewing
          ? `第 ${reviewStep} 步`
          : G.winner
            ? `${sideName(G.winner)}胜`
            : `${sideName(side)}行棋${isCheck ? ' · 将军' : ''}`;

    useEffect(() => {
        const update = () => setFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', update);

        return () => document.removeEventListener('fullscreenchange', update);
    }, []);

    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                const portrait = matchMedia('(orientation: portrait)').matches;
                await document.documentElement.requestFullscreen();

                if (
                    portrait &&
                    screen.orientation &&
                    'lock' in screen.orientation &&
                    typeof screen.orientation.lock === 'function'
                ) {
                    try {
                        await screen.orientation.lock('portrait');
                    } catch (error) {
                        console.warn('浏览器不支持锁定竖屏', error);
                    }
                }
            }
        } catch (error) {
            console.warn('无法切换全屏', error);
        }
    }

    useEffect(() => {
        saveSession({
            version: 1,
            game: G,
            currentPlayer: ctx.currentPlayer === '0' ? '0' : '1',
            draft,
            soundEnabled,
            recordVisible,
        });
    }, [G, ctx.currentPlayer, draft, soundEnabled, recordVisible]);

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

    function transitionLayout(update: () => void) {
        if (
            document.startViewTransition &&
            !matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            document.startViewTransition(() => flushSync(update));
        } else {
            update();
        }
    }

    function beginEdit() {
        if (reviewing) return;

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

        if (reviewing || G.winner || unavailablePieces.includes(index)) return;

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
        <main
            className={`game${editor ? ' editing' : ''}${!recordVisible ? ' record-hidden' : ''}`}
        >
            <header className="topbar">
                <div className="identity">
                    <span className="seal" aria-hidden="true">
                        弈
                    </span>
                    <h1>
                        匈汉象棋<small>十三路 · 同屏对弈</small>
                    </h1>
                </div>
                <div className="view-controls">
                    <button
                        className="ui-button quiet"
                        role="switch"
                        aria-label="音效"
                        aria-checked={soundEnabled}
                        onClick={() => onSoundEnabledChange(!soundEnabled)}
                    >
                        <span className="toggle-dot" aria-hidden="true" />
                        音效
                    </button>
                    <button
                        className="ui-button quiet"
                        aria-pressed={recordVisible}
                        disabled={!!editor}
                        onClick={() => {
                            const toggle = () => {
                                onRecordVisibleChange(!recordVisible);
                                setReviewStep(null);
                                setSelected(null);
                            };

                            transitionLayout(toggle);
                        }}
                    >
                        <span className="toggle-dot" aria-hidden="true" />
                        棋谱
                    </button>
                    {document.fullscreenEnabled && (
                        <button
                            className="ui-button quiet"
                            aria-pressed={fullscreen}
                            title={fullscreen ? '退出全屏（Esc）' : '进入全屏'}
                            onClick={toggleFullscreen}
                        >
                            <span className="toggle-dot" aria-hidden="true" />
                            全屏
                        </button>
                    )}
                </div>
            </header>
            <nav className="game-toolbar" aria-label={editor ? '摆子操作' : '对局操作'}>
                <button
                    className="ui-button"
                    disabled={!editor && reviewing}
                    onClick={() => transitionLayout(editor ? cancelEdit : beginEdit)}
                >
                    {editor ? '取消摆子' : '摆子'}
                </button>
                <div className="game-actions">
                    {editor ? (
                        <>
                            <button
                                className="ui-button quiet"
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
                                className="ui-button quiet"
                                onClick={() => {
                                    editor.reset();
                                    setDraft(editor.data);
                                    setSelected(null);
                                    setPicker(null);
                                }}
                            >
                                默认布局
                            </button>
                            <button className="ui-button primary" onClick={saveEdit}>
                                开始对弈
                            </button>
                        </>
                    ) : (
                        <>
                            {confirmReset && (
                                <button
                                    className="ui-button quiet"
                                    onClick={() => setConfirmReset(false)}
                                >
                                    取消
                                </button>
                            )}
                            <button
                                className={`ui-button${confirmReset ? ' primary' : ''}`}
                                onClick={newGame}
                            >
                                {confirmReset ? '确认新局' : '新局'}
                            </button>
                        </>
                    )}
                </div>
            </nav>
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
                    {board.map((occupant, index) => {
                        const { x, y } = Board.coordinatesOf(index);
                        const possible = destinations.includes(index);
                        const forbidden = forbiddenDestinations.includes(index);
                        const lastFrom = !editor && displayed.lastMove?.from === index;
                        const lastTo = !editor && displayed.lastMove?.to === index;
                        const isKingInCheck =
                            occupant?.side === side && occupant.kind === Kind.King && isCheck;
                        const isDefeatedKing =
                            !editor &&
                            !!displayed.winner &&
                            occupant?.kind === Kind.King &&
                            occupant.side !== displayed.winner;
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
                                aria-disabled={reviewing || (!editor && !!G.winner) || unavailable}
                                disabled={reviewing || (!editor && !!G.winner)}
                                onClick={() => pick(index)}
                                onFocus={() => setCursor(index)}
                                onKeyDown={(event) => navigate(event, index)}
                            >
                                {occupant && (
                                    <span className={`piece ${occupant.side}`}>
                                        <PieceArt piece={occupant} />
                                    </span>
                                )}
                                {!editor && !reviewing && captured?.index === index && (
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
                {!editor && !reviewing && (
                    <p aria-live="polite">
                        {G.winner
                            ? '对局结束，点击「新局」再来一盘。'
                            : piece
                              ? `${Piece.nameOf(piece.side, piece.kind)} · ${hints[piece.kind]}${forbiddenDestinations.length ? ' 红点为禁着：会使己方王受攻击或两王照面。' : ''}`
                              : '点选己方棋子，再点选落点。红方先行。'}
                    </p>
                )}
            </footer>
            {!editor && recordVisible && (
                <RecordPanel
                    record={G.record}
                    step={reviewing ? reviewStep! : totalSteps}
                    onSelect={(step) => {
                        setReviewStep(step === totalSteps ? null : step);
                        setSelected(null);
                        setPicker(null);
                    }}
                />
            )}
        </main>
    );
}

export default function App() {
    const [saved] = useState(loadSession);
    const [position, setPosition] = useState<BoardData | null>(null);
    const [soundEnabled, setSoundEnabled] = useState(saved?.soundEnabled ?? true);
    const [recordVisible, setRecordVisible] = useState(saved?.recordVisible ?? true);
    const GameClient = useMemo(
        () =>
            Client<GameState, GameBoardProps>({
                game: position
                    ? gameFromPosition(position)
                    : saved
                      ? gameFromSession(saved.game, saved.currentPlayer)
                      : gameConfig,
                board: GameBoard,
                numPlayers: 2,
                debug: import.meta.env.DEV,
            }),
        [position, saved],
    );

    return (
        <GameClient
            initialDraft={position ? null : (saved?.draft ?? null)}
            recordVisible={recordVisible}
            onRecordVisibleChange={setRecordVisible}
            onApplyPosition={setPosition}
            soundEnabled={soundEnabled}
            onSoundEnabledChange={setSoundEnabled}
        />
    );
}
