import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GameActions, type GameAction } from './GameActions';

const actions: GameAction[] = [
    { id: 'clear', label: '清空', placement: 'toolbar', onClick() {} },
    { id: 'new', label: '新局', placement: 'menu', disabled: true, onClick() {} },
    { id: 'hidden', label: '隐藏操作', placement: 'hidden', onClick() {} },
    { id: 'record', label: '棋谱', placement: 'toolbar', pressed: true, onClick() {} },
];

it('renders each action only in its assigned region with accessible state', () => {
    const toolbar = renderToStaticMarkup(<GameActions actions={actions} placement="toolbar" />);
    const menu = renderToStaticMarkup(<GameActions actions={actions} placement="menu" />);
    expect(toolbar).toContain('清空');
    expect(toolbar).toContain('aria-pressed="true"');
    expect(toolbar).not.toContain('新局');
    expect(menu).toContain('新局');
    expect(menu).toContain('disabled=""');
    expect(menu).toContain('menu-group');
    expect(menu).not.toContain('清空');
    expect(toolbar + menu).not.toContain('隐藏操作');
});

it('omits an empty menu group and moves actions when their placement changes', () => {
    const moved = actions.map((action): GameAction => ({ ...action, placement: 'toolbar' }));
    expect(renderToStaticMarkup(<GameActions actions={moved} placement="menu" />)).toBe('');
    expect(renderToStaticMarkup(<GameActions actions={moved} placement="toolbar" />)).toContain(
        '新局',
    );
});

it('closes the menu before invoking the business action', () => {
    const calls: string[] = [];
    const rendered = GameActions({
        placement: 'menu',
        actions: [
            { id: 'edit', label: '摆子', placement: 'menu', onClick: () => calls.push('edit') },
        ],
        onBeforeAction: () => calls.push('close'),
    });
    if (!rendered || Array.isArray(rendered)) throw new Error('Expected menu group');
    rendered.props.children[0].props.onClick();
    expect(calls).toEqual(['close', 'edit']);
});

it('groups adjacent toolbar actions after filtering hidden actions', () => {
    const grouped: GameAction[] = [
        { ...actions[0], group: 'tools' },
        { ...actions[2], group: 'other' },
        { ...actions[3], group: 'tools' },
        { ...actions[1], placement: 'toolbar', group: 'confirm' },
    ];
    const html = renderToStaticMarkup(<GameActions actions={grouped} placement="toolbar" />);
    expect(html.match(/class="action-group"/g)).toHaveLength(2);
    expect(html).not.toContain('隐藏操作');
    expect(html.indexOf('清空')).toBeLessThan(html.indexOf('棋谱'));
    expect(html.indexOf('棋谱')).toBeLessThan(html.indexOf('新局'));
});
