import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardView } from '@/components/BoardView';
import { Board } from '@xionghan/core/board';

const board = new Board().data;
const props = {
    board,
    selected: 106,
    selectionStyle: 'ring' as const,
    destinations: [67],
    forbiddenDestinations: [80],
    unavailable: [108],
    lastMove: { from: 54, to: 67 },
    checkedIndex: 149,
    defeatedIndex: -1,
    disabled: false,
    animationState: { board, lastMove: null },
    animateMoves: false,
    onPick: () => {},
    onCancel: () => {},
};

describe('BoardView without a game client', () => {
    it('renders the supplied position and markers', () => {
        const html = renderToStaticMarkup(<BoardView {...props} />);
        expect(html.match(/id="point-/g)).toHaveLength(169);
        expect(html).toContain('point selected');
        expect(html).toContain('point checked');
        expect(html).toContain('point unavailable');
        expect(html).toContain('last-from-mark');
        expect(html).toContain('forbidden-mark');
        expect(html).toContain('position-mark');
    });

    it('supports setup framing, overlays and read-only display through props', () => {
        const html = renderToStaticMarkup(
            <BoardView {...props} selectionStyle="frame" disabled>
                <div>棋盒</div>
            </BoardView>,
        );
        expect(html).not.toContain('point selected');
        expect(html.match(/class="position-mark"/g)).toHaveLength(2);
        expect(html.match(/disabled=""/g)).toHaveLength(169);
        expect(html).toContain('棋盒');
    });
});
