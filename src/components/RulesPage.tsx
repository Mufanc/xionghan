import { Marked, Renderer } from 'marked';
import rules from '../../wiki/rules.md?raw';
import './rules-page.css';

const images = import.meta.glob<string>('../../wiki/images/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
});
const sections: { id: string; title: string; depth: number }[] = [];
const renderer = new Renderer();
const renderTable = renderer.table;

renderer.heading = function ({ tokens, depth, text }) {
    const id = `rule-${sections.length}`;
    sections.push({ id, title: text, depth });

    return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>`;
};
renderer.table = function (token) {
    return `<div class="rules-table" tabindex="0" role="region" aria-label="规则表格">${renderTable.call(this, token)}</div>`;
};

// 内容仅来自仓库内审核过的 wiki，不接收用户输入或远端 Markdown。
const html = new Marked({
    renderer,
    walkTokens(token) {
        if (token.type !== 'image') return;

        const url = images[`../../wiki/${token.href}`];

        if (!url) throw new Error(`Missing rule illustration: ${token.href}`);

        token.href = url;
    },
}).parse(rules, { async: false });

export function RulesPage() {
    return (
        <main className="rules-page">
            <header className="rules-header">
                <a className="rules-brand" href="./">
                    <span className="seal" aria-hidden="true">
                        弈
                    </span>
                    匈汉象棋
                </a>
                <a className="ui-button" href="./">
                    进入棋盘
                </a>
            </header>
            <div className="rules-layout">
                <nav className="rules-contents" aria-label="规则目录">
                    <strong>目录</strong>
                    {sections
                        .filter(({ depth }) => depth > 1)
                        .map(({ id, title, depth }) => (
                            <a
                                key={id}
                                href={`#${id}`}
                                className={depth === 3 ? 'subsection' : undefined}
                            >
                                {title}
                            </a>
                        ))}
                </nav>
                <article className="rules-content" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
        </main>
    );
}
