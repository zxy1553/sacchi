import type WebSocket from "ws";
import { config } from "../config";
import { toPublicRoomState } from "../rooms/roomState";
import { RoomManager } from "../rooms/roomManager";
import { GameSyncService } from "../services/gameSyncService";
import { ConnectionRegistry } from "./connectionRegistry";
import type { ClientMessage, ErrorCode, ServerMessage } from "../types/messages";

function createEnvelope<T extends ServerMessage["type"]>(
  type: T,
  requestId: string,
  roomId: string | null,
  playerId: string | null,
  payload: Extract<ServerMessage, { type: T }>["payload"]
): Extract<ServerMessage, { type: T }> {
  return {
    type,
    requestId,
    roomId,
    playerId,
    timestamp: Date.now(),
    protocolVersion: config.protocolVersion,
    payload
  } as Extract<ServerMessage, { type: T }>;
}

function sendMessage(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function broadcastToRoom(
  registry: ConnectionRegistry,
  roomManager: RoomManager,
  roomId: string,
  message: ServerMessage
): void {
  const room = roomManager.getRoom(roomId);
  if (!room) {
    return;
  }

  room.players.forEach((player) => {
    const socket = registry.getSocketByPlayer(player.playerId);
    if (socket && socket.readyState === 1) {
      sendMessage(socket, message);
    }
  });
}

function sendError(
  socket: WebSocket,
  requestId: string,
  roomId: string | null,
  playerId: string | null,
  code: ErrorCode,
  reason: string
): void {
  sendMessage(
    socket,
    createEnvelope("error", requestId, roomId, playerId, {
      code,
      reason
    })
  );
}

function isClientMessage(value: unknown): value is ClientMessage {
  return typeof value === "object" && value !== null && "type" in value;
}

export class MessageHandlers {
  constructor(
    private readonly roomManager: RoomManager,
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly gameSyncService: GameSyncService
  ) {}

  handleConnectionClosed(connectionId: string): void {
    const { playerId } = this.connectionRegistry.removeConnection(connectionId);
    if (!playerId) {
      return;
    }

    const room = this.roomManager.markDisconnected(playerId);
    if (!room) {
      return;
    }

    broadcastToRoom(
      this.connectionRegistry,
      this.roomManager,
      room.roomId,
      createEnvelope("playerPresenceUpdated", crypto.randomUUID(), room.roomId, playerId, {
        roomState: toPublicRoomState(room)
      })
    );
  }

  handleMessage(connectionId: string, socket: WebSocket, rawMessage: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      sendError(socket, crypto.randomUUID(), null, null, "INVALID_MESSAGE", "Malformed JSON.");
      return;
    }

    if (!isClientMessage(parsed)) {
      sendError(socket, crypto.randomUUID(), null, null, "INVALID_MESSAGE", "Unsupported message.");
      return;
    }

    const message = parsed;
    const requestId = message.requestId ?? crypto.randomUUID();
    const playerId = message.playerId ?? null;
    const roomId = message.roomId ?? null;

    switch (message.type) {
      case "ping": {
        sendMessage(socket, createEnvelope("pong", requestId, roomId, playerId, {}));
        return;
      }
      case "createRoom": {
        const resolvedPlayerId = playerId ?? crypto.randomUUID();
        const result = this.roomManager.createRoom(
          resolvedPlayerId,
          connectionId,
          message.payload.desiredColor
        );
        if (!result.ok) {
          sendError(socket, requestId, null, resolvedPlayerId, result.code, result.reason);
          return;
        }

        this.connectionRegistry.bindPlayer(connectionId, resolvedPlayerId);
        sendMessage(
          socket,
          createEnvelope("roomCreated", requestId, result.room.roomId, resolvedPlayerId, {
            roomState: toPublicRoomState(result.room)
          })
        );
        return;
      }
      case "joinRoom": {
        const resolvedPlayerId = playerId ?? crypto.randomUUID();
        const result = this.roomManager.joinRoom(message.payload.roomId, resolvedPlayerId, connectionId);
        if (!result.ok) {
          sendError(socket, requestId, message.payload.roomId, resolvedPlayerId, result.code, result.reason);
          return;
        }

        this.connectionRegistry.bindPlayer(connectionId, resolvedPlayerId);
        const joinedMessage = createEnvelope(
          "roomJoined",
          requestId,
          result.room.roomId,
          resolvedPlayerId,
          {
            roomState: toPublicRoomState(result.room)
          }
        );
        sendMessage(socket, joinedMessage);

        broadcastToRoom(
          this.connectionRegistry,
          this.roomManager,
          result.room.roomId,
          createEnvelope("playerPresenceUpdated", requestId, result.room.roomId, resolvedPlayerId, {
            roomState: toPublicRoomState(result.room)
          })
        );
        return;
      }
      case "playerMove": {
        const result = this.gameSyncService.applyMove(
          this.roomManager.getRoom(message.roomId ?? ""),
          playerId,
          message.payload
        );
        if (!result.ok) {
          sendMessage(
            socket,
            createEnvelope("moveRejected", requestId, roomId, playerId, {
              attemptedMove: message.payload.move,
              code: result.code,
              reason: result.reason
            })
          );
          return;
        }

        broadcastToRoom(
          this.connectionRegistry,
          this.roomManager,
          roomId ?? "",
          createEnvelope("moveAccepted", requestId, roomId, playerId, result.payload)
        );

        if (result.shouldEmitGameOver) {
          broadcastToRoom(
            this.connectionRegistry,
            this.roomManager,
            roomId ?? "",
            createEnvelope("gameOver", requestId, roomId, playerId, {
              roomState: result.payload.roomState
            })
          );
        }
        return;
      }
      case "requestSync": {
        const room = this.roomManager.getRoom(message.payload.roomId);
        if (!room) {
          sendError(socket, requestId, message.payload.roomId, playerId, "ROOM_NOT_FOUND", "Room does not exist.");
          return;
        }

        sendMessage(
          socket,
          createEnvelope("stateSynced", requestId, room.roomId, playerId, {
            roomState: toPublicRoomState(room)
          })
        );
        return;
      }
      case "leaveRoom": {
        sendMessage(socket, createEnvelope("pong", requestId, roomId, playerId, {}));
        return;
      }
      default: {
        sendError(socket, requestId, roomId, playerId, "INVALID_MESSAGE", "Unsupported message type.");
      }
    }
  }
}
