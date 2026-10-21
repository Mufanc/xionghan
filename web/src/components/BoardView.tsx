import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Board, type BoardData, type Index } from '@xionghan/core/board';
import { Side, Piece } from '@xionghan/core/piece';
import { BoardArt } from '@/components/BoardArt';
import { PieceArt } from '@/components/PieceArt';
import { PositionMark } from '@/components/PositionMark';
import { useMoveAnimation, type MoveAnimationState } from '@/hooks/use-move-animation';

interface BoardViewProps {
    flipped?: boolean;
    players?: Partial<Record<Side, string>>;
    board: BoardData;
    selected: Index | null;
    selectionStyle: 'ring' | 'frame';
    destinations: Index[];
    forbiddenDestinations: Index[];
    unavailable: Index[];
    lastMove: MoveAnimationState['lastMove'];
    checkedIndex: Index;
    defeatedIndex: Index;
    disabled: boolean;
    animationState: MoveAnimationState;
    animateMoves: boolean;
    animationStep?: number;
    onPick: (index: Index) => void;
    onCancel: () => void;
    children?: ReactNode;
}

export function BoardView({
    flipped = false,
    players,
    board,
    selected,
    selectionStyle,
    destinations,
    forbiddenDestinations,
    unavailable,
    lastMove,
    checkedIndex,
    defeatedIndex,
    disabled,
    animationState,
    animateMoves,
    animationStep,
    onPick,
    onCancel,
    children,
}: BoardViewProps) {
    const [cursor, setCursor] = useState<Index>(flipped ? 19 : 149);
    const { boardRef, captured, clearCapture } = useMoveAnimation(
        animationState,
        animateMoves,
        animationStep,
    );
    const sideName = (side: Side) => (side === Side.Red ? '红方' : '黑方');

    function navigate(event: KeyboardEvent<HTMLButtonElement>, index: Index) {
        const { x, y } = Board.coordinatesOf(flipped ? 168 - index : index);

        const offsets: Record<string, number> = {
            ArrowLeft: x > 0 ? -1 : 0,
            ArrowRight: x < 12 ? 1 : 0,
            ArrowUp: y > 0 ? -Board.SIZE : 0,
            ArrowDown: y < 12 ? Board.SIZE : 0,
        };

        if (event.key === 'Escape') {
            onCancel();
        }

        if (!(event.key in offsets)) return;

        event.preventDefault();

        const next = index + offsets[event.key] * (flipped ? -1 : 1);

        setCursor(next);
        boardRef.current?.querySelector<HTMLElement>(`#point-${next}`)?.focus();
    }

    const topSide = flipped ? Side.Red : Side.Black;
    const bottomSide = Side.opposite(topSide);

    return (
        <section className="play-area" aria-label="匈汉象棋对局">
            <div className="player-bar">
                <span className={`player ${topSide}`}>
                    <i />
                    {sideName(topSide)}
                    {players?.[topSide] ? ` · ${players[topSide]}` : ''}
                </span>
                <span>{topSide === Side.Black ? '單 · 氏 · 都' : '皇 · 仕 · 相'}</span>
            </div>
            <div
                ref={boardRef}
                className="board"
                role="group"
                aria-label="13乘13棋盘，方向键移动焦点，回车选子或落子，Escape取消选择"
            >
                <BoardArt flipped={flipped} />
                {board.map((occupant, index) => {
                    const { x, y } = Board.coordinatesOf(index);
                    const possible = destinations.includes(index);
                    const forbidden = forbiddenDestinations.includes(index);
                    const lastFrom = lastMove?.from === index;
                    const lastTo = lastMove?.to === index;
                    const isKingInCheck = index === checkedIndex;
                    const isDefeatedKing = index === defeatedIndex;
                    const blocked = unavailable.includes(index);
                    const active = selected === index;
                    const label = `${'ABCDEFGHIJKLM'[x]}${y + 1}${occupant ? ` ${sideName(occupant.side)}${Piece.nameOf(occupant.side, occupant.kind)}` : ' 空位'}`;

                    return (
                        <button
                            key={index}
                            id={`point-${index}`}
                            style={{
                                gridRow: (flipped ? 12 - y : y) + 1,
                                gridColumn: (flipped ? 12 - x : x) + 1,
                            }}
                            className={`point${active && selectionStyle === 'ring' ? ' selected' : ''}${possible ? ' possible' : ''}${isKingInCheck ? ' checked' : ''}${isDefeatedKing ? ' defeated' : ''}${blocked ? ' unavailable' : ''}`}
                            tabIndex={cursor === index ? 0 : -1}
                            aria-label={`${label}${possible ? '，可落子' : ''}${forbidden ? '，禁着：会使己方王受攻击或两王照面' : ''}${lastFrom ? '，上一步起点' : ''}${lastTo ? '，上一步落点' : ''}`}
                            aria-pressed={active}
                            aria-disabled={disabled || blocked}
                            disabled={disabled}
                            onClick={() => onPick(index)}
                            onFocus={() => setCursor(index)}
                            onKeyDown={(event) => navigate(event, index)}
                        >
                            {occupant && (
                                <span className={`piece ${occupant.side}`}>
                                    <PieceArt piece={occupant} />
                                </span>
                            )}
                            {animateMoves && captured?.index === index && (
                                <span
                                    className={`piece captured-piece ${captured.piece.side}`}
                                    aria-hidden="true"
                                    onAnimationEnd={clearCapture}
                                >
                                    <PieceArt piece={captured.piece} />
                                </span>
                            )}
                            {lastFrom && <span className="last-from-mark" aria-hidden="true" />}
                            {(lastTo || (selectionStyle === 'frame' && active)) && <PositionMark />}
                            {forbidden && (
                                <span className="move-mark forbidden-mark" aria-hidden="true" />
                            )}
                            {possible && (
                                <span className={occupant ? 'capture-mark' : 'move-mark'} />
                            )}
                        </button>
                    );
                })}
                {children}
            </div>
            <div className="player-bar">
                <span className={`player ${bottomSide}`}>
                    <i />
                    {sideName(bottomSide)}
                    {players?.[bottomSide] ? ` · ${players[bottomSide]}` : ''}
                </span>
                <span>{bottomSide === Side.Red ? '皇 · 仕 · 相' : '單 · 氏 · 都'}</span>
            </div>
        </section>
    );
}
