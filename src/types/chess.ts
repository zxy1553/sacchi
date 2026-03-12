export type PlayerColor = "white" | "black";

export type PieceType =
  | "pawn"
  | "knight"
  | "bishop"
  | "rook"
  | "queen"
  | "king";

export type PromotionPiece = "knight" | "bishop" | "rook" | "queen";

export type Square =
  | "a1"
  | "a2"
  | "a3"
  | "a4"
  | "a5"
  | "a6"
  | "a7"
  | "a8"
  | "b1"
  | "b2"
  | "b3"
  | "b4"
  | "b5"
  | "b6"
  | "b7"
  | "b8"
  | "c1"
  | "c2"
  | "c3"
  | "c4"
  | "c5"
  | "c6"
  | "c7"
  | "c8"
  | "d1"
  | "d2"
  | "d3"
  | "d4"
  | "d5"
  | "d6"
  | "d7"
  | "d8"
  | "e1"
  | "e2"
  | "e3"
  | "e4"
  | "e5"
  | "e6"
  | "e7"
  | "e8"
  | "f1"
  | "f2"
  | "f3"
  | "f4"
  | "f5"
  | "f6"
  | "f7"
  | "f8"
  | "g1"
  | "g2"
  | "g3"
  | "g4"
  | "g5"
  | "g6"
  | "g7"
  | "g8"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "h7"
  | "h8";

export interface Move {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  san?: string;
}

export interface BoardPiece {
  square: Square;
  type: PieceType;
  color: PlayerColor;
}

export interface GameResult {
  outcome: "checkmate" | "stalemate" | "draw" | "resigned";
  winner: PlayerColor | null;
  reason: string;
}

export interface GameState {
  fen: string;
  turn: PlayerColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  board: (BoardPiece | null)[][];
  moveHistory: Move[];
  lastMove: Move | null;
  result: GameResult | null;
}

export interface GameStateSummary {
  fen: string;
  turn: PlayerColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  lastMove: Move | null;
  result: GameResult | null;
}

export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomPlayer {
  playerId: string;
  color: PlayerColor;
  connected: boolean;
  joinedAt: number;
}

export interface RoomState {
  roomId: string;
  status: RoomStatus;
  protocolVersion: string;
  players: RoomPlayer[];
  currentTurn: PlayerColor | null;
  gameState: GameState | null;
  moveHistory: Move[];
  createdAt: number;
  updatedAt: number;
}

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

export const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const STANDARD_START_FEN = INITIAL_FEN;
