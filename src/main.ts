import "./../styles.css";
import { ChessEngine } from "./game/gameState";
import { BoardView } from "./ui/boardView";
import { LocalController } from "./controllers/LocalController";
import { OnlineController } from "./controllers/OnlineController";
import { AiController } from "./controllers/AiController";
import type { Mode, DomElements, GameController } from "./controllers/types";

// --- DOM helpers ---

function requireElement<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required element: ${selector}`);
  return el;
}

// --- Collect all DOM references ---

const dom: DomElements = {
  modeSelect: requireElement<HTMLSelectElement>("#mode-select"),
  onlineControls: requireElement<HTMLElement>("#online-controls"),
  connectionBadge: requireElement<HTMLElement>("#connection-status"),
  serverUrlInput: requireElement<HTMLInputElement>("#server-url"),
  connectButton: requireElement<HTMLButtonElement>("#connect-button"),
  serverErrorRow: requireElement<HTMLElement>("#server-error-row"),
  serverErrorText: requireElement<HTMLElement>("#server-error-text"),
  createRoomButton: requireElement<HTMLButtonElement>("#create-room-button"),
  joinRoomInput: requireElement<HTMLInputElement>("#join-room-input"),
  joinRoomButton: requireElement<HTMLButtonElement>("#join-room-button"),
  roomLobby: requireElement<HTMLElement>("#room-lobby"),
  roomListContainer: requireElement<HTMLElement>("#room-list"),
  refreshRoomsButton: requireElement<HTMLButtonElement>("#refresh-rooms-button"),
  roomInfoPanel: requireElement<HTMLElement>("#room-info"),
  roomIdValue: requireElement<HTMLElement>("#room-id-value"),
  playerColorValue: requireElement<HTMLElement>("#player-color-value"),
  opponentStatusValue: requireElement<HTMLElement>("#opponent-status-value"),
  copyRoomIdButton: requireElement<HTMLButtonElement>("#copy-room-id"),
  aiControls: requireElement<HTMLElement>("#ai-controls"),
  aiDifficultySelect: requireElement<HTMLSelectElement>("#ai-difficulty"),
  playerColorSelect: requireElement<HTMLSelectElement>("#player-color"),
  startAiGameButton: requireElement<HTMLButtonElement>("#start-ai-game"),
  newGameButton: requireElement<HTMLButtonElement>("#new-game-button"),
  turnValue: requireElement<HTMLElement>("#turn-value"),
  resultValue: requireElement<HTMLElement>("#result-value"),
  statusMessage: requireElement<HTMLElement>("#status-message"),
  boardRoot: requireElement<HTMLElement>("#board-root"),
  appSubtitle: requireElement<HTMLElement>("#app-subtitle"),
};

// --- Core instances ---

const engine = new ChessEngine();

// The board click handler is a thin trampoline into the active controller
let activeController: GameController | null = null;

const boardView = new BoardView(
  dom.boardRoot,
  (square) => {
    activeController?.handleSquareClick(square);
  },
  (from, to) => {
    activeController?.handleDragMove(from, to);
  }
);

// --- Controllers (lazy-created, one per mode) ---

const controllers: Record<Mode, GameController> = {
  local: new LocalController(engine, boardView, dom),
  ai: new AiController(engine, boardView, dom),
  online: new OnlineController(engine, boardView, dom),
};

// --- Mode switching ---

function switchMode(newMode: Mode): void {
  // Deactivate the previous controller
  activeController?.deactivate();

  // Activate the new one
  activeController = controllers[newMode];
  activeController.activate();
}

// --- Event bindings ---

dom.modeSelect.addEventListener("change", () => {
  switchMode(dom.modeSelect.value as Mode);
});

dom.newGameButton.addEventListener("click", () => {
  activeController?.newGame();
});

// --- Init ---

switchMode((dom.modeSelect.value as Mode) || "local");
