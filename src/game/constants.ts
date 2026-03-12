import type { PieceType, PlayerColor } from "../types/chess";

export const STANDARD_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Unicode symbols (used as alt-text / fallback)
export const PIECE_SYMBOLS: Record<PlayerColor, Record<PieceType, string>> = {
  white: {
    pawn: "♙",
    knight: "♘",
    bishop: "♗",
    rook: "♖",
    queen: "♕",
    king: "♔"
  },
  black: {
    pawn: "♟",
    knight: "♞",
    bishop: "♝",
    rook: "♜",
    queen: "♛",
    king: "♚"
  }
};

// SVG piece images from lichess cburnett set (CC BY-SA 3.0)
// https://github.com/lichess-org/lila/tree/master/public/piece/cburnett
const CBURNETT_BASE =
  "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett";

export const PIECE_SVG: Record<PlayerColor, Record<PieceType, string>> = {
  white: {
    pawn: `${CBURNETT_BASE}/wP.svg`,
    knight: `${CBURNETT_BASE}/wN.svg`,
    bishop: `${CBURNETT_BASE}/wB.svg`,
    rook: `${CBURNETT_BASE}/wR.svg`,
    queen: `${CBURNETT_BASE}/wQ.svg`,
    king: `${CBURNETT_BASE}/wK.svg`
  },
  black: {
    pawn: `${CBURNETT_BASE}/bP.svg`,
    knight: `${CBURNETT_BASE}/bN.svg`,
    bishop: `${CBURNETT_BASE}/bB.svg`,
    rook: `${CBURNETT_BASE}/bR.svg`,
    queen: `${CBURNETT_BASE}/bQ.svg`,
    king: `${CBURNETT_BASE}/bK.svg`
  }
};
