import type { GameState, Move, Square } from "../types/chess";
import type { GameContext, GameController, DomElements } from "./types";
import { colorLabel } from "./types";
import {
  showCaptureBurst,
  showCheckEffect,
  showGameOverEffect,
  hideGameOverEffect
} from "../ui/effects";
import {
  saveLocalGame,
  loadLocalGame,
  clearLocalGame
} from "../storage/persistence";
import type { ChessEngine } from "../game/gameState";
import type { BoardView } from "../ui/boardView";

export class LocalController implements GameController {
  private currentState: GameState;
  private selectedSquare: Square | null = null;
  private legalMoves: Move[] = [];

  constructor(
    private readonly engine: ChessEngine,
    private readonly boardView: BoardView,
    private readonly dom: DomElements
  ) {
    this.currentState = engine.getState();
  }

  activate(): void {
    this.dom.onlineControls.hidden = true;
    this.dom.connectionBadge.hidden = true;
    this.dom.serverErrorRow.hidden = true;
    this.dom.appSubtitle.textContent = "本地双人国际象棋";

    // Try to restore a saved local game
    const localSave = loadLocalGame();
    if (localSave && localSave.gameState.moveHistory.length > 0) {
      this.currentState = this.engine.loadState(localSave.gameState);
      const moveCount = this.currentState.moveHistory.length;
      if (this.currentState.result) {
        this.setStatus(
          `已恢复对局（${moveCount} 步） — 对局已结束：${this.currentState.result.reason}`
        );
      } else {
        this.setStatus(`已恢复上次对局（${moveCount} 步），继续下棋吧！`);
      }
    }

    this.refreshView();
  }

  deactivate(): void {
    this.clearSelection();
  }

  handleSquareClick(square: Square): void {
    if (!this.isBoardInteractive()) {
      return;
    }

    const piece = this.currentState.board
      .flat()
      .find((entry) => entry?.square === square);

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
    this.setStatus(
      this.currentState.result
        ? `对局结束：${this.currentState.result.reason}`
        : ""
    );

    this.refreshView();
    this.triggerMoveEffects(result.move);
  }

  handleDragMove(from: Square, to: Square): void {
    if (!this.isBoardInteractive()) {
      return;
    }

    // Ensure the dragged piece belongs to the current turn
    const piece = this.currentState.board
      .flat()
      .find((entry) => entry?.square === from);
    if (!piece || piece.color !== this.currentState.turn) {
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
    this.setStatus(
      this.currentState.result
        ? `对局结束：${this.currentState.result.reason}`
        : ""
    );

    this.refreshView();
    this.triggerMoveEffects(result.move);
  }

  newGame(): void {
    this.currentState = this.engine.reset();
    this.clearSelection();
    hideGameOverEffect();
    clearLocalGame();
    this.setStatus("");
    this.refreshView();
  }

  getState(): GameState {
    return this.currentState;
  }

  // --- Private helpers ---

  private isBoardInteractive(): boolean {
    return !this.currentState.result;
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

    // Show check effect on the king square
    const boardGrid = this.dom.boardRoot.querySelector<HTMLElement>(".board-grid");
    if (boardGrid) {
      showCheckEffect(boardGrid, this.currentState);
    }

    // Auto-save
    this.persistCurrentGame();
  }

  private persistCurrentGame(): void {
    if (this.currentState.moveHistory.length > 0) {
      saveLocalGame(this.currentState);
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
}
