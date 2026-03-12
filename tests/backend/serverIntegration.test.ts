import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startWebChessServer, type StartedServer } from "../../server/app";
import { ChessEngine } from "../../src/game/gameState";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage
} from "../../server/types/messages";

class TestClient {
  private queue: ServerMessage[] = [];

  constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      this.queue.push(JSON.parse(data.toString()) as ServerMessage);
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  async nextOfType<T extends ServerMessage["type"]>(
    type: T,
    timeoutMs = 1000
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const index = this.queue.findIndex((message) => message.type === type);
      if (index >= 0) {
        return this.queue.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error(`Timed out waiting for message type ${type}`);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.socket.close();
      this.socket.once("close", () => resolve());
    });
  }
}

function createMessage(message: Omit<ClientMessage, "timestamp" | "protocolVersion">): ClientMessage {
  return {
    ...message,
    timestamp: Date.now(),
    protocolVersion: PROTOCOL_VERSION
  } as ClientMessage;
}

async function connect(url: string): Promise<TestClient> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error) => reject(error));
  });
  return new TestClient(socket);
}

describe("WebSocket integration checkpoints", () => {
  let server: StartedServer;

  beforeEach(async () => {
    server = await startWebChessServer("127.0.0.1", 0);
  });

  afterEach(async () => {
    await server.close();
  });

  it("passes checkpoint 1 room flow", async () => {
    const url = `ws://127.0.0.1:${server.port}`;
    const white = await connect(url);
    const black = await connect(url);

    white.send(
      createMessage({
        type: "createRoom",
        requestId: "req-create-room",
        roomId: null,
        playerId: "white-player",
        payload: {}
      })
    );

    const created = await white.nextOfType("roomCreated");
    const roomId = created.payload.roomState.roomId;

    black.send(
      createMessage({
        type: "joinRoom",
        requestId: "req-join-room",
        roomId,
        playerId: "black-player",
        payload: { roomId }
      })
    );

    const joined = await black.nextOfType("roomJoined");
    expect(joined.payload.roomState.players).toHaveLength(2);
    expect(joined.payload.roomState.players[0].color).toBe("white");
    expect(joined.payload.roomState.players[1].color).toBe("black");

    const spectator = await connect(url);
    spectator.send(
      createMessage({
        type: "joinRoom",
        requestId: "req-join-third",
        roomId,
        playerId: "spectator-player",
        payload: { roomId }
      })
    );
    const rejected = await spectator.nextOfType("error");
    expect(rejected.payload.code).toBe("ROOM_FULL");

    await white.close();
    await black.close();
    await spectator.close();
  });

  it("passes checkpoint 2 move sync", async () => {
    const url = `ws://127.0.0.1:${server.port}`;
    const white = await connect(url);
    const black = await connect(url);

    white.send(
      createMessage({
        type: "createRoom",
        requestId: "req-create-room",
        roomId: null,
        playerId: "white-player",
        payload: {}
      })
    );
    const created = await white.nextOfType("roomCreated");
    const roomId = created.payload.roomState.roomId;

    black.send(
      createMessage({
        type: "joinRoom",
        requestId: "req-join-room",
        roomId,
        playerId: "black-player",
        payload: { roomId }
      })
    );
    await black.nextOfType("roomJoined");
    await white.nextOfType("playerPresenceUpdated");

    const engine = new ChessEngine();
    const move = engine.attemptMove({ from: "e2", to: "e4" });
    if (!move.ok) {
      throw new Error("Expected opening move to be legal.");
    }

    white.send(
      createMessage({
        type: "playerMove",
        requestId: "req-white-move",
        roomId,
        playerId: "white-player",
        payload: {
          move: move.move,
          nextGameState: move.state
        }
      })
    );

    const whiteAccepted = await white.nextOfType("moveAccepted");
    const blackAccepted = await black.nextOfType("moveAccepted");
    expect(whiteAccepted.payload.roomState.gameState?.fen).toBe(move.state.fen);
    expect(blackAccepted.payload.roomState.currentTurn).toBe("black");

    white.send(
      createMessage({
        type: "playerMove",
        requestId: "req-white-illegal-turn",
        roomId,
        playerId: "white-player",
        payload: {
          move: { from: "d2", to: "d4" },
          nextGameState: move.state
        }
      })
    );

    const rejected = await white.nextOfType("moveRejected");
    expect(rejected.payload.code).toBe("NOT_YOUR_TURN");

    await white.close();
    await black.close();
  });

  it("passes checkpoint 3 recovery", async () => {
    const url = `ws://127.0.0.1:${server.port}`;
    const white = await connect(url);
    const black = await connect(url);

    white.send(
      createMessage({
        type: "createRoom",
        requestId: "req-create-room",
        roomId: null,
        playerId: "white-player",
        payload: {}
      })
    );
    const created = await white.nextOfType("roomCreated");
    const roomId = created.payload.roomState.roomId;

    black.send(
      createMessage({
        type: "joinRoom",
        requestId: "req-join-room",
        roomId,
        playerId: "black-player",
        payload: { roomId }
      })
    );
    await black.nextOfType("roomJoined");
    await white.nextOfType("playerPresenceUpdated");

    await black.close();
    const disconnected = await white.nextOfType("playerPresenceUpdated");
    const disconnectedBlack = disconnected.payload.roomState.players.find(
      (player) => player.playerId === "black-player"
    );
    expect(disconnectedBlack?.connected).toBe(false);

    const reconnectedBlack = await connect(url);
    reconnectedBlack.send(
      createMessage({
        type: "joinRoom",
        requestId: "req-rejoin-room",
        roomId,
        playerId: "black-player",
        payload: { roomId }
      })
    );
    await reconnectedBlack.nextOfType("roomJoined");

    reconnectedBlack.send(
      createMessage({
        type: "requestSync",
        requestId: "req-sync-room",
        roomId,
        playerId: "black-player",
        payload: { roomId }
      })
    );
    const synced = await reconnectedBlack.nextOfType("stateSynced");
    expect(synced.payload.roomState.roomId).toBe(roomId);
    expect(synced.payload.roomState.players.find((player) => player.playerId === "black-player")?.connected).toBe(
      true
    );

    await white.close();
    await reconnectedBlack.close();
  });
});
