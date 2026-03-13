import type { GameState, PlayerColor } from "../types/chess";

const STORAGE_KEY_LOCAL = "chess_local_game";
const STORAGE_KEY_ONLINE = "chess_online_session";

export interface LocalGameSave {
  gameState: GameState;
  savedAt: number;
}

export interface OnlineSessionSave {
  serverUrl: string;
  roomId: string;
  playerId: string;
  myColor: PlayerColor;
  gameState: GameState;
  savedAt: number;
}

// --- Local game persistence ---

export function saveLocalGame(state: GameState): void {
  try {
    const data: LocalGameSave = {
      gameState: state,
      savedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY_LOCAL, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function loadLocalGame(): LocalGameSave | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL);
    if (!raw) return null;

    const data = JSON.parse(raw) as LocalGameSave;

    // Discard saves older than 24 hours
    if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
      clearLocalGame();
      return null;
    }

    // Basic sanity check
    if (!data.gameState?.fen) {
      clearLocalGame();
      return null;
    }

    return data;
  } catch {
    clearLocalGame();
    return null;
  }
}

export function clearLocalGame(): void {
  localStorage.removeItem(STORAGE_KEY_LOCAL);
}

// --- Online session persistence ---

export function saveOnlineSession(
  serverUrl: string,
  roomId: string,
  playerId: string,
  myColor: PlayerColor,
  gameState: GameState
): void {
  try {
    const data: OnlineSessionSave = {
      serverUrl,
      roomId,
      playerId,
      myColor,
      gameState,
      savedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY_ONLINE, JSON.stringify(data));
  } catch {
    // silently ignore
  }
}

export function loadOnlineSession(): OnlineSessionSave | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ONLINE);
    if (!raw) return null;

    const data = JSON.parse(raw) as OnlineSessionSave;

    // Discard saves older than 2 hours
    if (Date.now() - data.savedAt > 2 * 60 * 60 * 1000) {
      clearOnlineSession();
      return null;
    }

    if (!data.serverUrl || !data.roomId || !data.playerId) {
      clearOnlineSession();
      return null;
    }

    return data;
  } catch {
    clearOnlineSession();
    return null;
  }
}

export function clearOnlineSession(): void {
  localStorage.removeItem(STORAGE_KEY_ONLINE);
}
