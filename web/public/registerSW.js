(() => {
    const recoveryKey = 'xionghan-startup-recovery';
    const recoveryParam = '__recover';
    let recovering = false;

    function showRetry() {
        const root = document.getElementById('root');

        if (!root || root.childNodes.length) return;

        const button = document.createElement('button');
        button.textContent = '加载未完成，点击重试';
        button.style.cssText = 'display:block;margin:20vh auto;padding:12px 20px;font:inherit';
        button.onclick = () => {
            sessionStorage.removeItem(recoveryKey);
            location.reload();
        };
        root.append(button);
    }

    async function recover() {
        if (recovering) return;

        recovering = true;

        if (!navigator.onLine || sessionStorage.getItem(recoveryKey)) {
            showRetry();
            return;
        }

        sessionStorage.setItem(recoveryKey, '1');

        try {
            // 只在资源加载失败时激活更新，正常对局仍由用户确认更新。
            const registration = await navigator.serviceWorker?.getRegistration();

            if (registration) {
                await Promise.race([
                    registration.update(),
                    new Promise((resolve) => setTimeout(resolve, 3000)),
                ]);

                const worker = registration.waiting || registration.installing;

                if (worker) {
                    await new Promise((resolve) => {
                        const timer = setTimeout(resolve, 3000);
                        worker.addEventListener('statechange', () => {
                            if (worker.state === 'installed') {
                                worker.postMessage({ type: 'SKIP_WAITING' });
                            }

                            if (worker.state === 'activated' || worker.state === 'redundant') {
                                clearTimeout(timer);
                                resolve();
                            }
                        });
                        worker.postMessage({ type: 'SKIP_WAITING' });
                    });
                }
            }
        } catch {
            // 更新失败仍尝试一次网络入口，保留所有本地棋局和身份。
        }

        const url = new URL(location.href);
        url.searchParams.set(recoveryParam, Date.now().toString());
        location.replace(url.href);
    }

    window.addEventListener(
        'error',
        (event) => {
            if (
                event.target instanceof HTMLScriptElement ||
                event.target instanceof HTMLLinkElement
            ) {
                void recover();
            }
        },
        true,
    );
    window.addEventListener('vite:preloadError', (event) => {
        event.preventDefault();
        void recover();
    });
    window.addEventListener('load', () => {
        const root = document.getElementById('root');

        // 兼容旧 HTML：它的主脚本可能在本文件加载前已经失败。
        setTimeout(() => {
            if (recovering) showRetry();

            if (root && !root.childNodes.length && !root.dataset.started) {
                void recover();
            } else if (!recovering && root?.childNodes.length) {
                sessionStorage.removeItem(recoveryKey);
            }
        }, 1500);
    });

    const url = new URL(location.href);

    if (url.searchParams.has(recoveryParam)) {
        url.searchParams.delete(recoveryParam);
        history.replaceState(history.state, '', url);
    }
})();
