import type { GameState, GameStateSummary, Move, RoomState } from "../../src/types/chess";

export const PROTOCOL_VERSION = "1.0.0";

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "INVALID_MESSAGE"
  | "NOT_YOUR_TURN"
  | "INVALID_MOVE"
  | "GAME_ALREADY_STARTED"
  | "PLAYER_NOT_IN_ROOM"
  | "INTERNAL_ERROR";

export interface MessageEnvelope<TType extends string, TPayload> {
  type: TType;
  requestId: string;
  roomId: string | null;
  playerId: string | null;
  timestamp: number;
  protocolVersion: string;
  payload: TPayload;
}

export interface CreateRoomPayload {
  desiredColor?: "white" | "black";
}

export interface JoinRoomPayload {
  roomId: string;
}

export interface PlayerMovePayload {
  move: Move;
  nextGameState: GameState;
}

export interface RequestSyncPayload {
  roomId: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export type ClientMessage =
  | MessageEnvelope<"createRoom", CreateRoomPayload>
  | MessageEnvelope<"joinRoom", JoinRoomPayload>
  | MessageEnvelope<"playerMove", PlayerMovePayload>
  | MessageEnvelope<"requestSync", RequestSyncPayload>
  | MessageEnvelope<"leaveRoom", LeaveRoomPayload>
  | MessageEnvelope<"ping", Record<string, never>>;

export interface RoomCreatedPayload {
  roomState: RoomState;
}

export interface RoomJoinedPayload {
  roomState: RoomState;
}

export interface MoveAcceptedPayload {
  move: Move;
  gameStateSummary: GameStateSummary;
  roomState: RoomState;
}

export interface MoveRejectedPayload {
  attemptedMove: Move;
  code: ErrorCode;
  reason: string;
}

export interface StateSyncedPayload {
  roomState: RoomState;
}

export interface PlayerPresenceUpdatedPayload {
  roomState: RoomState;
}

export interface GameOverPayload {
  roomState: RoomState;
}

export interface ErrorPayload {
  code: ErrorCode;
  reason: string;
}

export type ServerMessage =
  | MessageEnvelope<"roomCreated", RoomCreatedPayload>
  | MessageEnvelope<"roomJoined", RoomJoinedPayload>
  | MessageEnvelope<"moveAccepted", MoveAcceptedPayload>
  | MessageEnvelope<"moveRejected", MoveRejectedPayload>
  | MessageEnvelope<"stateSynced", StateSyncedPayload>
  | MessageEnvelope<"playerPresenceUpdated", PlayerPresenceUpdatedPayload>
  | MessageEnvelope<"gameOver", GameOverPayload>
  | MessageEnvelope<"error", ErrorPayload>
  | MessageEnvelope<"pong", Record<string, never>>;

export const serverMessageTypes = [
  "roomCreated",
  "roomJoined",
  "moveAccepted",
  "moveRejected",
  "stateSynced",
  "playerPresenceUpdated",
  "gameOver",
  "error",
  "pong"
] as const;
