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
  /** Enable automatic reconnection on unexpected disconnection (default: true) */
  autoReconnect?: boolean;
  /** Max reconnect attempts before giving up (default: 10) */
  maxReconnectAttempts?: number;
  /** Heartbeat (ping) interval in ms (default: 25000) */
  heartbeatIntervalMs?: number;
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
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private playerId: string | null = null;
  private roomId: string | null = null;

  /** Whether disconnect() was called intentionally */
  private intentionalClose = false;
  private reconnectAttempts = 0;

  private readonly autoReconnect: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly heartbeatIntervalMs: number;

  constructor(private readonly options: WsClientOptions) {
    this.autoReconnect = options.autoReconnect ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 25_000;
  }

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

    this.intentionalClose = false;
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
      this.reconnectAttempts = 0;
      this.startHeartbeat();
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
      this.stopHeartbeat();
      this.socket = null;

      if (!this.intentionalClose && this.autoReconnect) {
        this.scheduleReconnect();
      } else {
        this.setState("disconnected");
      }
    });

    this.socket.addEventListener("error", () => {
      // error event is always followed by close, so reconnect logic is in close handler
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopReconnect();
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.setState("disconnected");
  }

  // --- Auto-reconnect ---

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState("disconnected");
      this.options.onError(
        `Reconnection failed after ${this.maxReconnectAttempts} attempts.`
      );
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;

    this.setState("connecting");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // Reset socket reference so connect() won't bail out
      this.socket = null;
      this.state = "disconnected";
      this.connect();
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  // --- Heartbeat ---

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.ping();
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
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

  listRooms(): void {
    this.send(
      createClientEnvelope("listRooms", null, this.playerId, {} as Record<string, never>)
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
      // Silently drop pings when disconnected
      if ((message as { type: string }).type === "ping") {
        return;
      }
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
