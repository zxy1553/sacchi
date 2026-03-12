import type { GameState, Move, PlayerColor, RoomState, RoomStatus } from "../../src/types/chess";

export interface PlayerSession {
  playerId: string;
  connectionId: string;
  color: PlayerColor;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface ServerRoomState extends Omit<RoomState, "players"> {
  status: RoomStatus;
  players: PlayerSession[];
  gameState: GameState | null;
  moveHistory: Move[];
}
