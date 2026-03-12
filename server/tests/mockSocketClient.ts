import { ChessEngine } from "../../src/game/gameState";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage
} from "../types/messages";
import type { RoomState } from "../../src/types/chess";

type MessageHandler = (message: ServerMessage) => void;

function createRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createRoomState(roomId: string): RoomState {
  const now = Date.now();
  const engine = new ChessEngine();
  const gameState = engine.getState();
  return {
    roomId,
    status: "waiting",
    protocolVersion: PROTOCOL_VERSION,
    players: [],
    currentTurn: gameState.turn,
    gameState,
    moveHistory: [],
    createdAt: now,
    updatedAt: now
  };
}

export class MockSocketClient {
  private connected = false;
  private handler: MessageHandler | null = null;
  private roomState: RoomState | null = null;

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  setMessageHandler(handler: MessageHandler): void {
    this.handler = handler;
  }

  send(message: ClientMessage): void {
    if (!this.handler) {
      return;
    }

    if (!this.connected && message.type !== "ping") {
      this.emitError(message, "INTERNAL_ERROR", "Mock socket is not connected.");
      return;
    }

    switch (message.type) {
      case "ping":
        this.emit({
          type: "pong",
          requestId: message.requestId,
          roomId: message.roomId,
          playerId: message.playerId,
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
          payload: {}
        });
        break;
      case "createRoom": {
        const roomId = createRoomId();
        this.roomState = createRoomState(roomId);
        this.roomState.players = [
          {
            playerId: message.playerId ?? "mock-player",
            color: message.payload.desiredColor ?? "white",
            connected: true,
            joinedAt: Date.now()
          }
        ];
        this.roomState.updatedAt = Date.now();
        this.emit({
          type: "roomCreated",
          requestId: message.requestId,
          roomId,
          playerId: message.playerId,
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
          payload: {
            roomState: this.roomState
          }
        });
        break;
      }
      case "joinRoom": {
        if (!this.roomState || this.roomState.roomId !== message.payload.roomId) {
          this.emitError(message, "ROOM_NOT_FOUND", "Mock room does not exist.");
          break;
        }

        if (!this.roomState.players.some((player) => player.playerId === message.playerId)) {
          if (this.roomState.players.length >= 2) {
            this.emitError(message, "ROOM_FULL", "Mock room already has two players.");
            break;
          }
          this.roomState.players.push({
            playerId: message.playerId ?? "mock-player-2",
            color: this.roomState.players.some((player) => player.color === "white")
              ? "black"
              : "white",
            connected: true,
            joinedAt: Date.now()
          });
        }
        this.roomState.status = this.roomState.players.length === 2 ? "playing" : "waiting";
        this.roomState.updatedAt = Date.now();
        this.emit({
          type: "roomJoined",
          requestId: message.requestId,
          roomId: this.roomState.roomId,
          playerId: message.playerId,
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
          payload: {
            roomState: this.roomState
          }
        });
        break;
      }
      case "playerMove": {
        if (!this.roomState) {
          this.emitError(message, "ROOM_NOT_FOUND", "No mock room state available.");
          break;
        }

        const player = this.roomState.players.find((entry) => entry.playerId === message.playerId);
        if (!player) {
          this.emitError(message, "PLAYER_NOT_IN_ROOM", "Player is not part of the mock room.");
          break;
        }

        if (this.roomState.currentTurn !== player.color) {
          this.emit({
            type: "moveRejected",
            requestId: message.requestId,
            roomId: this.roomState.roomId,
            playerId: message.playerId,
            timestamp: Date.now(),
            protocolVersion: PROTOCOL_VERSION,
            payload: {
              attemptedMove: message.payload.move,
              code: "NOT_YOUR_TURN",
              reason: "It is not your turn."
            }
          });
          break;
        }

        this.roomState.gameState = message.payload.nextGameState;
        this.roomState.currentTurn = message.payload.nextGameState.turn;
        this.roomState.moveHistory = [...message.payload.nextGameState.moveHistory];
        this.roomState.status = message.payload.nextGameState.result ? "finished" : "playing";
        this.roomState.updatedAt = Date.now();
        this.emit({
          type: "moveAccepted",
          requestId: message.requestId,
          roomId: this.roomState.roomId,
          playerId: message.playerId,
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
          payload: {
            move: message.payload.move,
            gameStateSummary: {
              fen: this.roomState.gameState.fen,
              turn: this.roomState.gameState.turn,
              isCheck: this.roomState.gameState.isCheck,
              isCheckmate: this.roomState.gameState.isCheckmate,
              isStalemate: this.roomState.gameState.isStalemate,
              isDraw: this.roomState.gameState.isDraw,
              lastMove: this.roomState.gameState.lastMove,
              result: this.roomState.gameState.result
            },
            roomState: this.roomState
          }
        });
        break;
      }
      case "requestSync": {
        if (!this.roomState) {
          this.emitError(message, "ROOM_NOT_FOUND", "No mock room state available.");
          break;
        }

        this.emit({
          type: "stateSynced",
          requestId: message.requestId,
          roomId: this.roomState.roomId,
          playerId: message.playerId,
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
          payload: {
            roomState: this.roomState
          }
        });
        break;
      }
      case "leaveRoom":
        this.emit({
          type: "pong",
          requestId: message.requestId,
          roomId: message.roomId,
          playerId: message.playerId,
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
          payload: {}
        });
        break;
    }
  }

  private emit(message: ServerMessage): void {
    this.handler?.(message);
  }

  private emitError(message: ClientMessage, code: ErrorCode, reason: string): void {
    this.emit({
      type: "error",
      requestId: message.requestId,
      roomId: message.roomId,
      playerId: message.playerId,
      timestamp: Date.now(),
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        code,
        reason
      }
    });
  }
}
