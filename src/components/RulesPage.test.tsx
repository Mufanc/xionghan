import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RulesPage } from '@/components/RulesPage';

it('renders the wiki tables, all illustrations, and working contents anchors', () => {
    const html = renderToStaticMarkup(<RulesPage />);
    expect(html).toContain('匈汉象棋规则');
    expect(html).toContain('连续 50 回合');
    expect(html.match(/<table>/g)).toHaveLength(4);
    expect(html.match(/<img /g)).toHaveLength(7);
    expect(html).not.toContain('src="images/');
    for (const [, id] of html.matchAll(/href="#(rule-\d+)"/g)) {
        expect(html).toContain(`id="${id}"`);
    }
    expect(html.match(/<h1 /g)).toHaveLength(1);
    expect(html.match(/<h2 /g)).toHaveLength(5);
});
