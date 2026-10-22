import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RecordPanel } from './RecordPanel';
import { GameRecord } from '@xionghan/core/record';
import { Game } from '@xionghan/core/game';
import { Side } from '@xionghan/core/piece';

const record = GameRecord.create(Game.initialState()).data;
record.moves.push({ from: 106, to: 67, side: Side.Red, name: '兵C进3' });

it('renders a read-only live record without dimming or enabling history navigation', () => {
    const html = renderToStaticMarkup(<RecordPanel record={record} step={1} />);
    expect(html).toContain('兵C进3');
    expect(html).toContain('aria-current="step"');
    expect(html.match(/disabled=""/g)).toHaveLength(5);
    expect(html).not.toContain('回到对局');
});

it('keeps history navigation available for local games', () => {
    const html = renderToStaticMarkup(<RecordPanel record={record} step={0} onSelect={() => {}} />);
    expect(html).not.toContain('回到对局');
    expect(html).toContain('aria-label="最新局面"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
});
