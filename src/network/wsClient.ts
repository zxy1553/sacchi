import type {
  ClientMessage,
  ServerMessage,
  CreateRoomPayload,
  JoinRoomPayload,
  PlayerMovePayload,
  RequestSyncPayload,
  LeaveRoomPayload,
  PROTOCOL_VERSION
} from "../../server/types/messages";
import type { Move, GameState } from "../types/chess";

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface WsClientOptions {
  url: string;
  onMessage: (message: ServerMessage) => void;
  onStateChange: (state: ConnectionState) => void;
  onError: (error: string) => void;
}

/** Generate a UUID v4 string, with fallback for non-HTTPS environments */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4 generation using crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createClientEnvelope<TType extends ClientMessage["type"]>(
  type: TType,
  roomId: string | null,
  playerId: string | null,
  payload: Extract<ClientMessage, { type: TType }>["payload"]
): Extract<ClientMessage, { type: TType }> {
  return {
    type,
    requestId: generateUUID(),
    roomId,
    playerId,
    timestamp: Date.now(),
    protocolVersion: "1.0.0",
    payload
  } as Extract<ClientMessage, { type: TType }>;
}

export class WsClient {
  private socket: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private playerId: string | null = null;
  private roomId: string | null = null;

  constructor(private readonly options: WsClientOptions) {}

  get connectionState(): ConnectionState {
    return this.state;
  }

  get currentPlayerId(): string | null {
    return this.playerId;
  }

  get currentRoomId(): string | null {
    return this.roomId;
  }

  setPlayerContext(playerId: string | null, roomId: string | null): void {
    this.playerId = playerId;
    this.roomId = roomId;
  }

  connect(): void {
    if (this.socket && this.state !== "disconnected") {
      return;
    }

    this.setState("connecting");

    try {
      this.socket = new WebSocket(this.options.url);
    } catch {
      this.setState("disconnected");
      this.options.onError("Failed to create WebSocket connection.");
      return;
    }

    this.socket.addEventListener("open", () => {
      this.setState("connected");
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        this.options.onMessage(message);
      } catch {
        this.options.onError("Received invalid message from server.");
      }
    });

    this.socket.addEventListener("close", () => {
      this.setState("disconnected");
      this.socket = null;
    });

    this.socket.addEventListener("error", () => {
      this.options.onError("WebSocket connection error.");
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.setState("disconnected");
  }

  // --- Client actions ---

  createRoom(desiredColor?: "white" | "black"): void {
    this.send(
      createClientEnvelope("createRoom", null, this.playerId, {
        desiredColor
      } as CreateRoomPayload)
    );
  }

  joinRoom(roomId: string): void {
    this.send(
      createClientEnvelope("joinRoom", null, this.playerId, {
        roomId
      } as JoinRoomPayload)
    );
  }

  sendMove(move: Move, nextGameState: GameState): void {
    this.send(
      createClientEnvelope("playerMove", this.roomId, this.playerId, {
        move,
        nextGameState
      } as PlayerMovePayload)
    );
  }

  requestSync(roomId: string): void {
    this.send(
      createClientEnvelope("requestSync", roomId, this.playerId, {
        roomId
      } as RequestSyncPayload)
    );
  }

  leaveRoom(roomId: string): void {
    this.send(
      createClientEnvelope("leaveRoom", roomId, this.playerId, {
        roomId
      } as LeaveRoomPayload)
    );
  }

  ping(): void {
    this.send(
      createClientEnvelope("ping", this.roomId, this.playerId, {} as Record<string, never>)
    );
  }

  // --- Internal helpers ---

  private send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.options.onError("Not connected to server.");
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) {
      return;
    }

    this.state = newState;
    this.options.onStateChange(newState);
  }
}
