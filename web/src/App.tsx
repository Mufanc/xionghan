import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useComputer } from '@/ai/use-computer';
import { useWebMCP } from '@/ai/use-webmcp';
import { flushSync } from 'react-dom';
import { Client, type BoardProps } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { RoomPage, ConnectionPending } from '@/online/RoomPage';
import { Rooms, invitationURL, type RoomSession } from '@/online/rooms';
import { onlineGameConfig, takebackSteps } from '@xionghan/core/online';
import { BoardView } from '@/components/BoardView';
import { PiecePicker } from '@/components/PiecePicker';
import { GameActions, type GameAction } from '@/components/GameActions';
import { OnlineControls } from '@/components/OnlineControls';
import { RecordPanel } from '@/components/RecordPanel';
import { UpdateNotice } from '@/components/UpdateNotice';
import { GameRecord } from '@xionghan/core/record';
import { PositionEditor } from '@xionghan/core/editor';
import {
    gameConfig,
    gameFromPosition,
    gameFromSession,
    playerSide,
} from '@xionghan/core/boardgame';
import { Board, type BoardData, type Index } from '@xionghan/core/board';
import { Side, Kind, Piece } from '@xionghan/core/piece';
import { Game, type GameState } from '@xionghan/core/game';
import { useGameSounds } from '@/hooks/use-game-sounds';
import { SkinProvider, useSkins } from '@/skins/SkinProvider';
import { loadSession, saveSession } from '@/storage/session';
import {
    downloadRecord,
    parseRecord,
    MAX_RECORD_BYTES,
    type ImportedRecord,
} from '@/storage/record-file';

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
    online?: RoomSession;
    computerSide?: Side | null;
    onComputerMode?: (hasMoves: boolean) => void;
    onLocalMode?: (hasMoves: boolean) => void;
    archive?: boolean;
    autoInvite?: boolean;
    playStart?: boolean;
    onNewGame?: () => void;
    onImportRecord?: (record: ImportedRecord) => void;
    initialReview?: boolean;
    onOpenOnline: () => void;
    onReturnLobby?: () => void;
    initialDraft: BoardData | null;
    recordVisible: boolean;
    onRecordVisibleChange: (visible: boolean) => void;
    onApplyPosition: (board: BoardData) => void;
    soundEnabled: boolean;
    volume: number;
    onVolumeChange: (volume: number) => void;
    onSoundEnabledChange: (enabled: boolean) => void;
}

function GameBoard({
    G,
    ctx,
    isActive,
    isConnected,
    matchData,
    playerID,
    online,
    computerSide,
    onComputerMode,
    onLocalMode,
    archive = false,
    autoInvite = false,
    playStart = false,
    onNewGame,
    onImportRecord,
    initialReview = false,
    onOpenOnline,
    onReturnLobby,
    moves,
    onApplyPosition,
    initialDraft,
    recordVisible,
    onRecordVisibleChange,
    soundEnabled,
    onSoundEnabledChange,
    volume,
    onVolumeChange,
}: GameBoardProps) {
    const skins = useSkins();
    const recordInput = useRef<HTMLInputElement>(null);
    const importDialog = useRef<HTMLDialogElement>(null);
    const [pendingRecord, setPendingRecord] = useState<ImportedRecord | null>(null);
    const [recordError, setRecordError] = useState('');
    const [readingRecord, setReadingRecord] = useState(false);

    async function readRecord(file: File) {
        setPendingRecord(null);
        setRecordError('');
        setReadingRecord(true);
        importDialog.current?.showModal();

        try {
            if (file.size > MAX_RECORD_BYTES) throw new Error('棋谱文件不能超过 10 MB。');

            setPendingRecord(parseRecord(await file.text()));
        } catch (error) {
            setRecordError(error instanceof Error ? error.message : '无法读取棋谱。');
        } finally {
            setReadingRecord(false);
        }
    }

    const [selected, setSelected] = useState<Index | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const resetDialog = useRef<HTMLDialogElement>(null);
    const shareDialog = useRef<HTMLDialogElement>(null);
    const shareInput = useRef<HTMLInputElement>(null);
    const invitationShown = useRef(false);
    const [copied, setCopied] = useState(false);
    const menu = useRef<HTMLDivElement>(null);
    const [draft, setDraft] = useState<BoardData | null>(initialDraft);
    const [picker, setPicker] = useState<Index | null>(null);
    const [reviewStep, setReviewStep] = useState<number | null>(initialReview ? 0 : null);
    const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
    const opponent = matchData?.find((player) => String(player.id) !== playerID);
    const waiting = !!online && !opponent?.name;
    const [now, setNow] = useState(Date.now);
    const pendingTakeback = online && G.takeback && G.takeback.expiresAt > now ? G.takeback : null;
    const pendingDraw = online && G.drawOffer && G.drawOffer.expiresAt > now ? G.drawOffer : null;
    const requestExpiresAt = Math.max(G.takeback?.expiresAt ?? 0, G.drawOffer?.expiresAt ?? 0);
    const canPlay =
        !ctx.gameover &&
        !archive &&
        (!computerSide || playerSide(ctx.currentPlayer) !== computerSide) &&
        !(pendingTakeback && pendingTakeback.playerID === playerID) &&
        (!online ||
            (!!isConnected &&
                isActive &&
                playerID === ctx.currentPlayer &&
                !!opponent?.isConnected));

    useEffect(() => {
        if (!requestExpiresAt || !online) return;

        setNow(Date.now());
        const timer = setInterval(() => {
            const time = Date.now();
            setNow(time);
            if (time >= requestExpiresAt) clearInterval(timer);
        }, 200);

        return () => clearInterval(timer);
    }, [requestExpiresAt, online]);

    useEffect(() => {
        setSelected(null);
    }, [pendingTakeback?.id]);

    const winner: Side | null = ctx.gameover?.winner ?? null;
    const totalSteps = G.record?.moves.length ?? 0;
    const canReview = !online || !!ctx.gameover;
    const reviewing = canReview && reviewStep !== null && reviewStep < totalSteps;
    const displayed = useMemo(
        () => (reviewing && G.record ? new GameRecord(G.record).stateAt(reviewStep!) : G),
        [G, reviewing, reviewStep],
    );
    const computerMove = useCallback((from: number, to: number) => moves.move(from, to), [moves]);
    const computer = useComputer(
        G,
        playerSide(ctx.currentPlayer),
        !!computerSide &&
            playerSide(ctx.currentPlayer) === computerSide &&
            !draft &&
            !reviewing &&
            !winner,
        computerMove,
    );
    useWebMCP(
        {
            game: G,
            side: playerSide(ctx.currentPlayer),
            human: computerSide ? Side.opposite(computerSide) : Side.Red,
            enabled: !!computerSide && !online && !archive,
            canMove: canPlay && !draft && !reviewing && !ctx.gameover && !computer.draw,
            winner,
            draw: computer.draw,
        },
        (from, to) => {
            moves.move(from, to);
            setSelected(null);
        },
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
        editor ||
        reviewing ||
        winner ||
        (computerSide && computer.draw) ||
        !canPlay ||
        selected === null
            ? []
            : game.findLegalMoves(selected);
    const forbiddenDestinations =
        editor ||
        reviewing ||
        winner ||
        (computerSide && computer.draw) ||
        !canPlay ||
        selected === null
            ? []
            : game.findForbiddenMoves(selected);
    const isCheck = !editor && (reviewing || !winner) && game.isCheck(side);
    const unavailablePieces = isCheck
        ? board.flatMap((occupant, index) =>
              occupant?.side === side && game.findLegalMoves(index).length === 0 ? [index] : [],
          )
        : [];
    const sounds = useGameSounds(
        displayed,
        soundEnabled && !editor,
        reviewing ? null : winner,
        reviewing ? reviewStep! : totalSteps,
        volume,
        online && isConnected && opponent?.isConnected && totalSteps === 0
            ? `${import.meta.env.VITE_API_SERVER_URL || location.origin}:${online.matchID}:${online.playerID}`
            : playStart
              ? 'local'
              : undefined,
        online
            ? playerSide(online.playerID)
            : computerSide
              ? Side.opposite(computerSide)
              : Side.Red,
    );
    const sideName = (value: string) => (value === Side.Red ? '红方' : '黑方');
    const status = editor
        ? '摆子中'
        : online && !isConnected
          ? '正在重连…'
          : waiting
            ? '等待对手加入'
            : online && !opponent?.isConnected
              ? '等待对手重连'
              : reviewing
                ? `第 ${reviewStep} 步`
                : ctx.gameover?.draw
                  ? '和棋 · 双方同意'
                  : winner
                    ? `${sideName(winner)}胜`
                    : computerSide && computer.draw
                      ? '和棋 · 三次重复局面'
                      : computerSide && side === computerSide
                        ? computer.error || '电脑思考中…'
                        : `${sideName(side)}行棋${isCheck ? ' · 将军' : ''}`;

    useEffect(() => {
        const update = () => setFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', update);

        return () => document.removeEventListener('fullscreenchange', update);
    }, []);

    useEffect(() => {
        if (confirmReset) resetDialog.current?.showModal();
        else resetDialog.current?.close();
    }, [confirmReset]);

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
        if (online || archive) return;

        const persist = () =>
            saveSession({
                version: 1,
                game: G,
                currentPlayer: ctx.currentPlayer === '0' ? '0' : '1',
                draft,
                soundEnabled,
                volume,
                recordVisible,
                computerSide: computerSide ?? null,
            });

        persist();
        window.addEventListener('pagehide', persist);

        return () => window.removeEventListener('pagehide', persist);
    }, [
        G,
        ctx.currentPlayer,
        draft,
        soundEnabled,
        volume,
        recordVisible,
        online,
        archive,
        computerSide,
    ]);

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
        if (reviewing || online) return;

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
            editAt(index);
            return;
        }

        if (
            !canPlay ||
            reviewing ||
            winner ||
            (computerSide && computer.draw) ||
            unavailablePieces.includes(index)
        )
            return;

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

    function newGame() {
        if (online) return;

        if (G.lastMove && !confirmReset) {
            setConfirmReset(true);
            return;
        }

        onNewGame?.();
        setSelected(null);
        setConfirmReset(false);
    }

    useEffect(() => setSelected(null), [ctx.currentPlayer, isConnected]);

    function share() {
        setCopied(false);
        shareDialog.current?.showModal();
    }

    useEffect(() => {
        const dialog = shareDialog.current;
        if (!dialog) return;

        if (!waiting) {
            dialog.close();
            invitationShown.current = true;
        } else if (autoInvite && !invitationShown.current) {
            invitationShown.current = true;
            dialog.showModal();
        }
    }, [autoInvite, waiting]);

    async function copyInvitation() {
        if (!online) return;

        try {
            await navigator.clipboard.writeText(invitationURL(online.matchID));
            setCopied(true);
        } catch {
            shareInput.current?.focus();
            shareInput.current?.select();
        }
    }

    const actions: GameAction[] = [
        {
            id: 'clear-board',
            group: 'edit-tools',
            label: '清空',
            placement: editor ? 'toolbar' : 'hidden',
            onClick: () => {
                if (!editor) return;

                editor.clear();
                setDraft(editor.data);
                setSelected(null);
                setPicker(null);
            },
        },
        {
            id: 'default-board',
            group: 'edit-tools',
            label: '默认',
            placement: editor ? 'toolbar' : 'hidden',
            onClick: () => {
                if (!editor) return;

                editor.reset();
                setDraft(editor.data);
                setSelected(null);
                setPicker(null);
            },
        },
        {
            id: 'cancel-edit',
            group: 'edit-confirm',
            label: '取消',
            placement: editor ? 'toolbar' : 'hidden',
            onClick: () => transitionLayout(cancelEdit),
        },
        {
            id: 'start-edit',
            group: 'edit-confirm',
            label: '完成',
            disabled: !editor?.canStart(),
            emphasis: 'primary',
            placement: editor ? 'toolbar' : 'hidden',
            onClick: saveEdit,
        },
        {
            id: 'record',
            label: '棋谱',
            pressed: recordVisible,
            placement: !editor && !online ? 'toolbar' : 'hidden',
            onClick: () =>
                transitionLayout(() => {
                    onRecordVisibleChange(!recordVisible);
                    setReviewStep(null);
                    setSelected(null);
                }),
        },
        {
            id: 'computer',
            label: '人机',
            placement: onComputerMode && !editor ? 'toolbar' : 'hidden',
            onClick: () => onComputerMode?.(totalSteps > 0),
        },
        {
            id: 'online',
            label: '联机',
            emphasis: 'primary',
            placement: 'hidden',
            onClick: onOpenOnline,
        },
        {
            id: 'lobby',
            label: '返回大厅',
            placement: !online && archive ? 'menu' : 'hidden',
            onClick: () => onReturnLobby?.(),
        },
        {
            id: 'edit',
            label: '摆子',
            disabled: reviewing,
            placement: !online && !archive && !editor ? 'menu' : 'hidden',
            onClick: () => transitionLayout(beginEdit),
        },
        {
            id: 'new-game',
            label: '新局',
            placement: !online && !archive && !editor ? 'menu' : 'hidden',
            onClick: newGame,
        },
        {
            id: 'local',
            label: '切换双人',
            placement:
                !online && !archive && !editor && computerSide && onLocalMode ? 'menu' : 'hidden',
            onClick: () => onLocalMode?.(totalSteps > 0),
        },
        {
            id: 'export',
            label: '导出棋谱',
            placement: !editor && !online ? 'menu' : 'hidden',
            onClick: () => downloadRecord(G, ctx.currentPlayer),
        },
        {
            id: 'import',
            label: '导入棋谱',
            disabled: readingRecord,
            placement: !editor && onImportRecord ? 'menu' : 'hidden',
            onClick: () => recordInput.current?.click(),
        },
    ];

    return (
        <main
            className={`game${online ? ' online' : ''}${editor ? ' editing' : ''}${!recordVisible ? ' record-hidden' : ''}`}
        >
            <header className="topbar">
                <div className="identity">
                    <span className="seal" aria-hidden="true">
                        弈
                    </span>
                    <h1>
                        匈汉象棋
                        <small>
                            {online
                                ? `联机对弈 · 执${online.playerID === '0' ? '红' : '黑'}`
                                : archive
                                  ? '历史对局 · 复盘'
                                  : computerSide
                                    ? `人机对战 · 执${computerSide === Side.Black ? '红' : '黑'}`
                                    : '十三路 · 同屏对弈'}
                        </small>
                    </h1>
                </div>
                <nav className="view-controls" aria-label={editor ? '摆子操作' : '对局操作'}>
                    <GameActions actions={actions} placement="toolbar" />
                    <button className="ui-button" popoverTarget="game-menu">
                        菜单
                    </button>
                </nav>
            </header>
            <div
                id="game-menu"
                className="game-menu"
                popover="auto"
                ref={menu}
                aria-label="操作菜单"
            >
                <GameActions
                    actions={actions}
                    placement="menu"
                    onBeforeAction={() => menu.current?.hidePopover()}
                />
                <div className="menu-group">
                    <button
                        className="sound-toggle"
                        role="switch"
                        aria-label="音效"
                        aria-checked={soundEnabled}
                        onClick={() => onSoundEnabledChange(!soundEnabled)}
                    >
                        音效
                        <span className="sound-switch" aria-hidden="true" />
                    </button>
                    <label className="volume-control">
                        <input
                            type="range"
                            aria-label="音量"
                            style={{ '--volume': `${volume * 100}%` } as CSSProperties}
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round(volume * 100)}
                            disabled={!soundEnabled}
                            onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
                        />
                        <output>{Math.round(volume * 100)}%</output>
                    </label>
                    <button
                        onClick={() => {
                            menu.current?.hidePopover();
                            skins?.openDialog();
                        }}
                    >
                        皮肤
                    </button>
                    {document.fullscreenEnabled && (
                        <button
                            onClick={() => {
                                menu.current?.hidePopover();
                                void toggleFullscreen();
                            }}
                        >
                            {fullscreen ? '退出全屏' : '全屏'}
                        </button>
                    )}
                    <a
                        href="?page=rules"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="规则（新标签页）"
                        onClick={() => menu.current?.hidePopover()}
                    >
                        规则<span aria-hidden="true">↗</span>
                    </a>
                </div>
            </div>
            {onImportRecord && (
                <>
                    <input
                        hidden
                        type="file"
                        accept=".json,application/json"
                        ref={recordInput}
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void readRecord(file);
                        }}
                    />
                    <dialog
                        ref={importDialog}
                        className="reset-dialog"
                        aria-labelledby="import-title"
                    >
                        <h2 id="import-title">导入棋谱</h2>
                        <p role="status">
                            {readingRecord
                                ? '正在校验棋谱…'
                                : recordError ||
                                  `共 ${pendingRecord?.game.record?.moves.length ?? 0} 手。导入将替换当前本地对局和棋谱。`}
                        </p>
                        <div>
                            <button
                                className="ui-button quiet"
                                autoFocus
                                onClick={() => importDialog.current?.close()}
                            >
                                取消
                            </button>
                            {pendingRecord && (
                                <button
                                    className="ui-button primary"
                                    onClick={() => {
                                        importDialog.current?.close();
                                        onImportRecord(pendingRecord);
                                    }}
                                >
                                    导入并复盘
                                </button>
                            )}
                        </div>
                    </dialog>
                </>
            )}
            <dialog
                className="reset-dialog"
                aria-labelledby="reset-title"
                ref={resetDialog}
                onCancel={() => setConfirmReset(false)}
            >
                <h2 id="reset-title">开始新局？</h2>
                <p>当前对局和棋谱将被替换。</p>
                <div>
                    <button
                        className="ui-button quiet"
                        autoFocus
                        onClick={() => setConfirmReset(false)}
                    >
                        取消
                    </button>
                    <button className="ui-button primary" onClick={newGame}>
                        开始新局
                    </button>
                </div>
            </dialog>
            {online && (
                <dialog
                    className="reset-dialog share-dialog"
                    ref={shareDialog}
                    aria-labelledby="share-title"
                >
                    <h2 id="share-title">邀请朋友</h2>
                    <p>将链接发给对方，即可加入这盘棋。</p>
                    <input
                        ref={shareInput}
                        aria-label="邀请链接"
                        value={invitationURL(online.matchID)}
                        readOnly
                        onFocus={(event) => event.target.select()}
                    />
                    <p role="status">{copied ? '链接已复制' : `房间 ${online.matchID}`}</p>
                    <div>
                        <button
                            className="ui-button quiet"
                            onClick={() => shareDialog.current?.close()}
                        >
                            关闭
                        </button>
                        <button className="ui-button" onClick={() => void copyInvitation()}>
                            {copied ? '已复制' : '复制链接'}
                        </button>
                    </div>
                </dialog>
            )}
            <BoardView
                flipped={online?.playerID === '1' || computerSide === Side.Red}
                players={
                    online
                        ? {
                              [Side.Red]:
                                  matchData?.find((player) => player.id === 0)?.name ?? '等待加入',
                              [Side.Black]:
                                  matchData?.find((player) => player.id === 1)?.name ?? '等待加入',
                          }
                        : undefined
                }
                board={board}
                selected={editor ? (selected ?? picker) : selected}
                selectionStyle={editor ? 'frame' : 'ring'}
                destinations={destinations}
                forbiddenDestinations={forbiddenDestinations}
                unavailable={unavailablePieces}
                lastMove={editor ? null : displayed.lastMove}
                checkedIndex={
                    isCheck
                        ? board.findIndex(
                              (piece) => piece?.side === side && piece.kind === Kind.King,
                          )
                        : -1
                }
                defeatedIndex={
                    !editor && !reviewing && winner
                        ? board.findIndex(
                              (piece) => piece?.kind === Kind.King && piece.side !== winner,
                          )
                        : -1
                }
                disabled={
                    !editor &&
                    (reviewing || !!winner || !!(computerSide && computer.draw) || !canPlay)
                }
                animationState={displayed}
                animationStep={reviewing ? reviewStep! : totalSteps}
                animateMoves={!editor}
                onPick={pick}
                onCancel={() => {
                    setSelected(null);
                    setPicker(null);
                }}
            >
                {editor && picker !== null && (
                    <PiecePicker editor={editor} index={picker} onSelect={placeAt} />
                )}
            </BoardView>
            <footer className="game-footer">
                {!online && (
                    <div className={`status ${winner ?? side}`} role="status">
                        <i />
                        {status}
                        {computerSide && computer.error && !editor && !reviewing && (
                            <button className="ui-button" onClick={computer.retry}>
                                重试
                            </button>
                        )}
                    </div>
                )}
                {!editor && !reviewing && (
                    <p aria-live="polite">
                        {winner
                            ? online
                                ? '对局结束。'
                                : '对局结束，点击「新局」再来一盘。'
                            : piece
                              ? `${Piece.nameOf(piece.side, piece.kind)} · ${hints[piece.kind]}${forbiddenDestinations.length ? ' 红点为禁着：会使己方王受攻击或两王照面。' : ''}`
                              : '点选己方棋子，再点选落点。红方先行。'}
                    </p>
                )}
            </footer>
            {!editor && (recordVisible || online) && (
                <aside className="game-sidebar" aria-label="棋谱与对局操作">
                    {recordVisible && (
                        <RecordPanel
                            record={G.record}
                            step={reviewing ? reviewStep! : totalSteps}
                            onSelect={
                                !canReview
                                    ? undefined
                                    : (step) => {
                                          setReviewStep(step === totalSteps ? null : step);
                                          setSelected(null);
                                          setPicker(null);
                                      }
                            }
                        />
                    )}
                    {online && (
                        <OnlineControls
                            status={status}
                            waiting={waiting}
                            finished={!!ctx.gameover}
                            connected={!!isConnected}
                            canRequest={
                                !!isConnected &&
                                !!opponent?.isConnected &&
                                !ctx.gameover &&
                                !pendingDraw &&
                                !!takebackSteps(G, ctx.currentPlayer, online.playerID)
                            }
                            playerID={online.playerID}
                            pending={pendingTakeback}
                            drawOffer={pendingDraw}
                            canOfferDraw={
                                !!opponent?.isConnected &&
                                !G.drawUsed?.[online.playerID] &&
                                !ctx.gameover
                            }
                            onOfferDraw={() => moves.offerDraw()}
                            onRespondDraw={(id, accept) => moves.respondDraw(id, accept)}
                            onResign={() => moves.resign()}
                            steps={totalSteps}
                            now={now}
                            onRequest={() => moves.requestTakeback()}
                            onRespond={(id, accept) => moves.respondTakeback(id, accept)}
                            onInvite={share}
                            onExport={() => downloadRecord(G, ctx.currentPlayer)}
                            onLobby={() => onReturnLobby?.()}
                        />
                    )}
                </aside>
            )}
        </main>
    );
}

function LocalGame({ onOpenOnline }: { onOpenOnline: () => void }) {
    const [saved, setSaved] = useState(loadSession);
    const [computerSide, setComputerSide] = useState<Side | null>(saved?.computerSide ?? null);
    const modeDialog = useRef<HTMLDialogElement>(null);
    const [lastComputerSide, setLastComputerSide] = useState(saved?.computerSide ?? Side.Black);
    const [chosenSide, setChosenSide] = useState<Side | null>(lastComputerSide);
    const [replacingGame, setReplacingGame] = useState(false);

    function startMode(side: Side | null) {
        setComputerSide(side);
        if (side) setLastComputerSide(side);
        setPlayStart(true);
        setInitialReview(false);
        setPosition(new Board().data);
        modeDialog.current?.close();
    }
    const [initialReview, setInitialReview] = useState(false);
    const [position, setPosition] = useState<BoardData | null>(null);
    const [playStart, setPlayStart] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(saved?.soundEnabled ?? true);
    const [volume, setVolume] = useState(saved?.volume ?? 0.5);
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
                debug: import.meta.env.DEV ? { collapseOnLoad: true } : false,
            }),
        [position, saved],
    );

    return (
        <>
            <dialog
                ref={modeDialog}
                className="reset-dialog computer-dialog"
                aria-labelledby="computer-title"
            >
                <h2 id="computer-title">{chosenSide ? '人机对战' : '切换双人'}</h2>
                {chosenSide && (
                    <fieldset className="computer-side">
                        <legend>选择阵营</legend>
                        {([Side.Black, Side.Red] as const).map((side) => (
                            <label key={side}>
                                <input
                                    type="radio"
                                    name="computer-side"
                                    checked={chosenSide === side}
                                    onChange={() => setChosenSide(side)}
                                />
                                <span>{side === Side.Black ? '执红（先手）' : '执黑（后手）'}</span>
                            </label>
                        ))}
                    </fieldset>
                )}
                {replacingGame && <p>开始后将替换当前对局。</p>}
                <div>
                    <button className="ui-button quiet" onClick={() => modeDialog.current?.close()}>
                        取消
                    </button>
                    <button className="ui-button primary" onClick={() => startMode(chosenSide)}>
                        开始对弈
                    </button>
                </div>
            </dialog>
            <GameClient
                computerSide={computerSide}
                onComputerMode={(hasMoves) => {
                    setChosenSide(lastComputerSide);
                    setReplacingGame(hasMoves);
                    modeDialog.current?.showModal();
                }}
                onLocalMode={(hasMoves) => {
                    if (!hasMoves) {
                        startMode(null);
                        return;
                    }

                    setChosenSide(null);
                    setReplacingGame(true);
                    modeDialog.current?.showModal();
                }}
                onOpenOnline={onOpenOnline}
                initialReview={initialReview}
                onImportRecord={(record) => {
                    setComputerSide(null);
                    setPlayStart(false);
                    setInitialReview(true);
                    setPosition(null);
                    setRecordVisible(true);
                    setSaved({
                        ...record,
                        version: 1,
                        draft: null,
                        soundEnabled,
                        volume,
                        recordVisible: true,
                    });
                }}
                initialDraft={position ? null : (saved?.draft ?? null)}
                recordVisible={recordVisible}
                onRecordVisibleChange={setRecordVisible}
                playStart={playStart}
                onNewGame={() => {
                    setPlayStart(true);
                    setInitialReview(false);
                    setPosition(new Board().data);
                }}
                onApplyPosition={(board) => {
                    setPlayStart(false);
                    setInitialReview(false);
                    setPosition(board);
                }}
                volume={volume}
                onVolumeChange={setVolume}
                soundEnabled={soundEnabled}
                onSoundEnabledChange={setSoundEnabled}
            />
        </>
    );
}

function GameApp() {
    const [rooms] = useState(() => new Rooms());
    useEffect(() => {
        void rooms.ensureIdentity().catch((error) => console.warn('暂时无法登记联机身份', error));
    }, [rooms]);
    const [route, setRoute] = useState(() => new URLSearchParams(location.search).get('room'));
    const [online, setOnline] = useState<RoomSession | null>(null);
    const [autoInvite, setAutoInvite] = useState(false);
    const [archive, setArchive] = useState<ImportedRecord | null>(null);
    const [preferences] = useState(loadSession);
    const [soundEnabled, setSoundEnabled] = useState(preferences?.soundEnabled ?? true);
    const [volume, setVolume] = useState(preferences?.volume ?? 0.5);
    const [recordVisible, setRecordVisible] = useState(preferences?.recordVisible ?? true);

    const navigate = useCallback((room: string | null) => {
        const url = new URL(location.href);
        if (room === null) url.searchParams.delete('room');
        else url.searchParams.set('room', room);
        history.pushState(null, '', url);
        setOnline(null);
        setArchive(null);
        setRoute(room);
    }, []);
    const enter = useCallback((session: RoomSession, created = false) => {
        const url = new URL(location.href);
        url.searchParams.set('room', session.matchID);
        history.replaceState(null, '', url);
        setRoute(session.matchID);
        setAutoInvite(created);
        setOnline(session);
    }, []);
    const back = useCallback(() => navigate(null), [navigate]);
    const returnToLobby = useCallback(() => navigate(''), [navigate]);
    const OnlineClient = useMemo(
        () =>
            Client<GameState, GameBoardProps>({
                game: onlineGameConfig,
                board: GameBoard,
                multiplayer: SocketIO({ server: rooms.server }),
                numPlayers: 2,
                debug: false,
                loading: () => <ConnectionPending onBack={back} />,
            }),
        [rooms, back],
    );

    useEffect(() => {
        const update = () => {
            setOnline(null);
            setArchive(null);
            setRoute(new URLSearchParams(location.search).get('room'));
        };
        window.addEventListener('popstate', update);
        return () => window.removeEventListener('popstate', update);
    }, []);

    const ArchiveClient = useMemo(
        () =>
            archive
                ? Client<GameState, GameBoardProps>({
                      game: gameFromSession(archive.game, archive.currentPlayer),
                      board: GameBoard,
                      numPlayers: 2,
                      debug: false,
                  })
                : null,
        [archive],
    );

    if (ArchiveClient)
        return (
            <ArchiveClient
                archive
                initialReview
                initialDraft={null}
                onOpenOnline={() => navigate('')}
                onReturnLobby={() => navigate('')}
                onApplyPosition={() => {}}
                recordVisible={recordVisible}
                onRecordVisibleChange={setRecordVisible}
                soundEnabled={soundEnabled}
                onSoundEnabledChange={setSoundEnabled}
                volume={volume}
                onVolumeChange={setVolume}
            />
        );

    if (online)
        return (
            <OnlineClient
                key={`${online.matchID}:${online.playerID}`}
                matchID={online.matchID}
                playerID={online.playerID}
                credentials={online.credentials}
                online={online}
                autoInvite={autoInvite}
                initialDraft={null}
                onOpenOnline={returnToLobby}
                onReturnLobby={returnToLobby}
                onApplyPosition={() => {}}
                recordVisible={true}
                onRecordVisibleChange={setRecordVisible}
                soundEnabled={soundEnabled}
                onSoundEnabledChange={setSoundEnabled}
                volume={volume}
                onVolumeChange={setVolume}
            />
        );

    if (route !== null)
        return (
            <RoomPage
                key={route}
                rooms={rooms}
                matchID={route}
                onEnter={enter}
                onReview={(record) => {
                    setRecordVisible(true);
                    setArchive(record);
                }}
                onFind={navigate}
                onBack={back}
            />
        );

    return <LocalGame onOpenOnline={() => navigate('')} />;
}

export default function App() {
    return (
        <SkinProvider>
            <GameApp />
            <UpdateNotice />
        </SkinProvider>
    );
}
