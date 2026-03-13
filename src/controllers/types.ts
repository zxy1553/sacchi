import type { GameState, Move, PlayerColor, Square } from "../types/chess";
import type { ChessEngine } from "../game/gameState";
import type { BoardView } from "../ui/boardView";

// --- Mode ---

export type Mode = "local" | "ai" | "online";

// --- Shared DOM references ---

export interface DomElements {
  modeSelect: HTMLSelectElement;
  onlineControls: HTMLElement;
  connectionBadge: HTMLElement;
  serverUrlInput: HTMLInputElement;
  connectButton: HTMLButtonElement;
  serverErrorRow: HTMLElement;
  serverErrorText: HTMLElement;
  createRoomButton: HTMLButtonElement;
  joinRoomInput: HTMLInputElement;
  joinRoomButton: HTMLButtonElement;
  roomLobby: HTMLElement;
  roomListContainer: HTMLElement;
  refreshRoomsButton: HTMLButtonElement;
  roomInfoPanel: HTMLElement;
  roomIdValue: HTMLElement;
  playerColorValue: HTMLElement;
  opponentStatusValue: HTMLElement;
  copyRoomIdButton: HTMLButtonElement;
  aiControls: HTMLElement;
  aiDifficultySelect: HTMLSelectElement;
  playerColorSelect: HTMLSelectElement;
  startAiGameButton: HTMLButtonElement;
  newGameButton: HTMLButtonElement;
  turnValue: HTMLElement;
  resultValue: HTMLElement;
  statusMessage: HTMLElement;
  boardRoot: HTMLElement;
  appSubtitle: HTMLElement;
}

// --- Game context shared across controllers ---

export interface GameContext {
  engine: ChessEngine;
  boardView: BoardView;
  dom: DomElements;
  currentState: GameState;
  selectedSquare: Square | null;
  legalMoves: Move[];
}

// --- Controller interface ---

export interface GameController {
  /** Called when this controller becomes active */
  activate(): void;
  /** Called when switching away from this controller */
  deactivate(): void;
  /** Handle a square click on the board */
  handleSquareClick(square: Square): void;
  /** Handle a drag-and-drop move from one square to another */
  handleDragMove(from: Square, to: Square): void;
  /** Start a new game */
  newGame(): void;
  /** Get the current game state */
  getState(): GameState;
}

// --- Shared helpers ---

export const colorLabel = (c: PlayerColor): string =>
  c === "white" ? "白方" : "黑方";
