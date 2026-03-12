import { config } from "../config";
import { ChessEngine } from "../../src/game/gameState";
import type { ErrorCode } from "../types/messages";
import type { PlayerColor } from "../../src/types/chess";
import type { PlayerSession, ServerRoomState } from "../types/room";

type JoinResult =
  | { ok: true; room: ServerRoomState; player: PlayerSession }
  | { ok: false; code: ErrorCode; reason: string };

function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function chooseColor(
  existingPlayers: PlayerSession[],
  desiredColor?: PlayerColor
): PlayerColor {
  const usedColors = new Set(existingPlayers.map((player) => player.color));
  if (desiredColor && !usedColors.has(desiredColor)) {
    return desiredColor;
  }

  return usedColors.has("white") ? "black" : "white";
}

export class RoomManager {
  private rooms = new Map<string, ServerRoomState>();

  createRoom(playerId: string, connectionId: string, desiredColor?: PlayerColor): JoinResult {
    const now = Date.now();
    const initialGameState = new ChessEngine().getState();
    const roomId = generateRoomId();
    const player: PlayerSession = {
      playerId,
      connectionId,
      color: desiredColor ?? "white",
      connected: true,
      joinedAt: now,
      lastSeenAt: now
    };

    const room: ServerRoomState = {
      roomId,
      status: "waiting",
      protocolVersion: config.protocolVersion,
      players: [player],
      currentTurn: initialGameState.turn,
      gameState: initialGameState,
      moveHistory: [],
      createdAt: now,
      updatedAt: now
    };

    this.rooms.set(roomId, room);
    return { ok: true, room, player };
  }

  joinRoom(roomId: string, playerId: string, connectionId: string): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, code: "ROOM_NOT_FOUND", reason: "Room does not exist." };
    }

    const now = Date.now();
    const existingPlayer = room.players.find((player) => player.playerId === playerId);
    if (existingPlayer) {
      existingPlayer.connectionId = connectionId;
      existingPlayer.connected = true;
      existingPlayer.lastSeenAt = now;
      room.updatedAt = now;
      return { ok: true, room, player: existingPlayer };
    }

    if (room.players.length >= 2) {
      return { ok: false, code: "ROOM_FULL", reason: "Room already has two players." };
    }

    const player: PlayerSession = {
      playerId,
      connectionId,
      color: chooseColor(room.players),
      connected: true,
      joinedAt: now,
      lastSeenAt: now
    };
    room.players.push(player);
    room.updatedAt = now;
    if (room.players.length === 2) {
      room.status = room.gameState?.result ? "finished" : "playing";
      room.currentTurn = room.gameState?.turn ?? "white";
    }

    return { ok: true, room, player };
  }

  getRoom(roomId: string): ServerRoomState | undefined {
    return this.rooms.get(roomId);
  }

  markDisconnected(playerId: string): ServerRoomState | undefined {
    for (const room of this.rooms.values()) {
      const player = room.players.find((entry) => entry.playerId === playerId);
      if (!player) {
        continue;
      }

      player.connected = false;
      player.lastSeenAt = Date.now();
      room.updatedAt = Date.now();
      return room;
    }

    return undefined;
  }
}
