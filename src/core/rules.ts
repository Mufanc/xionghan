import { Board, type Index } from '@/core/board';
import { Kind, Side } from '@/core/piece';

export class Rules {
    constructor(private readonly board: Board) {}

    private static onStar(x: number, y: number) {
        return (x + y) % 6 === 0 && (x - y) % 6 === 0;
    }

    private blockers(from: Index, to: Index): number {
        const a = Board.coordinatesOf(from);
        const b = Board.coordinatesOf(to);
        const dx = Math.sign(b.x - a.x);
        const dy = Math.sign(b.y - a.y);
        const distance = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        let count = 0;

        for (let step = 1; step < distance; step++) {
            if (this.board.at(Board.indexOf(a.x + dx * step, a.y + dy * step))) count++;
        }

        return count;
    }

    // 只检查走法、阻挡和吃子条件，王的安全由合法走法校验处理，避免与 isCheck 循环调用。
    private candidateMoves(from: Index, targetIndex?: Index): Index[] {
        const piece = this.board.at(from);

        if (!piece) return [];

        const a = Board.coordinatesOf(from);
        const direction = piece.side === Side.Red ? -1 : 1;
        // 将双方纵坐标统一成从己方底线向前计数，宫界、长城和过城条件共用同一套判断。
        const homeY = (y: number) => (piece.side === Side.Red ? 12 - y : y);
        const moves: Index[] = [];
        const start = targetIndex ?? 0;
        const end = targetIndex === undefined ? Board.SIZE * Board.SIZE : targetIndex + 1;

        for (let to = start; to < end; to++) {
            const target = this.board.at(to);

            if (to === from || target?.side === piece.side) continue;

            const b = Board.coordinatesOf(to);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);
            const straight = dx === 0 || dy === 0;
            const diagonal = ax === ay;
            let allowed = false;

            switch (piece.kind) {
                case Kind.King:
                    allowed =
                        ax + ay === 1 && b.x >= 5 && b.x <= 7 && homeY(b.y) >= 1 && homeY(b.y) <= 3;

                    // 将两王无遮挡照面计为攻击，移开中间棋子的走法因此会被安全检查排除。
                    if (target?.kind === Kind.King && dx === 0 && this.blockers(from, to) === 0)
                        allowed = true;
                    break;
                case Kind.Advisor:
                    allowed =
                        ax === 1 &&
                        ay === 1 &&
                        b.x >= 5 &&
                        b.x <= 7 &&
                        homeY(b.y) >= 1 &&
                        homeY(b.y) <= 3;
                    break;
                case Kind.Elephant:
                    allowed =
                        ax === 2 &&
                        ay === 2 &&
                        homeY(b.y) <= 5 &&
                        !this.board.at(Board.indexOf(a.x + dx / 2, a.y + dy / 2));
                    break;
                case Kind.Horse:
                    // 日字和直三的横纵距离之和都为 3，但两者的阻挡位置不同。
                    if (ax + ay !== 3) break;

                    if (straight) {
                        allowed = this.blockers(from, to) === 0;
                    } else {
                        // 日字只检查沿“两格方向”紧邻起点的马腿，不检查斜向中间点。
                        allowed = !this.board.at(
                            Board.indexOf(
                                a.x + (ax === 2 ? Math.sign(dx) : 0),
                                a.y + (ay === 2 ? Math.sign(dy) : 0),
                            ),
                        );
                    }
                    break;
                case Kind.Chariot:
                    allowed = straight && this.blockers(from, to) === 0;
                    break;
                case Kind.Cannon:
                    // 空位落点不能隔子；吃子落点必须恰好隔一枚炮架，炮架不分阵营。
                    allowed = straight && this.blockers(from, to) === (target ? 1 : 0);
                    break;
                case Kind.Pawn:
                    // 长城线为 6，停在长城仍算未过城；进入对方本阵后才能横走。
                    if (homeY(a.y) >= 7) {
                        allowed = (dy === direction && dx === 0) || (dy === 0 && ax === 1);
                    } else {
                        // 未过城可多格前进至对方本阵第一线，但吃子仍只限正前方一格。
                        allowed =
                            dx === 0 &&
                            dy * direction > 0 &&
                            homeY(b.y) <= 7 &&
                            (!target || ay === 1) &&
                            this.blockers(from, to) === 0;
                    }
                    break;
                case Kind.Train: {
                    // 按移动方向检查所在斜轨，避免起终点分别落在不同轨上却跨轨移动。
                    if (!diagonal || (dx === dy ? a.x - a.y : a.x + a.y) % 6 !== 0) break;
                    // 只有从星点出发才能吃子，离开星点后只能走向空位。
                    if (this.blockers(from, to) !== 0 || (target && !Rules.onStar(a.x, a.y))) break;

                    allowed = true;

                    for (let step = 1; step < ax; step++) {
                        // 可以停在下一处星点，但不能让星点处于本次移动的中途。
                        if (Rules.onStar(a.x + Math.sign(dx) * step, a.y + Math.sign(dy) * step))
                            allowed = false;
                    }
                    break;
                }
                case Kind.Guard:
                    // 空心点相距两格；可跨多个空点移动，但只能吃相邻空心点上的敌子。
                    allowed =
                        dy === 0 &&
                        ax % 2 === 0 &&
                        (!target || ax === 2) &&
                        this.blockers(from, to) === 0;
                    break;
                case Kind.Catapult: {
                    if ((!straight && !diagonal) || this.blockers(from, to) !== 0) break;

                    allowed = !target;

                    // 檑可远行，但吃子仅限周围八点，且目标不能受到邻子保护。
                    if (target && Math.max(ax, ay) === 1) {
                        allowed = ![
                            [1, 0],
                            [-1, 0],
                            [0, 1],
                            [0, -1],
                        ].some(([sx, sy]) => {
                            const x = b.x + sx;
                            const y = b.y + sy;

                            // 保护子须与目标正交紧邻、位于檑周围八点内；不分阵营，也不计檑本身。
                            return (
                                x >= 0 &&
                                x < Board.SIZE &&
                                y >= 0 &&
                                y < Board.SIZE &&
                                Math.max(Math.abs(x - a.x), Math.abs(y - a.y)) === 1 &&
                                !!this.board.at(Board.indexOf(x, y))
                            );
                        });
                    }
                    break;
                }
            }

            if (allowed) moves.push(to);
        }

        return moves;
    }

    isCheck(side: Side): boolean {
        const king = this.board.data.findIndex(
            (piece) => piece?.side === side && piece.kind === Kind.King,
        );

        if (king < 0) return true;

        return this.board.data.some(
            (piece, from) =>
                piece?.side === Side.opposite(side) && this.candidateMoves(from, king).length > 0,
        );
    }

    private keepsKingSafe(from: Index, to: Index, side: Side): boolean {
        const next = new Board(this.board.data.slice());

        next.move(from, to);

        return !new Rules(next).isCheck(side);
    }

    isLegalMove(from: Index, to: Index): boolean {
        const piece = this.board.at(from);

        return (
            !!piece &&
            Number.isInteger(to) &&
            to >= 0 &&
            to < Board.SIZE ** 2 &&
            this.candidateMoves(from, to).length > 0 &&
            this.keepsKingSafe(from, to, piece.side)
        );
    }

    findLegalMoves(from: Index): Index[] {
        const piece = this.board.at(from);

        if (!piece) return [];

        return this.candidateMoves(from).filter((to) => this.keepsKingSafe(from, to, piece.side));
    }

    findForbiddenMoves(from: Index): Index[] {
        const legal = this.findLegalMoves(from);

        return this.candidateMoves(from).filter((to) => !legal.includes(to));
    }

    hasLegalMove(side: Side): boolean {
        return this.board.data.some(
            (piece, from) =>
                piece?.side === side &&
                this.candidateMoves(from).some((to) => this.keepsKingSafe(from, to, side)),
        );
    }
}
