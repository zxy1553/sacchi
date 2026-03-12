# Web Chess

一个按强契约驱动方式组织的网页版国际象棋项目。

## 当前范围

- 本地双人模式
- Mock 联网模式
- 真实 WebSocket 房间同步
- 前后端共享类型与消息契约

## 启动方式

安装依赖：

```bash
npm install
```

启动前端：

```bash
npm run dev
```

启动后端：

```bash
npm run server:dev
```

运行测试：

```bash
npm test
```

## 目录

- `src/`：前端应用、规则引擎、网络层
- `server/`：WebSocket 房间服务
- `docs/`：架构、接口、规则文档
- `tests/`：前后端契约与核心逻辑测试
