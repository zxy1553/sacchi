import type { Chess, Move as ChessJsMove, Square as ChessJsSquare } from "chess.js";
import type { Move, PieceType, PromotionPiece, Square } from "../types/chess";

const pieceTypeMap: Record<string, PieceType> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king"
};

const promotionTypeMap: Record<string, PromotionPiece> = {
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen"
};

export function normalizeMove(move: ChessJsMove): Move {
  return {
    from: move.from as Square,
    to: move.to as Square,
    san: move.san,
    promotion: move.promotion ? promotionTypeMap[move.promotion] : undefined
  };
}

export function getLegalMovesForSquare(chess: Chess, square: Square): Move[] {
  const moves = chess.moves({
    square: square as ChessJsSquare,
    verbose: true
  });

  return moves.map(normalizeMove);
}

export function isMoveLegal(chess: Chess, move: Move): boolean {
  return getLegalMovesForSquare(chess, move.from).some(
    (candidate) =>
      candidate.from === move.from &&
      candidate.to === move.to &&
      (candidate.promotion ?? null) === (move.promotion ?? null)
  );
}
