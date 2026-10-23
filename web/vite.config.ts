import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            injectRegister: false,
            registerType: 'prompt',
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
                globPatterns: ['**/*.{html,js,css,png,svg,ttf,ogg,wasm}'],
                navigateFallbackDenylist: [/\?[^#]*__recover=/, /&__recover=/],
                // 仅在用户点击更新后激活新版，避免自动刷新正在进行的对局。
                skipWaiting: false,
                clientsClaim: false,
            },
        }),
    ],
    server: {
        proxy: {
            // 保留网页 Host，让远程访问通过服务端的同源检查。
            '/games': { target: 'http://127.0.0.1:8000', changeOrigin: false },
            '/socket.io': { target: 'http://127.0.0.1:8000', ws: true },
        },
    },
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
});
