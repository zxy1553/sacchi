import type { AiDifficulty } from "../controllers/AiController";

/**
 * Difficulty → UCI Skill Level & search depth mapping.
 *
 * Stockfish's "Skill Level" ranges from 0 (weakest) to 20 (strongest).
 * We also limit search depth so that easy games respond quickly.
 */
const DIFFICULTY_PROFILES: Record<
  AiDifficulty,
  { skillLevel: number; depth: number }
> = {
  easy: { skillLevel: 1, depth: 5 },
  medium: { skillLevel: 10, depth: 12 },
  hard: { skillLevel: 20, depth: 18 },
};

/**
 * StockfishEngine — a thin async wrapper around the Stockfish WASM Web Worker.
 *
 * Usage:
 *   const sf = new StockfishEngine();
 *   await sf.init();
 *   sf.setDifficulty("medium");
 *   const bestMove = await sf.computeMove("rnbqkbnr/.../w KQkq - 0 1");
 *   // bestMove === "e2e4"
 *   sf.dispose();
 */
export class StockfishEngine {
  private worker: Worker | null = null;
  private ready = false;
  private currentDifficulty: AiDifficulty = "medium";

  /**
   * Spawn the Stockfish Web Worker and wait until it responds to "uci"
   * with "uciok".
   */
  async init(): Promise<void> {
    if (this.worker) return;

    // Stockfish WASM files are served from /stockfish/ in the public directory.
    // The "#,worker" hash tells the stockfish loader to run as a Web Worker.
    const workerUrl = new URL("/stockfish/stockfish-18-lite-single.js", location.origin).href;

    this.worker = new Worker(workerUrl + "#,worker");

    // Wait for "uciok"
    await this.sendAndWait("uci", "uciok");

    // Apply initial difficulty
    this.applyDifficulty();

    // Ask the engine to initialise its internal state
    await this.sendAndWait("isready", "readyok");

    this.ready = true;
  }

  /**
   * Change the AI difficulty. Takes effect on the next `computeMove` call.
   */
  setDifficulty(difficulty: AiDifficulty): void {
    this.currentDifficulty = difficulty;
    this.applyDifficulty();
  }

  /**
   * Given a FEN position, ask Stockfish for the best move.
   * Returns a UCI move string such as "e2e4" or "e7e8q" (with promotion).
   */
  async computeMove(fen: string): Promise<string | null> {
    if (!this.worker || !this.ready) {
      throw new Error("StockfishEngine is not initialised. Call init() first.");
    }

    const { depth } = DIFFICULTY_PROFILES[this.currentDifficulty];

    // Set the position
    this.send(`position fen ${fen}`);

    // Start searching
    const response = await this.sendAndWait(
      `go depth ${depth}`,
      "bestmove"
    );

    // response looks like "bestmove e2e4 ponder d7d5" or "bestmove (none)"
    const match = response.match(/^bestmove\s+(\S+)/);
    if (!match || match[1] === "(none)") {
      return null;
    }

    return match[1];
  }

  /**
   * Clean up: terminate the Web Worker.
   */
  dispose(): void {
    if (this.worker) {
      this.send("quit");
      this.worker.terminate();
      this.worker = null;
      this.ready = false;
    }
  }

  // --- Private helpers ---

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  /**
   * Send a UCI command and return a promise that resolves with the first
   * message line that starts with `waitFor`.
   */
  private sendAndWait(command: string, waitFor: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not available"));
        return;
      }

      const handler = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : String(e.data);
        if (line.startsWith(waitFor)) {
          this.worker?.removeEventListener("message", handler);
          resolve(line);
        }
      };

      this.worker.addEventListener("message", handler);
      this.send(command);
    });
  }

  /**
   * Push the current difficulty settings (Skill Level + UCI_LimitStrength)
   * into the running engine.
   */
  private applyDifficulty(): void {
    if (!this.worker) return;
    const { skillLevel } = DIFFICULTY_PROFILES[this.currentDifficulty];

    // UCI_LimitStrength + UCI_Elo is one way, but Skill Level is simpler
    // and directly supported.
    this.send(`setoption name Skill Level value ${skillLevel}`);
  }
}
