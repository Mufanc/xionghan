import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OnlineControls } from './OnlineControls';

const props = {
    status: '轮到你',
    waiting: false,
    finished: false,
    connected: true,
    canRequest: true,
    playerID: '0',
    pending: null,
    steps: 4,
    now: 1000,
    onRequest() {},
    onRespond() {},
    onInvite() {},
    onExport() {},
    onLobby() {},
};

it('keeps one title and two buttons when a request arrives', () => {
    const normal = renderToStaticMarkup(<OnlineControls {...props} />);
    const incoming = renderToStaticMarkup(
        <OnlineControls
            {...props}
            pending={{ id: 1, playerID: '1', targetStep: 2, expiresAt: 9000 }}
        />,
    );
    for (const html of [normal, incoming]) {
        expect(html).toContain('class="online-controls"');
        expect(html.match(/<h2/g)).toHaveLength(1);
        expect(html).not.toContain('class="online-message"');
        expect(html.match(/<button/g)).toHaveLength(2);
    }
    expect(normal).toContain('悔棋');
    expect(incoming).toContain('对方申请悔棋');
    expect(incoming).toContain('拒绝（8s）');
    expect(incoming).not.toContain('撤回');
    expect(incoming.indexOf('同意')).toBeLessThan(incoming.indexOf('拒绝'));
    expect(incoming).toContain('同意');
    expect(incoming).toContain('拒绝');
});

it('shows waiting, invitation and completed-game actions in the same region', () => {
    const own = renderToStaticMarkup(
        <OnlineControls
            {...props}
            pending={{ id: 1, playerID: '0', targetStep: 3, expiresAt: 9000 }}
        />,
    );
    expect(own).toContain('等待回应');
    expect(own).toContain('disabled=""');
    expect(own).not.toContain('>同意<');
    expect(renderToStaticMarkup(<OnlineControls {...props} waiting />)).toContain('邀请朋友');
    expect(renderToStaticMarkup(<OnlineControls {...props} finished />)).toContain('导出棋谱');
});
