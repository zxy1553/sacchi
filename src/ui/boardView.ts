import { FILES, RANKS, type GameState, type Move, type Square } from "../types/chess";
import { PIECE_SVG, PIECE_SYMBOLS } from "../game/constants";

interface RenderOptions {
  selectedSquare: Square | null;
  legalMoves: Move[];
  interactive: boolean;
}

export class BoardView {
  private boardGrid: HTMLDivElement;

  constructor(
    container: HTMLElement,
    private readonly onSquareClick: (square: Square) => void
  ) {
    this.boardGrid = document.createElement("div");
    this.boardGrid.className = "board-grid";
    container.replaceChildren(this.boardGrid);
  }

  render(state: GameState, options: RenderOptions): void {
    const legalTargets = new Set(options.legalMoves.map((move) => move.to));
    const lastMoveSquares = new Set(
      state.lastMove ? [state.lastMove.from, state.lastMove.to] : []
    );

    this.boardGrid.replaceChildren();

    state.board.forEach((rank, rankIndex) => {
      rank.forEach((piece, fileIndex) => {
        const square = `${FILES[fileIndex]}${RANKS[rankIndex]}` as Square;
        const button = document.createElement("button");
        const isLight = (rankIndex + fileIndex) % 2 === 0;
        button.type = "button";
        button.className = `square ${isLight ? "light" : "dark"}`;
        button.dataset.square = square;

        if (!options.interactive) {
          button.classList.add("disabled");
        }
        if (options.selectedSquare === square) {
          button.classList.add("selected");
        }
        if (legalTargets.has(square)) {
          button.classList.add("target");
        }
        if (lastMoveSquares.has(square)) {
          button.classList.add("last-move");
        }

        button.addEventListener("click", () => this.onSquareClick(square));

        if (piece) {
          const img = document.createElement("img");
          img.src = PIECE_SVG[piece.color][piece.type];
          img.alt = PIECE_SYMBOLS[piece.color][piece.type];
          img.className = "piece-img";
          img.draggable = false;
          button.append(img);
        }

        // Coordinate labels on edges
        if (rankIndex === 7) {
          const label = document.createElement("span");
          label.className = "file-label";
          label.textContent = FILES[fileIndex];
          button.append(label);
        }

        if (fileIndex === 0) {
          const label = document.createElement("span");
          label.className = "rank-label";
          label.textContent = RANKS[rankIndex];
          button.append(label);
        }

        this.boardGrid.append(button);
      });
    });
  }
}
