import { describe, expect, it } from "vitest";
import { ChessEngine } from "../../src/game/gameState";

describe("ChessEngine", () => {
  it("exposes legal opening moves for a pawn", () => {
    const engine = new ChessEngine();

    const moves = engine.getLegalMoves("e2");

    expect(moves.map((move) => move.to)).toContain("e4");
    expect(moves.map((move) => move.to)).toContain("e3");
  });

  it("rejects an illegal move", () => {
    const engine = new ChessEngine();

    const result = engine.attemptMove({
      from: "e2",
      to: "e5"
    });

    expect(result.ok).toBe(false);
  });

  it("detects checkmate state", () => {
    const engine = new ChessEngine();

    const move1 = engine.attemptMove({ from: "f2", to: "f3" });
    if (!move1.ok) {
      throw new Error("Expected move1 to be legal.");
    }
    const move2 = engine.attemptMove({ from: "e7", to: "e5" });
    if (!move2.ok) {
      throw new Error("Expected move2 to be legal.");
    }
    const move3 = engine.attemptMove({ from: "g2", to: "g4" });
    if (!move3.ok) {
      throw new Error("Expected move3 to be legal.");
    }
    const move4 = engine.attemptMove({ from: "d8", to: "h4" });
    if (!move4.ok) {
      throw new Error("Expected move4 to be legal.");
    }

    expect(move4.state.isCheckmate).toBe(true);
    expect(move4.state.result?.outcome).toBe("checkmate");
    expect(move4.state.result?.winner).toBe("black");
  });
});
