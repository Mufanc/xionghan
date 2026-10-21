import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './update-notice.css';

export function UpdateNotice() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
    const accepted = useRef(false);
    const activated = useRef(false);
    const {
        needRefresh: [available, setAvailable],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(_url, worker) {
            setRegistration(worker);
        },
        onNeedReload() {
            activated.current = true;

            // 其他标签页激活新版时，本页仍需用户同意才刷新。
            if (accepted.current) location.reload();
            else setAvailable(true);
        },
        onRegisterError(error) {
            console.warn('无法注册离线缓存', error);
        },
    });

    useEffect(() => {
        if (!registration) return;

        const check = () => {
            if (document.visibilityState !== 'visible' || !navigator.onLine) return;
            if (registration.waiting || activated.current) setAvailable(true);
            if (!registration.installing) void registration.update().catch(() => {});
        };
        const interval = window.setInterval(check, 60 * 60 * 1000);

        document.addEventListener('visibilitychange', check);
        window.addEventListener('online', check);

        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('online', check);
        };
    }, [registration, setAvailable]);

    async function update() {
        setBusy(true);
        setError('');
        accepted.current = true;

        try {
            if (activated.current) location.reload();
            else await updateServiceWorker();
        } catch {
            accepted.current = false;
            setBusy(false);
            setError('更新未完成，请重试。');
        }
    }

    if (!available) return null;

    return (
        <aside className="update-notice" role="status" aria-live="polite">
            <span>{error || (busy ? '正在更新…' : '发现新版本')}</span>
            <div>
                <button
                    className="ui-button quiet"
                    disabled={busy}
                    onClick={() => setAvailable(false)}
                >
                    稍后
                </button>
                <button className="ui-button primary" disabled={busy} onClick={() => void update()}>
                    更新
                </button>
            </div>
        </aside>
    );
}
