import type WebSocket from "ws";

export class ConnectionRegistry {
  private sockets = new Map<string, WebSocket>();
  private playersByConnection = new Map<string, string>();
  private connectionsByPlayer = new Map<string, string>();

  register(connectionId: string, socket: WebSocket): void {
    this.sockets.set(connectionId, socket);
  }

  bindPlayer(connectionId: string, playerId: string): void {
    this.playersByConnection.set(connectionId, playerId);
    this.connectionsByPlayer.set(playerId, connectionId);
  }

  getSocketByPlayer(playerId: string): WebSocket | undefined {
    const connectionId = this.connectionsByPlayer.get(playerId);
    if (!connectionId) {
      return undefined;
    }

    return this.sockets.get(connectionId);
  }

  getSocketByConnection(connectionId: string): WebSocket | undefined {
    return this.sockets.get(connectionId);
  }

  getPlayerId(connectionId: string): string | undefined {
    return this.playersByConnection.get(connectionId);
  }

  removeConnection(connectionId: string): { playerId?: string } {
    const playerId = this.playersByConnection.get(connectionId);
    this.sockets.delete(connectionId);
    this.playersByConnection.delete(connectionId);

    if (playerId && this.connectionsByPlayer.get(playerId) === connectionId) {
      this.connectionsByPlayer.delete(playerId);
    }

    return { playerId };
  }
}
