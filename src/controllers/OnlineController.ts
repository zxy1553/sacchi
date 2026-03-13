import type { GameState, Move, PlayerColor, Square, RoomState } from "../types/chess";
import type { GameController, DomElements } from "./types";
import { colorLabel } from "./types";
import {
  showCaptureBurst,
  showCheckEffect,
  showGameOverEffect,
  hideGameOverEffect
} from "../ui/effects";
import {
  saveOnlineSession,
  loadOnlineSession,
  clearOnlineSession
} from "../storage/persistence";
import { WsClient } from "../network/wsClient";
import type { ServerMessage, RoomListItem } from "../../server/types/messages";
import type { ChessEngine } from "../game/gameState";
import type { BoardView } from "../ui/boardView";

export class OnlineController implements GameController {
  private currentState: GameState;
  private selectedSquare: Square | null = null;
  private legalMoves: Move[] = [];
  private wsClient: WsClient | null = null;
  private myPlayerId: string | null = null;
  private myColor: PlayerColor | null = null;
  private currentRoomState: RoomState | null = null;

  constructor(
    private readonly engine: ChessEngine,
    private readonly boardView: BoardView,
    private readonly dom: DomElements
  ) {
    this.currentState = engine.getState();
    this.bindDomEvents();
  }

  activate(): void {
    this.dom.onlineControls.hidden = false;
    this.dom.connectionBadge.hidden = false;
    this.dom.serverErrorRow.hidden = true;
    this.dom.appSubtitle.textContent = "联机双人国际象棋";

    // Try to restore an online session
    const onlineSave = loadOnlineSession();
    if (onlineSave) {
      this.dom.serverUrlInput.value = onlineSave.serverUrl;
      this.currentState = this.engine.loadState(onlineSave.gameState);
      this.myPlayerId = onlineSave.playerId;
      this.myColor = onlineSave.myColor;
      this.setStatus("正在重新连接服务器…");
      this.refreshView();
    }

    // Auto-connect
    if (!this.wsClient || this.wsClient.connectionState !== "connected") {
      this.connectToServer();
    }

    this.refreshView();
  }

  deactivate(): void {
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
    this.resetOnlineState();
    this.clearSelection();
  }

  handleSquareClick(square: Square): void {
    if (!this.isBoardInteractive()) {
      return;
    }

    const piece = this.currentState.board
      .flat()
      .find((entry) => entry?.square === square);

    // In online mode, only allow clicking own pieces
    if (piece && piece.color !== this.myColor) {
      if (!this.selectedSquare) {
        return;
      }
      // Might be trying to capture — fall through to move logic
    }

    // Selecting a piece of the current turn's color
    if (piece && piece.color === this.currentState.turn) {
      this.selectedSquare = square;
      this.legalMoves = this.engine.getLegalMoves(square);
      this.refreshView();
      return;
    }

    if (!this.selectedSquare) {
      return;
    }

    const candidateMove = this.legalMoves.find((move) => move.to === square);
    if (!candidateMove) {
      this.clearSelection();
      this.refreshView();
      return;
    }

    const result = this.engine.attemptMove(candidateMove);
    if (!result.ok) {
      this.setStatus(result.reason);
      this.clearSelection();
      this.refreshView();
      return;
    }

    this.currentState = result.state;
    this.clearSelection();

    // Send move to server
    if (this.wsClient) {
      this.wsClient.sendMove(result.move, result.state);
      this.setStatus("等待对手…");
    }

    this.refreshView();
    this.triggerMoveEffects(result.move);
  }

  handleDragMove(from: Square, to: Square): void {
    if (!this.isBoardInteractive()) {
      return;
    }

    // In online mode, only allow dragging own pieces
    const piece = this.currentState.board
      .flat()
      .find((entry) => entry?.square === from);
    if (!piece || piece.color !== this.myColor) {
      return;
    }

    const legalMoves = this.engine.getLegalMoves(from);
    const candidateMove = legalMoves.find((move) => move.to === to);
    if (!candidateMove) {
      this.clearSelection();
      this.refreshView();
      return;
    }

    const result = this.engine.attemptMove(candidateMove);
    if (!result.ok) {
      this.setStatus(result.reason);
      this.clearSelection();
      this.refreshView();
      return;
    }

    this.currentState = result.state;
    this.clearSelection();

    // Send move to server
    if (this.wsClient) {
      this.wsClient.sendMove(result.move, result.state);
      this.setStatus("等待对手…");
    }

    this.refreshView();
    this.triggerMoveEffects(result.move);
  }

  newGame(): void {
    // In online mode, "new game" leaves current room and resets
    if (this.wsClient && this.currentRoomState) {
      this.wsClient.leaveRoom(this.currentRoomState.roomId);
    }

    this.resetOnlineState();
    clearOnlineSession();

    // Re-enable room buttons and show lobby if connected
    if (this.wsClient && this.wsClient.connectionState === "connected") {
      this.enableRoomButtons(true);
      this.dom.roomLobby.hidden = false;
      this.requestRoomList();
    }

    this.currentState = this.engine.reset();
    this.clearSelection();
    hideGameOverEffect();
    this.setStatus("");
    this.refreshView();
    this.updateRoomUI();
  }

  getState(): GameState {
    return this.currentState;
  }

  // --- DOM event bindings (called once in constructor) ---

  private bindDomEvents(): void {
    this.dom.connectButton.addEventListener("click", () => {
      this.connectToServer();
    });

    this.dom.refreshRoomsButton.addEventListener("click", () => {
      this.requestRoomList();
    });

    this.dom.createRoomButton.addEventListener("click", () => {
      if (!this.wsClient || this.wsClient.connectionState !== "connected") {
        return;
      }
      if (this.currentRoomState) {
        this.setStatus("你已在房间中，请先点击「重新开始」退出当前房间");
        return;
      }
      this.currentState = this.engine.reset();
      this.clearSelection();
      this.wsClient.createRoom("white");
    });

    this.dom.joinRoomButton.addEventListener("click", () => {
      if (!this.wsClient || this.wsClient.connectionState !== "connected") {
        return;
      }
      if (this.currentRoomState) {
        this.setStatus("你已在房间中，请先点击「重新开始」退出当前房间");
        return;
      }
      const roomId = this.dom.joinRoomInput.value.trim().toUpperCase();
      if (!roomId) {
        this.setStatus("请输入房间号（创建者会看到 6 位房间号，如 ABC123）");
        return;
      }
      this.wsClient.joinRoom(roomId);
    });

    this.dom.copyRoomIdButton.addEventListener("click", () => {
      const roomId = this.dom.roomIdValue.textContent ?? "";
      if (!roomId || roomId === "—") {
        return;
      }
      navigator.clipboard.writeText(roomId).then(
        () => this.setStatus(`房间号 ${roomId} 已复制到剪贴板，发给对手即可加入！`),
        () => {
          const range = document.createRange();
          range.selectNodeContents(this.dom.roomIdValue);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          this.setStatus(`请手动复制房间号：${roomId}`);
        }
      );
    });
  }

  // --- WebSocket ---

  private connectToServer(): void {
    const url = this.dom.serverUrlInput.value.trim();
    if (!url) {
      this.dom.serverUrlInput.value = `ws://${location.hostname}:8787`;
    }

    if (this.wsClient) {
      this.wsClient.disconnect();
    }

    this.dom.serverErrorRow.hidden = true;
    this.updateConnectionBadge("connecting");
    this.setStatus("正在连接服务器…");

    this.wsClient = new WsClient({
      url: this.dom.serverUrlInput.value.trim(),
      onMessage: (msg) => this.handleServerMessage(msg),
      onStateChange: (state) => {
        this.updateConnectionBadge(state);

        if (state === "connected") {
          this.enableRoomButtons(true);
          this.dom.serverErrorRow.hidden = true;
          this.setStatus("已连接到服务器，可以创建或加入房间了");
          this.dom.roomLobby.hidden = false;
          this.requestRoomList();
          if (this.wsClient && this.wsClient.currentRoomId) {
            this.wsClient.requestSync(this.wsClient.currentRoomId);
          }
        } else if (state === "disconnected") {
          this.enableRoomButtons(false);
          this.dom.roomLobby.hidden = true;
          this.dom.serverErrorText.textContent = `无法连接到 ${this.dom.serverUrlInput.value.trim()}`;
          this.dom.serverErrorRow.hidden = false;
          this.setStatus("连接已断开，请重试");
        } else if (state === "connecting") {
          this.setStatus("正在连接服务器…");
        }
      },
      onError: (error) => {
        this.dom.serverErrorText.textContent = `连接错误：${error}`;
        this.dom.serverErrorRow.hidden = false;
        this.setStatus("");
      }
    });

    this.wsClient.connect();
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "roomCreated": {
        this.myPlayerId = message.playerId;
        this.currentRoomState = message.payload.roomState;
        this.myColor =
          this.currentRoomState.players.find((p) => p.playerId === this.myPlayerId)
            ?.color ?? null;
        this.wsClient?.setPlayerContext(this.myPlayerId, this.currentRoomState.roomId);

        if (this.currentRoomState.gameState) {
          this.currentState = this.engine.loadState(this.currentRoomState.gameState);
        }

        this.dom.createRoomButton.disabled = true;
        this.dom.joinRoomButton.disabled = true;
        this.dom.roomLobby.hidden = true;

        this.updateRoomUI();
        this.clearSelection();
        this.setStatus(
          `房间已创建：${this.currentRoomState.roomId}，请将房间号发给对手，等待加入…`
        );
        this.refreshView();
        break;
      }

      case "roomJoined": {
        this.myPlayerId = message.playerId;
        this.currentRoomState = message.payload.roomState;
        this.myColor =
          this.currentRoomState.players.find((p) => p.playerId === this.myPlayerId)
            ?.color ?? null;
        this.wsClient?.setPlayerContext(this.myPlayerId, this.currentRoomState.roomId);

        if (this.currentRoomState.gameState) {
          this.currentState = this.engine.loadState(this.currentRoomState.gameState);
        }

        this.dom.createRoomButton.disabled = true;
        this.dom.joinRoomButton.disabled = true;
        this.dom.roomLobby.hidden = true;

        this.updateRoomUI();
        this.clearSelection();
        this.setStatus(`已加入房间：${this.currentRoomState.roomId}，对局开始！`);
        this.refreshView();
        break;
      }

      case "moveAccepted": {
        this.currentRoomState = message.payload.roomState;
        if (this.currentRoomState?.gameState) {
          this.currentState = this.engine.loadState(this.currentRoomState.gameState);
        }

        this.updateRoomUI();
        this.clearSelection();

        if (this.currentState.result) {
          this.setStatus(`对局结束：${this.currentState.result.reason}`);
        } else {
          this.setStatus("");
        }

        this.refreshView();

        if (this.currentState.lastMove) {
          this.triggerMoveEffects(this.currentState.lastMove);
        }
        break;
      }

      case "moveRejected": {
        this.setStatus(`走棋被拒绝：${message.payload.reason}`);
        this.clearSelection();
        this.refreshView();
        break;
      }

      case "stateSynced": {
        this.currentRoomState = message.payload.roomState;
        if (this.currentRoomState?.gameState) {
          this.currentState = this.engine.loadState(this.currentRoomState.gameState);
        }

        this.updateRoomUI();
        this.clearSelection();
        this.refreshView();
        break;
      }

      case "playerPresenceUpdated": {
        this.currentRoomState = message.payload.roomState;
        this.updateRoomUI();
        this.refreshView();

        if (this.currentRoomState.status === "playing") {
          this.setStatus("对手已加入，对局开始！");
        }
        break;
      }

      case "gameOver": {
        this.currentRoomState = message.payload.roomState;
        if (this.currentRoomState?.gameState) {
          this.currentState = this.engine.loadState(this.currentRoomState.gameState);
        }

        this.updateRoomUI();
        this.clearSelection();
        this.setStatus(`对局结束：${this.currentState.result?.reason ?? "未知"}`);
        this.refreshView();

        if (this.currentState.result) {
          setTimeout(() => showGameOverEffect(this.currentState), 350);
        }
        break;
      }

      case "error": {
        this.setStatus(`服务器错误：${message.payload.reason}`);
        break;
      }

      case "pong":
        break;

      case "roomList": {
        this.renderRoomList(message.payload.rooms);
        break;
      }
    }
  }

  // --- UI helpers ---

  private isBoardInteractive(): boolean {
    if (this.currentState.result) {
      return false;
    }
    if (!this.currentRoomState || this.currentRoomState.status !== "playing") {
      return false;
    }
    return this.myColor === this.currentState.turn;
  }

  private clearSelection(): void {
    this.selectedSquare = null;
    this.legalMoves = [];
  }

  private setStatus(text: string): void {
    this.dom.statusMessage.textContent = text;
  }

  private refreshView(): void {
    this.boardView.render(this.currentState, {
      selectedSquare: this.selectedSquare,
      legalMoves: this.legalMoves,
      interactive: this.isBoardInteractive()
    });

    this.dom.turnValue.textContent = colorLabel(this.currentState.turn);
    this.dom.resultValue.textContent =
      this.currentState.result?.reason ?? "进行中";

    const boardGrid = this.dom.boardRoot.querySelector<HTMLElement>(".board-grid");
    if (boardGrid) {
      showCheckEffect(boardGrid, this.currentState);
    }

    this.persistCurrentGame();
  }

  private persistCurrentGame(): void {
    if (this.currentRoomState && this.myPlayerId && this.myColor) {
      const serverUrl = this.dom.serverUrlInput.value.trim();
      saveOnlineSession(
        serverUrl,
        this.currentRoomState.roomId,
        this.myPlayerId,
        this.myColor,
        this.currentState
      );
    }
  }

  private triggerMoveEffects(move: Move): void {
    const boardGrid = this.dom.boardRoot.querySelector<HTMLElement>(".board-grid");

    if (boardGrid && move.captured) {
      showCaptureBurst(boardGrid, move.to);
    }

    if (this.currentState.result) {
      setTimeout(() => showGameOverEffect(this.currentState), 350);
    }
  }

  private resetOnlineState(): void {
    this.myPlayerId = null;
    this.myColor = null;
    this.currentRoomState = null;
    this.dom.roomInfoPanel.hidden = true;
    this.dom.createRoomButton.disabled = true;
    this.dom.joinRoomButton.disabled = true;
    this.updateConnectionBadge("disconnected");
  }

  private updateConnectionBadge(state: string): void {
    this.dom.connectionBadge.hidden = false;
    this.dom.connectionBadge.className = `connection-badge ${state}`;

    switch (state) {
      case "connected":
        this.dom.connectionBadge.textContent = "已连接";
        break;
      case "connecting":
        this.dom.connectionBadge.textContent = "连接中…";
        break;
      default:
        this.dom.connectionBadge.textContent = "未连接";
    }
  }

  private updateRoomUI(): void {
    if (!this.currentRoomState) {
      this.dom.roomInfoPanel.hidden = true;
      return;
    }

    this.dom.roomInfoPanel.hidden = false;
    this.dom.roomIdValue.textContent = this.currentRoomState.roomId;
    this.dom.copyRoomIdButton.hidden = false;
    this.dom.playerColorValue.textContent = this.myColor
      ? colorLabel(this.myColor)
      : "—";

    const opponent = this.currentRoomState.players.find(
      (p) => p.playerId !== this.myPlayerId
    );
    if (!opponent) {
      this.dom.opponentStatusValue.textContent = "等待对手加入…";
    } else {
      this.dom.opponentStatusValue.textContent = opponent.connected ? "在线" : "离线";
    }
  }

  private enableRoomButtons(enabled: boolean): void {
    this.dom.createRoomButton.disabled = !enabled;
    this.dom.joinRoomButton.disabled = !enabled;
  }

  private requestRoomList(): void {
    if (this.wsClient && this.wsClient.connectionState === "connected") {
      this.wsClient.listRooms();
    }
  }

  private renderRoomList(rooms: RoomListItem[]): void {
    this.dom.roomListContainer.innerHTML = "";

    if (rooms.length === 0) {
      this.dom.roomListContainer.innerHTML =
        '<p class="room-list-empty">暂无房间，点击「创建新房间」开始对局</p>';
      return;
    }

    for (const room of rooms) {
      const item = document.createElement("div");
      item.className = "room-list-item";

      const statusLabel = room.status === "waiting" ? "等待中" : "对局中";
      const statusClass =
        room.status === "waiting" ? "room-status-waiting" : "room-status-playing";
      const canJoin =
        room.status === "waiting" && room.playerCount < 2 && !this.currentRoomState;

      item.innerHTML = `
        <span class="room-id">${room.roomId}</span>
        <span class="room-meta">
          <span class="${statusClass}">${statusLabel}</span>
          · ${room.playerCount}/2 人
        </span>
        <button class="join-btn" ${canJoin ? "" : "disabled"}>${canJoin ? "加入" : room.playerCount >= 2 ? "已满" : "对局中"}</button>
      `;

      const joinBtn = item.querySelector<HTMLButtonElement>(".join-btn")!;
      if (canJoin) {
        joinBtn.addEventListener("click", () => {
          if (this.wsClient && this.wsClient.connectionState === "connected") {
            this.wsClient.joinRoom(room.roomId);
          }
        });
      }

      this.dom.roomListContainer.appendChild(item);
    }
  }
}
