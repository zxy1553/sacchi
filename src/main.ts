import "./../styles.css";
import { ChessEngine } from "./game/gameState";
import { BoardView } from "./ui/boardView";
import { WsClient } from "./network/wsClient";
import type { ServerMessage } from "../server/types/messages";
import type { Move, PlayerColor, RoomState, Square } from "./types/chess";

type Mode = "local" | "online";

// --- DOM helpers ---

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

// --- Elements ---

const modeSelect = requireElement<HTMLSelectElement>("#mode-select");
const onlineControls = requireElement<HTMLElement>("#online-controls");
const connectionBadge = requireElement<HTMLElement>("#connection-status");
const serverUrlInput = requireElement<HTMLInputElement>("#server-url");
const connectButton = requireElement<HTMLButtonElement>("#connect-button");
const createRoomButton = requireElement<HTMLButtonElement>("#create-room-button");
const joinRoomInput = requireElement<HTMLInputElement>("#join-room-input");
const joinRoomButton = requireElement<HTMLButtonElement>("#join-room-button");
const roomInfoPanel = requireElement<HTMLElement>("#room-info");
const roomIdValue = requireElement<HTMLElement>("#room-id-value");
const playerColorValue = requireElement<HTMLElement>("#player-color-value");
const opponentStatusValue = requireElement<HTMLElement>("#opponent-status-value");
const copyRoomIdButton = requireElement<HTMLButtonElement>("#copy-room-id");
const newGameButton = requireElement<HTMLButtonElement>("#new-game-button");
const turnValue = requireElement<HTMLElement>("#turn-value");
const resultValue = requireElement<HTMLElement>("#result-value");
const statusMessage = requireElement<HTMLElement>("#status-message");
const boardRoot = requireElement<HTMLElement>("#board-root");
const appSubtitle = requireElement<HTMLElement>("#app-subtitle");

// --- State ---

const engine = new ChessEngine();
const boardView = new BoardView(boardRoot, handleSquareClick);

let mode: Mode = "local";
let wsClient: WsClient | null = null;
let selectedSquare: Square | null = null;
let legalMoves: Move[] = [];
let currentState = engine.reset();

// Online-specific state
let myPlayerId: string | null = null;
let myColor: PlayerColor | null = null;
let currentRoomState: RoomState | null = null;

// --- UI helpers ---

function setStatus(text: string): void {
  statusMessage.textContent = text;
}

function clearSelection(): void {
  selectedSquare = null;
  legalMoves = [];
}

const colorLabel = (c: PlayerColor) => (c === "white" ? "白方" : "黑方");

function refreshView(): void {
  boardView.render(currentState, {
    selectedSquare,
    legalMoves,
    interactive: isBoardInteractive()
  });

  turnValue.textContent = colorLabel(currentState.turn);
  resultValue.textContent = currentState.result?.reason ?? "进行中";
}

function isBoardInteractive(): boolean {
  if (currentState.result) {
    return false;
  }

  if (mode === "online") {
    // Must have a room, and it must be our turn
    if (!currentRoomState || currentRoomState.status !== "playing") {
      return false;
    }

    return myColor === currentState.turn;
  }

  return true;
}

// --- Mode switching ---

function setMode(newMode: Mode): void {
  mode = newMode;
  const isOnline = newMode === "online";

  onlineControls.hidden = !isOnline;
  connectionBadge.hidden = !isOnline;
  appSubtitle.textContent = isOnline ? "联机双人国际象棋" : "本地双人国际象棋";

  if (!isOnline && wsClient) {
    wsClient.disconnect();
    wsClient = null;
    resetOnlineState();
  }

  refreshView();
}

function resetOnlineState(): void {
  myPlayerId = null;
  myColor = null;
  currentRoomState = null;
  roomInfoPanel.hidden = true;
  createRoomButton.disabled = true;
  joinRoomButton.disabled = true;
  updateConnectionBadge("disconnected");
}

function updateConnectionBadge(state: string): void {
  connectionBadge.hidden = mode !== "online";
  connectionBadge.className = `connection-badge ${state}`;

  switch (state) {
    case "connected":
      connectionBadge.textContent = "已连接";
      break;
    case "connecting":
      connectionBadge.textContent = "连接中…";
      break;
    default:
      connectionBadge.textContent = "未连接";
  }
}

function updateRoomUI(): void {
  if (!currentRoomState) {
    roomInfoPanel.hidden = true;
    return;
  }

  roomInfoPanel.hidden = false;
  roomIdValue.textContent = currentRoomState.roomId;
  copyRoomIdButton.hidden = false;
  playerColorValue.textContent = myColor ? colorLabel(myColor) : "—";

  const opponent = currentRoomState.players.find((p) => p.playerId !== myPlayerId);
  if (!opponent) {
    opponentStatusValue.textContent = "等待对手加入…";
  } else {
    opponentStatusValue.textContent = opponent.connected ? "在线" : "离线";
  }
}

function enableRoomButtons(enabled: boolean): void {
  createRoomButton.disabled = !enabled;
  joinRoomButton.disabled = !enabled;
}

// --- WebSocket ---

function connectToServer(): void {
  const url = serverUrlInput.value.trim();
  if (!url) {
    setStatus("请输入服务器地址");
    return;
  }

  if (wsClient) {
    wsClient.disconnect();
  }

  wsClient = new WsClient({
    url,
    onMessage: handleServerMessage,
    onStateChange: (state) => {
      updateConnectionBadge(state);

      if (state === "connected") {
        enableRoomButtons(true);
        setStatus("已连接到服务器");
        connectButton.textContent = "断开";
      } else if (state === "disconnected") {
        enableRoomButtons(false);
        setStatus("已断开连接");
        connectButton.textContent = "连接";
      }
    },
    onError: (error) => {
      setStatus(`错误：${error}`);
    }
  });

  wsClient.connect();
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case "roomCreated": {
      myPlayerId = message.playerId;
      currentRoomState = message.payload.roomState;
      myColor =
        currentRoomState.players.find((p) => p.playerId === myPlayerId)?.color ?? null;
      wsClient?.setPlayerContext(myPlayerId, currentRoomState.roomId);

      // Load the game state from room
      if (currentRoomState.gameState) {
        currentState = engine.loadState(currentRoomState.gameState);
      }

      // Disable room buttons after creating
      createRoomButton.disabled = true;
      joinRoomButton.disabled = true;

      updateRoomUI();
      clearSelection();
      setStatus(`房间已创建：${currentRoomState.roomId}，请将房间号发给对手，等待加入…`);
      refreshView();
      break;
    }

    case "roomJoined": {
      myPlayerId = message.playerId;
      currentRoomState = message.payload.roomState;
      myColor =
        currentRoomState.players.find((p) => p.playerId === myPlayerId)?.color ?? null;
      wsClient?.setPlayerContext(myPlayerId, currentRoomState.roomId);

      if (currentRoomState.gameState) {
        currentState = engine.loadState(currentRoomState.gameState);
      }

      // Disable room buttons after joining
      createRoomButton.disabled = true;
      joinRoomButton.disabled = true;

      updateRoomUI();
      clearSelection();
      setStatus(`已加入房间：${currentRoomState.roomId}，对局开始！`);
      refreshView();
      break;
    }

    case "moveAccepted": {
      currentRoomState = message.payload.roomState;
      if (currentRoomState?.gameState) {
        currentState = engine.loadState(currentRoomState.gameState);
      }

      updateRoomUI();
      clearSelection();

      if (currentState.result) {
        setStatus(`对局结束：${currentState.result.reason}`);
      } else {
        setStatus("");
      }

      refreshView();
      break;
    }

    case "moveRejected": {
      setStatus(`走棋被拒绝：${message.payload.reason}`);
      clearSelection();
      refreshView();
      break;
    }

    case "stateSynced": {
      currentRoomState = message.payload.roomState;
      if (currentRoomState?.gameState) {
        currentState = engine.loadState(currentRoomState.gameState);
      }

      updateRoomUI();
      clearSelection();
      refreshView();
      break;
    }

    case "playerPresenceUpdated": {
      currentRoomState = message.payload.roomState;
      updateRoomUI();
      refreshView();

      // Check if game just became "playing" (opponent joined)
      if (currentRoomState.status === "playing") {
        setStatus("对手已加入，对局开始！");
      }

      break;
    }

    case "gameOver": {
      currentRoomState = message.payload.roomState;
      if (currentRoomState?.gameState) {
        currentState = engine.loadState(currentRoomState.gameState);
      }

      updateRoomUI();
      clearSelection();
      setStatus(`对局结束：${currentState.result?.reason ?? "未知"}`);
      refreshView();
      break;
    }

    case "error": {
      setStatus(`服务器错误：${message.payload.reason}`);
      break;
    }

    case "pong":
      break;
  }
}

// --- Board interaction ---

function handleSquareClick(square: Square): void {
  if (!isBoardInteractive()) {
    return;
  }

  const piece = currentState.board.flat().find((entry) => entry?.square === square);

  // In online mode, only allow clicking own pieces
  if (mode === "online" && piece && piece.color !== myColor) {
    if (!selectedSquare) {
      return;
    }
    // But we might be trying to capture — fall through to move logic
  }

  // Selecting a piece of the current turn's color
  if (piece && piece.color === currentState.turn) {
    selectedSquare = square;
    legalMoves = engine.getLegalMoves(square);
    refreshView();
    return;
  }

  if (!selectedSquare) {
    return;
  }

  const candidateMove = legalMoves.find((move) => move.to === square);
  if (!candidateMove) {
    clearSelection();
    refreshView();
    return;
  }

  const result = engine.attemptMove(candidateMove);
  if (!result.ok) {
    setStatus(result.reason);
    clearSelection();
    refreshView();
    return;
  }

  currentState = result.state;
  clearSelection();

  if (mode === "online" && wsClient) {
    // Send move to server
    wsClient.sendMove(result.move, result.state);
    setStatus("等待对手…");
  } else {
    setStatus(currentState.result ? `对局结束：${currentState.result.reason}` : "");
  }

  refreshView();
}

// --- Event bindings ---

modeSelect.addEventListener("change", () => {
  setMode(modeSelect.value as Mode);
});

connectButton.addEventListener("click", () => {
  if (wsClient && wsClient.connectionState === "connected") {
    wsClient.disconnect();
    wsClient = null;
    resetOnlineState();
    setStatus("");
  } else {
    connectToServer();
  }
});

createRoomButton.addEventListener("click", () => {
  if (!wsClient || wsClient.connectionState !== "connected") {
    return;
  }

  // Prevent creating room if already in one
  if (currentRoomState) {
    setStatus("你已在房间中，请先点击「重新开始」退出当前房间");
    return;
  }

  // Reset engine for new game
  currentState = engine.reset();
  clearSelection();
  wsClient.createRoom("white");
});

joinRoomButton.addEventListener("click", () => {
  if (!wsClient || wsClient.connectionState !== "connected") {
    return;
  }

  // Prevent joining room if already in one
  if (currentRoomState) {
    setStatus("你已在房间中，请先点击「重新开始」退出当前房间");
    return;
  }

  const roomId = joinRoomInput.value.trim().toUpperCase();
  if (!roomId) {
    setStatus("请输入房间号（创建者会看到 6 位房间号，如 ABC123）");
    return;
  }

  wsClient.joinRoom(roomId);
});

// Copy room ID to clipboard
copyRoomIdButton.addEventListener("click", () => {
  const roomId = roomIdValue.textContent ?? "";
  if (!roomId || roomId === "—") {
    return;
  }

  navigator.clipboard.writeText(roomId).then(
    () => setStatus(`房间号 ${roomId} 已复制到剪贴板，发给对手即可加入！`),
    () => {
      // Fallback: select text for manual copy
      const range = document.createRange();
      range.selectNodeContents(roomIdValue);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus(`请手动复制房间号：${roomId}`);
    }
  );
});

newGameButton.addEventListener("click", () => {
  if (mode === "online") {
    // In online mode, "new game" leaves current room and resets
    if (wsClient && currentRoomState) {
      wsClient.leaveRoom(currentRoomState.roomId);
    }

    resetOnlineState();
  }

  currentState = engine.reset();
  clearSelection();
  setStatus("");
  refreshView();
  updateRoomUI();
});

// --- Init ---
refreshView();
