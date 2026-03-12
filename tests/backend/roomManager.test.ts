import { describe, expect, it } from "vitest";
import { ChessEngine } from "../../src/game/gameState";
import { RoomManager } from "../../server/rooms/roomManager";
import { GameSyncService } from "../../server/services/gameSyncService";

describe("RoomManager", () => {
  it("creates and joins a room with assigned colors", () => {
    const manager = new RoomManager();

    const created = manager.createRoom("player-a", "connection-a");
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("Expected createRoom to succeed.");
    }

    const joined = manager.joinRoom(created.room.roomId, "player-b", "connection-b");
    expect(joined.ok).toBe(true);
    if (!joined.ok) {
      throw new Error("Expected joinRoom to succeed.");
    }

    expect(created.room.players[0].color).toBe("white");
    expect(joined.room.players[1].color).toBe("black");
  });

  it("rejects a third player from joining", () => {
    const manager = new RoomManager();
    const created = manager.createRoom("player-a", "connection-a");
    if (!created.ok) {
      throw new Error("Expected createRoom to succeed.");
    }
    const joined = manager.joinRoom(created.room.roomId, "player-b", "connection-b");
    if (!joined.ok) {
      throw new Error("Expected joinRoom to succeed.");
    }

    const third = manager.joinRoom(created.room.roomId, "player-c", "connection-c");

    expect(third.ok).toBe(false);
    if (third.ok) {
      throw new Error("Expected joinRoom to fail for third player.");
    }
    expect(third.code).toBe("ROOM_FULL");
  });
});

describe("GameSyncService", () => {
  it("rejects moves from the wrong turn", () => {
    const manager = new RoomManager();
    const syncService = new GameSyncService();

    const created = manager.createRoom("player-a", "connection-a");
    if (!created.ok) {
      throw new Error("Expected createRoom to succeed.");
    }
    const joined = manager.joinRoom(created.room.roomId, "player-b", "connection-b");
    if (!joined.ok) {
      throw new Error("Expected joinRoom to succeed.");
    }

    const engine = new ChessEngine();
    const moveResult = engine.attemptMove({ from: "e2", to: "e4" });
    if (!moveResult.ok) {
      throw new Error("Expected opening move to be legal.");
    }

    const result = syncService.applyMove(created.room, "player-b", {
      move: moveResult.move,
      nextGameState: moveResult.state
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected move application to fail.");
    }
    expect(result.code).toBe("NOT_YOUR_TURN");
  });

  it("stores room state on accepted move", () => {
    const manager = new RoomManager();
    const syncService = new GameSyncService();

    const created = manager.createRoom("player-a", "connection-a");
    if (!created.ok) {
      throw new Error("Expected createRoom to succeed.");
    }
    const joined = manager.joinRoom(created.room.roomId, "player-b", "connection-b");
    if (!joined.ok) {
      throw new Error("Expected joinRoom to succeed.");
    }

    const engine = new ChessEngine();
    const moveResult = engine.attemptMove({ from: "e2", to: "e4" });
    if (!moveResult.ok) {
      throw new Error("Expected move to succeed.");
    }

    const result = syncService.applyMove(created.room, "player-a", {
      move: moveResult.move,
      nextGameState: moveResult.state
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected move to be accepted.");
    }
    expect(result.payload.roomState.currentTurn).toBe("black");
    expect(result.payload.roomState.gameState?.fen).toBe(moveResult.state.fen);
  });
});
