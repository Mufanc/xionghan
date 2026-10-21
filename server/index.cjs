const { Server } = require('boardgame.io/server');
const { gameConfig } = require('@xionghan/core/boardgame');

const port = Number(process.env.PORT ?? 8000);
const origins = (process.env.WEB_ORIGINS ?? 'http://127.0.0.1:5173').split(',');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
}

// shortcut: 对局只保存在内存中，正式部署前接入持久化存储。
const server = Server({ games: [gameConfig], origins });

server.run(port).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
