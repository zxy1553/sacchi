import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { RoomManager } from "./rooms/roomManager";
import { GameSyncService } from "./services/gameSyncService";
import { ConnectionRegistry } from "./ws/connectionRegistry";
import { MessageHandlers } from "./ws/handlers";

export interface StartedServer {
  host: string;
  port: number;
  close: () => Promise<void>;
}

export async function startWebChessServer(
  host = config.host,
  port = config.port
): Promise<StartedServer> {
  const roomManager = new RoomManager();
  const gameSyncService = new GameSyncService();
  const connectionRegistry = new ConnectionRegistry();
  const handlers = new MessageHandlers(roomManager, connectionRegistry, gameSyncService);

  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, protocolVersion: config.protocolVersion }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not found" }));
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    const connectionId = crypto.randomUUID();
    connectionRegistry.register(connectionId, socket);

    socket.on("message", (data) => {
      handlers.handleMessage(connectionId, socket, data.toString());
    });

    socket.on("close", () => {
      handlers.handleConnectionClosed(connectionId);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server failed to expose a numeric address.");
  }

  return {
    host,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        wss.close((wsError) => {
          if (wsError) {
            reject(wsError);
            return;
          }
          server.close((serverError) => {
            if (serverError) {
              reject(serverError);
              return;
            }
            resolve();
          });
        });
      });
    }
  };
}

// Auto-start when run directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("app.ts") || process.argv[1].endsWith("app.js"));

if (isMainModule) {
  startWebChessServer().then(({ host, port }) => {
    console.log(`♟️  Chess WebSocket server running at ws://${host}:${port}`);
  }).catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
