# API Contract

## Protocol Version

- `1.0.0`

## Base Envelope

所有消息都包含以下字段：

- `type`
- `requestId`
- `roomId`
- `playerId`
- `timestamp`
- `protocolVersion`
- `payload`

## Client Messages

### `createRoom`

创建一个新房间。

Payload:

```json
{
  "desiredColor": "white"
}
```

### `joinRoom`

加入现有房间。

Payload:

```json
{
  "roomId": "ABC123"
}
```

### `playerMove`

提交一次玩家落子，并把客户端生成的下一版 `GameState` 一起发送给服务端。

Payload:

```json
{
  "move": {
    "from": "e2",
    "to": "e4"
  },
  "nextGameState": {
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "turn": "black"
  }
}
```

### `requestSync`

请求服务端返回完整 `RoomState`。

### `leaveRoom`

保留消息，第一版仅占位。

### `ping`

连接探活。

## Server Messages

### `roomCreated`

返回房间初始化状态。

### `roomJoined`

返回加入后的完整房间状态。

### `moveAccepted`

广播成功落子和最新房间状态。

### `moveRejected`

拒绝当前落子请求。

### `stateSynced`

返回完整房间状态，用于刷新恢复和重连。

### `playerPresenceUpdated`

房间内玩家在线状态发生变化。

### `gameOver`

广播结束后的房间状态。

### `error`

非落子类错误。

### `pong`

`ping` 的响应。

## Error Codes

- `ROOM_NOT_FOUND`
- `ROOM_FULL`
- `INVALID_MESSAGE`
- `NOT_YOUR_TURN`
- `INVALID_MOVE`
- `GAME_ALREADY_STARTED`
- `PLAYER_NOT_IN_ROOM`
- `INTERNAL_ERROR`

## Version Rules

- 已冻结字段只能做向后兼容新增
- 改名、改语义或删字段属于不兼容变更
- 不兼容变更必须提升 `protocolVersion`
