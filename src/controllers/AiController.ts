import type { GameState, Move, PlayerColor, PromotionPiece, Square } from "../types/chess";
import type { GameController, DomElements } from "./types";
import { colorLabel } from "./types";
import {
  showCaptureBurst,
  showCheckEffect,
  showGameOverEffect,
  hideGameOverEffect
} from "../ui/effects";
import { saveLocalGame, clearLocalGame } from "../storage/persistence";
import type { ChessEngine } from "../game/gameState";
import type { BoardView } from "../ui/boardView";
import { StockfishEngine } from "../engine/stockfishEngine";

export type AiDifficulty = "easy" | "medium" | "hard";

/** Map UCI promotion chars to our PromotionPiece type. */
const UCI_PROMO_MAP: Record<string, PromotionPiece> = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

/**
 * Parse a UCI move string (e.g. "e2e4", "e7e8q") into a partial Move.
 */
function parseUciMove(uci: string): { from: Square; to: Square; promotion?: PromotionPiece } {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promoChar = uci[4];
  return {
    from,
    to,
    promotion: promoChar ? UCI_PROMO_MAP[promoChar] : undefined,
  };
}

/**
 * AiController — handles human-vs-AI mode.
 *
 * Uses Stockfish WASM engine for move computation.
 */
export class AiController implements GameController {
  private currentState: GameState;
  private selectedSquare: Square | null = null;
  private legalMoves: Move[] = [];
  private playerColor: PlayerColor = "white";
  private difficulty: AiDifficulty = "medium";
  private aiThinking = false;
  private gameStarted = false;
  private stockfish: StockfishEngine | null = null;
  private stockfishReady = false;
  private boundStartGame: () => void;

  constructor(
    private readonly engine: ChessEngine,
    private readonly boardView: BoardView,
    private readonly dom: DomElements
  ) {
    this.currentState = engine.getState();
    this.boundStartGame = () => this.startGame();
  }

  activate(): void {
    this.dom.onlineControls.hidden = true;
    this.dom.connectionBadge.hidden = true;
    this.dom.serverErrorRow.hidden = true;
    this.dom.appSubtitle.textContent = "人机对弈国际象棋";
    this.dom.roomInfoPanel.hidden = true;

    // Show AI settings panel
    this.dom.aiControls.hidden = false;
    this.dom.startAiGameButton.addEventListener("click", this.boundStartGame);

    // Reset to settings screen
    this.gameStarted = false;
    this.currentState = this.engine.reset();
    this.clearSelection();
    this.setStatus("请选择难度和执棋方，然后点击「开始对弈」");
    this.refreshView();
  }

  deactivate(): void {
    this.aiThinking = false;
    this.gameStarted = false;
    this.clearSelection();
    this.disposeStockfish();

    // Hide AI settings panel and unbind event
    this.dom.aiControls.hidden = true;
    this.dom.startAiGameButton.removeEventListener("click", this.boundStartGame);
  }

  handleSquareClick(square: Square): void {
    if (!this.isBoardInteractive() || !this.gameStarted) {
      return;
    }

    const piece = this.currentState.board
      .flat()
      .find((entry) => entry?.square === square);

    // Only allow selecting player's own pieces
    if (piece && piece.color === this.playerColor && piece.color === this.currentState.turn) {
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

    if (this.currentState.result) {
      this.setStatus(`对局结束：${this.currentState.result.reason}`);
    } else {
      this.setStatus("");
    }

    this.refreshView();
    this.triggerMoveEffects(result.move);

    // If game is not over, let AI make its move
    if (!this.currentState.result) {
      this.scheduleAiMove();
    }
  }

  handleDragMove(from: Square, to: Square): void {
    if (!this.isBoardInteractive() || !this.gameStarted) {
      return;
    }

    // Only allow dragging player's own pieces
    const piece = this.currentState.board
      .flat()
      .find((entry) => entry?.square === from);
    if (!piece || piece.color !== this.playerColor || piece.color !== this.currentState.turn) {
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

    if (this.currentState.result) {
      this.setStatus(`对局结束：${this.currentState.result.reason}`);
    } else {
      this.setStatus("");
    }

    this.refreshView();
    this.triggerMoveEffects(result.move);

    // If game is not over, let AI make its move
    if (!this.currentState.result) {
      this.scheduleAiMove();
    }
  }

  newGame(): void {
    this.aiThinking = false;
    this.gameStarted = false;
    this.currentState = this.engine.reset();
    this.clearSelection();
    hideGameOverEffect();
    clearLocalGame();

    // Return to settings screen
    this.dom.aiControls.hidden = false;
    this.setStatus("请选择难度和执棋方，然后点击「开始对弈」");
    this.refreshView();
  }

  // --- Start game from settings panel ---

  private startGame(): void {
    // Read settings from UI
    this.difficulty = this.dom.aiDifficultySelect.value as AiDifficulty;
    this.playerColor = this.dom.playerColorSelect.value as PlayerColor;

    // Hide settings panel
    this.dom.aiControls.hidden = true;
    this.gameStarted = true;

    // Start a fresh game
    this.currentState = this.engine.reset();
    this.clearSelection();
    hideGameOverEffect();
    clearLocalGame();

    this.setStatus("正在加载 Stockfish 引擎…");
    this.refreshView();

    // Boot Stockfish WASM, then start the game
    this.initStockfish().then(() => {
      if (!this.gameStarted) return; // deactivated while loading

      const colorText = this.playerColor === "white" ? "白方先行" : "黑方";
      this.setStatus(`人机模式：你执${colorText}，开始对弈吧！`);
      this.refreshView();

      // If player chose black, AI (white) goes first
      if (this.playerColor === "black") {
        this.scheduleAiMove();
      }
    });
  }

  getState(): GameState {
    return this.currentState;
  }

  // --- Stockfish lifecycle ---

  private async initStockfish(): Promise<void> {
    this.disposeStockfish();
    try {
      this.stockfish = new StockfishEngine();
      await this.stockfish.init();
      this.stockfish.setDifficulty(this.difficulty);
      this.stockfishReady = true;
    } catch (err) {
      console.error("Failed to initialise Stockfish:", err);
      this.setStatus("Stockfish 加载失败，请刷新重试");
    }
  }

  private disposeStockfish(): void {
    this.stockfishReady = false;
    this.stockfish?.dispose();
    this.stockfish = null;
  }

  // --- AI move logic ---

  private async scheduleAiMove(): Promise<void> {
    this.aiThinking = true;
    this.setStatus("AI 思考中…");
    this.refreshView();

    try {
      if (!this.stockfish || !this.stockfishReady) {
        throw new Error("Stockfish not ready");
      }

      const uciMove = await this.stockfish.computeMove(this.currentState.fen);

      // Guard: controller may have been deactivated while Stockfish was thinking
      if (!this.aiThinking) return;

      if (!uciMove) {
        this.aiThinking = false;
        return;
      }

      // Convert UCI move string to our Move type
      const parsed = parseUciMove(uciMove);

      // Find the matching legal move so we get SAN, captured info, etc.
      const legalMoves = this.engine.getLegalMoves(parsed.from);
      const aiMove = legalMoves.find(
        (m) =>
          m.from === parsed.from &&
          m.to === parsed.to &&
          (m.promotion ?? null) === (parsed.promotion ?? null)
      );

      if (!aiMove) {
        // Fallback: attempt the raw parsed move
        const fallback: Move = { from: parsed.from, to: parsed.to, promotion: parsed.promotion };
        const result = this.engine.attemptMove(fallback);
        if (!result.ok) {
          this.aiThinking = false;
          this.setStatus("AI 走法异常");
          this.refreshView();
          return;
        }
        this.currentState = result.state;
        this.triggerMoveEffects(result.move);
      } else {
        const result = this.engine.attemptMove(aiMove);
        if (!result.ok) {
          this.aiThinking = false;
          return;
        }
        this.currentState = result.state;
        this.triggerMoveEffects(result.move);
      }

      this.aiThinking = false;

      if (this.currentState.result) {
        this.setStatus(`对局结束：${this.currentState.result.reason}`);
      } else {
        this.setStatus("");
      }

      this.refreshView();
    } catch (err) {
      console.error("Stockfish move error:", err);
      this.aiThinking = false;
      this.setStatus("AI 出错，请重试");
      this.refreshView();
    }
  }

  // --- Private helpers ---

  private isBoardInteractive(): boolean {
    if (this.currentState.result) {
      return false;
    }
    if (this.aiThinking) {
      return false;
    }
    // Only interactive when it's the human player's turn
    return this.currentState.turn === this.playerColor;
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

    // Auto-save
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
