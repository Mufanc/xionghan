# 匈汉象棋信令服务

独立运行官方 [PeerServer](https://github.com/peers/peerjs-server)，只交换 WebRTC 信令，不保存棋局或转发对弈数据。与根目录前端分别安装依赖，不改变前端包结构。目录内的 pnpm 配置仅用于将依赖平铺，保证 ZIP 包可独立部署。

## 本地运行

```sh
pnpm --dir server install --frozen-lockfile
pnpm --dir server start
```

监听 `0.0.0.0:9000`，路径 `/peerjs`，连接 key 为默认的 `peerjs`；禁用在线 Peer 列表查询，最多接入 100 个信令连接。`proxied` 用于 FC 的反向代理。

## 阿里云 FC

先在项目根目录生成包含生产依赖的部署包：

```sh
pnpm --dir server install --prod --frozen-lockfile
pnpm --dir server test
pnpm --dir server package
```

上传 `server/dist/peer-server.zip`，压缩包根目录直接包含 `package.json` 和 `node_modules`。

| 配置         | 值                                                 |
| ------------ | -------------------------------------------------- |
| 函数类型     | Web 函数                                           |
| 名称         | `xionghan-peer`                                    |
| 运行环境     | 自定义运行时 → Node.js 22 / Debian 11              |
| 启动命令     | `npm start`                                        |
| 监听端口     | `9000`                                             |
| 最小实例数   | `0`                                                |
| 最大实例数   | `1`，在弹性管理中设置                              |
| 单实例并发度 | `100`                                              |
| 执行超时     | `3600` 秒；信令连接超时后客户端需重连              |
| HTTP 入口    | HTTPS，允许 GET 与 WebSocket Upgrade，供浏览器连接 |

先设置最大实例数，再连接客户端。PeerServer 的在线连接保存在进程内存中，多实例之间不共享；缩容、重启会丢失信令连接，客户端需重新注册。最小实例数为 0 时首次请求可能冷启动。WebSocket 存续期间会占用资源，另有公网流量费用。

部署后访问 `https://你的函数域名/peerjs` 应返回服务信息，`/peerjs/peerjs/id` 应返回新 Peer ID。

前端后续接入 PeerJS 时使用：

```js
new Peer({
    host: '你的函数域名',
    port: 443,
    path: '/peerjs',
    secure: true,
});
```

该服务不提供 TURN；只有 STUN 时，某些网络组合仍可能无法建立点对点连接。连接 key 不是身份认证，房间与玩家身份由后续联机功能处理。
