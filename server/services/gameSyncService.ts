import type { ErrorCode, PlayerMovePayload } from "../types/messages";
import type { MoveAcceptedPayload } from "../types/messages";
import { toPublicRoomState } from "../rooms/roomState";
import type { GameStateSummary } from "../../src/types/chess";
import type { ServerRoomState } from "../types/room";

type SyncResult =
  | { ok: true; payload: MoveAcceptedPayload; shouldEmitGameOver: boolean }
  | { ok: false; code: ErrorCode; reason: string };

function buildSummary(room: ServerRoomState): GameStateSummary {
  if (!room.gameState) {
    throw new Error("Cannot build summary without a game state.");
  }

  return {
    fen: room.gameState.fen,
    turn: room.gameState.turn,
    isCheck: room.gameState.isCheck,
    isCheckmate: room.gameState.isCheckmate,
    isStalemate: room.gameState.isStalemate,
    isDraw: room.gameState.isDraw,
    lastMove: room.gameState.lastMove,
    result: room.gameState.result
  };
}

export class GameSyncService {
  applyMove(
    room: ServerRoomState | undefined,
    playerId: string | null,
    payload: PlayerMovePayload
  ): SyncResult {
    if (!room) {
      return { ok: false, code: "ROOM_NOT_FOUND", reason: "Room does not exist." };
    }

    if (!playerId) {
      return { ok: false, code: "PLAYER_NOT_IN_ROOM", reason: "Player id is required." };
    }

    const player = room.players.find((entry) => entry.playerId === playerId);
    if (!player) {
      return { ok: false, code: "PLAYER_NOT_IN_ROOM", reason: "Player is not in the room." };
    }

    if (room.status === "finished") {
      return {
        ok: false,
        code: "GAME_ALREADY_STARTED",
        reason: "Game is already finished for this room."
      };
    }

    if (room.currentTurn && room.currentTurn !== player.color) {
      return { ok: false, code: "NOT_YOUR_TURN", reason: "It is not your turn." };
    }

    room.gameState = payload.nextGameState;
    room.currentTurn = payload.nextGameState.turn;
    room.moveHistory = [...payload.nextGameState.moveHistory];
    room.status = payload.nextGameState.result ? "finished" : "playing";
    room.updatedAt = Date.now();

    return {
      ok: true,
      payload: {
        move: payload.move,
        gameStateSummary: buildSummary(room),
        roomState: toPublicRoomState(room)
      },
      shouldEmitGameOver: Boolean(payload.nextGameState.result)
    };
  }
}
