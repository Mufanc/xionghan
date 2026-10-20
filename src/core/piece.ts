export enum Side {
    Red = 'RED',
    Black = 'BLACK',
}

export namespace Side {
    export function opposite(side: Side): Side {
        return side === Side.Red ? Side.Black : Side.Red;
    }
}

export enum Kind {
    King = 'KING',
    Advisor = 'ADVISOR',
    Elephant = 'ELEPHANT',
    Horse = 'HORSE',
    Chariot = 'CHARIOT',
    Cannon = 'CANNON',
    Pawn = 'PAWN',
    Train = 'TRAIN',
    Guard = 'GUARD',
    Catapult = 'CATAPULT',
}

export interface Piece {
    readonly side: Side;
    readonly kind: Kind;
}

export namespace Piece {
    const names: Record<Side, Record<Kind, string>> = {
        [Side.Red]: {
            [Kind.King]: '皇',
            [Kind.Advisor]: '仕',
            [Kind.Elephant]: '相',
            [Kind.Horse]: '馬',
            [Kind.Chariot]: '車',
            [Kind.Cannon]: '炮',
            [Kind.Pawn]: '兵',
            [Kind.Train]: '銳',
            [Kind.Guard]: '衛',
            [Kind.Catapult]: '檑',
        },
        [Side.Black]: {
            [Kind.King]: '單',
            [Kind.Advisor]: '氏',
            [Kind.Elephant]: '都',
            [Kind.Horse]: '馬',
            [Kind.Chariot]: '車',
            [Kind.Cannon]: '砲',
            [Kind.Pawn]: '卒',
            [Kind.Train]: '鋒',
            [Kind.Guard]: '尉',
            [Kind.Catapult]: '礌',
        },
    };

    export function nameOf(side: Side, kind: Kind): string {
        return names[side][kind];
    }
}
