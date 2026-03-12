import type { Chess } from "chess.js";
import type { GameResult, GameStateSummary } from "../types/chess";

function getResult(chess: Chess): GameResult | null {
  if (chess.isCheckmate()) {
    return {
      outcome: "checkmate",
      winner: chess.turn() === "w" ? "black" : "white",
      reason: "checkmate"
    };
  }

  if (chess.isStalemate()) {
    return {
      outcome: "stalemate",
      winner: null,
      reason: "stalemate"
    };
  }

  if (chess.isDraw()) {
    return {
      outcome: "draw",
      winner: null,
      reason: "draw"
    };
  }

  return null;
}

export function buildGameSummary(
  chess: Chess,
  lastMove: GameStateSummary["lastMove"]
): GameStateSummary {
  return {
    fen: chess.fen(),
    turn: chess.turn() === "w" ? "white" : "black",
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isDraw: chess.isDraw(),
    lastMove,
    result: getResult(chess)
  };
}
