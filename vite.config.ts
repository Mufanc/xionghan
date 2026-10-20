import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            injectRegister: 'script-defer',
            manifest: {
                name: '匈汉象棋',
                short_name: '匈汉象棋',
                description: '十三路棋盘，同屏双人对弈与摆子。',
                lang: 'zh-CN',
                id: './',
                start_url: './',
                scope: './',
                display: 'standalone',
                theme_color: '#eeeae2',
                background_color: '#eeeae2',
                icons: [
                    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: 'icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{html,js,css,png,ttf,ogg}'],
                // 等旧页面全部关闭后更新，避免中断尚未保存的对局。
                skipWaiting: false,
                clientsClaim: false,
            },
        }),
    ],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
});
