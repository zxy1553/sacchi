# Architecture

## 分层

- `src/ui`：只负责界面渲染和用户点击
- `src/game`：只负责棋局状态、合法走法和对局摘要
- `src/network`：负责消息结构与传输
- `server`：负责房间、连接、同步和状态恢复

## 数据流

1. 前端 UI 收到落子操作。
2. `ChessEngine` 生成下一版 `GameState`。
3. 本地模式直接刷新界面。
4. 联网模式通过 `ClientMessage` 把 `Move + nextGameState` 发给服务端。
5. 服务端更新 `RoomState` 并广播 `ServerMessage`。
6. 前端收到 `moveAccepted` 或 `stateSynced` 后加载最新状态。

## 并行开发边界

- 前端只依赖 `src/types/chess.ts` 和 `src/network/contracts.ts`
- 后端通过 `server/types/*` 组织服务端模型
- 协议变更必须同步维护 `docs/api-contract.md` 和 `CHANGELOG.md`
