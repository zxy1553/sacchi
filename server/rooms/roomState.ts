import type { RoomPlayer, RoomState } from "../../src/types/chess";
import type { PlayerSession, ServerRoomState } from "../types/room";

function toPublicPlayer(player: PlayerSession): RoomPlayer {
  return {
    playerId: player.playerId,
    color: player.color,
    connected: player.connected,
    joinedAt: player.joinedAt
  };
}

export function toPublicRoomState(room: ServerRoomState): RoomState {
  return {
    roomId: room.roomId,
    status: room.status,
    protocolVersion: room.protocolVersion,
    players: room.players.map(toPublicPlayer),
    currentTurn: room.currentTurn,
    gameState: room.gameState,
    moveHistory: room.moveHistory,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}
