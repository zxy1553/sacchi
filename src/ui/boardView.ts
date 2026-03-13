import { FILES, RANKS, type GameState, type Move, type Square } from "../types/chess";
import { PIECE_SVG, PIECE_SYMBOLS } from "../game/constants";

interface RenderOptions {
  selectedSquare: Square | null;
  legalMoves: Move[];
  interactive: boolean;
}

export class BoardView {
  private boardGrid: HTMLDivElement;
  private dragSourceSquare: Square | null = null;

  constructor(
    container: HTMLElement,
    private readonly onSquareClick: (square: Square) => void,
    private readonly onDragMove?: (from: Square, to: Square) => void
  ) {
    this.boardGrid = document.createElement("div");
    this.boardGrid.className = "board-grid";
    container.replaceChildren(this.boardGrid);

    // Prevent default dragover on the board grid so drop events fire
    this.boardGrid.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
    });

    // Handle drop on the board grid (delegated)
    this.boardGrid.addEventListener("drop", (e) => {
      e.preventDefault();
      this.clearDropTargetHighlights();

      const from = this.dragSourceSquare;
      if (!from) return;

      // Find the square button that was dropped on
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-square]");
      if (!target) return;

      const to = target.dataset.square as Square;
      if (from === to) return;

      this.onDragMove?.(from, to);
      this.dragSourceSquare = null;
    });
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

          // Enable drag on interactive pieces of the current turn
          if (options.interactive && piece.color === state.turn) {
            button.draggable = true;

            button.addEventListener("dragstart", (e) => {
              this.dragSourceSquare = square;
              button.classList.add("dragging");

              // Create a custom drag image from the piece
              if (e.dataTransfer) {
                const ghost = img.cloneNode(true) as HTMLImageElement;
                ghost.style.width = "60px";
                ghost.style.height = "60px";
                ghost.style.position = "absolute";
                ghost.style.top = "-9999px";
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 30, 30);
                e.dataTransfer.effectAllowed = "move";
                // Clean up ghost element after a frame
                requestAnimationFrame(() => ghost.remove());
              }

              // Auto-select the piece to show legal moves
              this.onSquareClick(square);
            });

            button.addEventListener("dragend", () => {
              button.classList.remove("dragging");
              this.dragSourceSquare = null;
              this.clearDropTargetHighlights();
            });
          } else {
            img.draggable = false;
          }

          button.append(img);
        }

        // Allow squares to be drop targets — highlight on dragenter/dragleave
        button.addEventListener("dragenter", (e) => {
          e.preventDefault();
          if (this.dragSourceSquare && square !== this.dragSourceSquare) {
            button.classList.add("drop-target");
          }
        });

        button.addEventListener("dragleave", () => {
          button.classList.remove("drop-target");
        });

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

  private clearDropTargetHighlights(): void {
    this.boardGrid.querySelectorAll(".drop-target").forEach((el) => {
      el.classList.remove("drop-target");
    });
  }
}
