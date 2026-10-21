import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/style.css';

const showingRules = new URLSearchParams(location.search).get('page') === 'rules';

const Page = React.lazy(() =>
    showingRules
        ? import('@/components/RulesPage').then(({ RulesPage }) => ({ default: RulesPage }))
        : import('@/App'),
);

if (showingRules) document.title = '匈汉象棋规则';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <React.Suspense fallback={null}>
            <Page />
        </React.Suspense>
    </React.StrictMode>,
);
