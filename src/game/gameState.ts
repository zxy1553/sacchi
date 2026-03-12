import { Chess } from "chess.js";
import type { Piece, Square as ChessJsSquare } from "chess.js";
import { buildGameSummary } from "./checkLogic";
import { STANDARD_START_FEN } from "./constants";
import { getLegalMovesForSquare, isMoveLegal, normalizeMove } from "./moveRules";
import type {
  BoardPiece,
  GameState,
  GameStateSummary,
  Move,
  PieceType,
  Square
} from "../types/chess";

const promotionMap = {
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n"
} as const;

function toPieceType(type: Piece["type"]): PieceType {
  const map: Record<Piece["type"], PieceType> = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king"
  };

  return map[type];
}

function serializeBoard(chess: Chess): (BoardPiece | null)[][] {
  return chess.board().map((rank) =>
    rank.map((piece) => {
      if (!piece) {
        return null;
      }

      return {
        square: piece.square as Square,
        type: toPieceType(piece.type),
        color: piece.color === "w" ? "white" : "black"
      };
    })
  );
}

export class ChessEngine {
  private chess: Chess;
  private moveHistory: Move[];
  private lastMove: Move | null;

  constructor(initialFen = STANDARD_START_FEN) {
    this.chess = new Chess(initialFen);
    this.moveHistory = [];
    this.lastMove = null;
  }

  reset(): GameState {
    this.chess = new Chess(STANDARD_START_FEN);
    this.moveHistory = [];
    this.lastMove = null;
    return this.getState();
  }

  getState(): GameState {
    const summary = this.getSummary();
    return {
      ...summary,
      board: serializeBoard(this.chess),
      moveHistory: [...this.moveHistory]
    };
  }

  getSummary(): GameStateSummary {
    return buildGameSummary(this.chess, this.lastMove);
  }

  loadState(state: GameState): GameState {
    this.chess = new Chess(state.fen);
    this.moveHistory = [...state.moveHistory];
    this.lastMove = state.lastMove;
    return this.getState();
  }

  getLegalMoves(square: Square): Move[] {
    return getLegalMovesForSquare(this.chess, square);
  }

  attemptMove(move: Move): { ok: true; move: Move; state: GameState } | { ok: false; reason: string } {
    if (!isMoveLegal(this.chess, move)) {
      return {
        ok: false,
        reason: "Illegal move for the current board state."
      };
    }

    const result = this.chess.move({
      from: move.from as ChessJsSquare,
      to: move.to as ChessJsSquare,
      promotion: move.promotion ? promotionMap[move.promotion] : undefined
    });

    if (!result) {
      return {
        ok: false,
        reason: "Move was rejected by the chess engine."
      };
    }

    const normalizedMove = normalizeMove(result);
    this.moveHistory.push(normalizedMove);
    this.lastMove = normalizedMove;

    return {
      ok: true,
      move: normalizedMove,
      state: this.getState()
    };
  }
}
