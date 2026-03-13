// @vitest-environment happy-dom
/**
 * TASK-A2 Tests: main.ts Router & Controller Lifecycle
 *
 * Verifies:
 *  - Controller activation / deactivation lifecycle
 *  - Mode switching dispatches to correct controller
 *  - LocalController end-to-end (select → move → view update)
 *  - AiController end-to-end (human move → AI response)
 *  - newGame resets state properly
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ChessEngine } from "../../src/game/gameState";
import { LocalController } from "../../src/controllers/LocalController";
import { AiController } from "../../src/controllers/AiController";
import { OnlineController } from "../../src/controllers/OnlineController";
import type { DomElements, GameController, Mode } from "../../src/controllers/types";

// --- Mock side-effect modules so tests don't touch real DOM effects / localStorage ---

vi.mock("../../src/ui/effects", () => ({
  showCaptureBurst: vi.fn(),
  showCheckEffect: vi.fn(),
  showGameOverEffect: vi.fn(),
  hideGameOverEffect: vi.fn(),
}));

vi.mock("../../src/storage/persistence", () => ({
  saveLocalGame: vi.fn(),
  loadLocalGame: vi.fn(() => null),
  clearLocalGame: vi.fn(),
  saveOnlineSession: vi.fn(),
  loadOnlineSession: vi.fn(() => null),
  clearOnlineSession: vi.fn(),
}));

// --- Mock StockfishEngine so tests don't need real WASM Worker ---
// The mock's computeMove delegates to globalThis.__mockStockfishComputeMove
// which tests set in beforeEach to resolve with a legal move.

vi.mock("../../src/engine/stockfishEngine", () => {
  return {
    StockfishEngine: class MockStockfishEngine {
      private ready = false;
      async init() {
        this.ready = true;
      }
      setDifficulty() {}
      async computeMove(fen: string): Promise<string | null> {
        if (!this.ready) throw new Error("Not ready");
        if ((globalThis as any).__mockStockfishComputeMove) {
          return (globalThis as any).__mockStockfishComputeMove(fen);
        }
        return null;
      }
      dispose() {
        this.ready = false;
      }
    },
  };
});

/**
 * Helper: Install a globalThis mock that uses the real ChessEngine
 * to find the first legal move from a FEN and return it as UCI.
 */
function installMockStockfishCompute() {
  (globalThis as any).__mockStockfishComputeMove = (fen: string) => {
    const tmpEngine = new ChessEngine(fen);
    const state = tmpEngine.getState();
    for (const rank of state.board) {
      for (const piece of rank) {
        if (piece && piece.color === state.turn) {
          const moves = tmpEngine.getLegalMoves(piece.square);
          if (moves.length > 0) {
            const m = moves[0];
            return m.from + m.to + (m.promotion ? m.promotion[0] : "");
          }
        }
      }
    }
    return null;
  };
}

function uninstallMockStockfishCompute() {
  delete (globalThis as any).__mockStockfishComputeMove;
}

// --- Helpers to build fake DOM elements ---

function createMockElement(tag = "div"): HTMLElement {
  const el = document.createElement(tag);
  return el;
}

function createMockDom(): DomElements {
  return {
    modeSelect: document.createElement("select") as HTMLSelectElement,
    onlineControls: createMockElement(),
    connectionBadge: createMockElement(),
    serverUrlInput: document.createElement("input") as HTMLInputElement,
    connectButton: document.createElement("button") as HTMLButtonElement,
    serverErrorRow: createMockElement(),
    serverErrorText: createMockElement(),
    createRoomButton: document.createElement("button") as HTMLButtonElement,
    joinRoomInput: document.createElement("input") as HTMLInputElement,
    joinRoomButton: document.createElement("button") as HTMLButtonElement,
    roomLobby: createMockElement(),
    roomListContainer: createMockElement(),
    refreshRoomsButton: document.createElement("button") as HTMLButtonElement,
    roomInfoPanel: createMockElement(),
    roomIdValue: createMockElement(),
    playerColorValue: createMockElement(),
    opponentStatusValue: createMockElement(),
    copyRoomIdButton: document.createElement("button") as HTMLButtonElement,
    aiControls: createMockElement(),
    aiDifficultySelect: (() => {
      const sel = document.createElement("select") as HTMLSelectElement;
      // Add difficulty options
      ["easy", "medium", "hard"].forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        if (v === "medium") opt.selected = true;
        sel.appendChild(opt);
      });
      return sel;
    })(),
    playerColorSelect: (() => {
      const sel = document.createElement("select") as HTMLSelectElement;
      ["white", "black"].forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        if (v === "white") opt.selected = true;
        sel.appendChild(opt);
      });
      return sel;
    })(),
    startAiGameButton: document.createElement("button") as HTMLButtonElement,
    newGameButton: document.createElement("button") as HTMLButtonElement,
    turnValue: createMockElement(),
    resultValue: createMockElement(),
    statusMessage: createMockElement(),
    boardRoot: createMockElement(),
    appSubtitle: createMockElement(),
  };
}

// --- Minimal mock BoardView ---

class MockBoardView {
  renderCalls: Array<{ state: any; options: any }> = [];
  lastOnSquareClick: ((sq: string) => void) | null = null;

  render(state: any, options: any): void {
    this.renderCalls.push({ state, options });
  }
}

// ============================================================
// Test Suite: Router Logic (simulates main.ts switchMode)
// ============================================================

describe("Router: switchMode logic", () => {
  let engine: ChessEngine;
  let boardView: MockBoardView;
  let dom: DomElements;
  let controllers: Record<Mode, GameController>;
  let activeController: GameController | null;

  function switchMode(newMode: Mode): void {
    activeController?.deactivate();
    activeController = controllers[newMode];
    activeController.activate();
  }

  beforeEach(() => {
    engine = new ChessEngine();
    boardView = new MockBoardView();
    dom = createMockDom();

    controllers = {
      local: new LocalController(engine, boardView as any, dom),
      ai: new AiController(engine, boardView as any, dom),
      online: new OnlineController(engine, boardView as any, dom),
    };

    activeController = null;
  });

  it("activates local controller on initial switchMode('local')", () => {
    switchMode("local");

    expect(dom.onlineControls.hidden).toBe(true);
    expect(dom.appSubtitle.textContent).toBe("本地双人国际象棋");
    expect(boardView.renderCalls.length).toBeGreaterThan(0);
  });

  it("activates AI controller on switchMode('ai')", () => {
    switchMode("ai");

    expect(dom.onlineControls.hidden).toBe(true);
    expect(dom.appSubtitle.textContent).toBe("人机对弈国际象棋");
    expect(boardView.renderCalls.length).toBeGreaterThan(0);
  });

  it("activates online controller on switchMode('online')", () => {
    switchMode("online");

    expect(dom.onlineControls.hidden).toBe(false);
    expect(dom.appSubtitle.textContent).toBe("联机双人国际象棋");
  });

  it("deactivates previous controller when switching modes", () => {
    const deactivateLocalSpy = vi.spyOn(controllers.local, "deactivate");
    const activateAiSpy = vi.spyOn(controllers.ai, "activate");

    switchMode("local");
    switchMode("ai");

    expect(deactivateLocalSpy).toHaveBeenCalledOnce();
    expect(activateAiSpy).toHaveBeenCalledOnce();
  });

  it("switches from ai to local correctly", () => {
    const deactivateAiSpy = vi.spyOn(controllers.ai, "deactivate");
    const activateLocalSpy = vi.spyOn(controllers.local, "activate");

    switchMode("ai");
    switchMode("local");

    expect(deactivateAiSpy).toHaveBeenCalledOnce();
    // activate is called once in switchMode("local") + once in our beforeEach isn't there
    expect(activateLocalSpy).toHaveBeenCalledOnce();
    expect(dom.appSubtitle.textContent).toBe("本地双人国际象棋");
  });

  it("multiple rapid mode switches work correctly", () => {
    switchMode("local");
    switchMode("ai");
    switchMode("online");
    switchMode("local");

    expect(activeController).toBe(controllers.local);
    expect(dom.appSubtitle.textContent).toBe("本地双人国际象棋");
  });

  it("board click is dispatched to the active controller", () => {
    switchMode("local");

    const spy = vi.spyOn(controllers.local, "handleSquareClick");
    // Simulate what main.ts does: activeController?.handleSquareClick(square)
    activeController?.handleSquareClick("e2");

    expect(spy).toHaveBeenCalledWith("e2");
  });

  it("newGame button delegates to active controller", () => {
    switchMode("ai");

    const spy = vi.spyOn(controllers.ai, "newGame");
    activeController?.newGame();

    expect(spy).toHaveBeenCalledOnce();
  });
});

// ============================================================
// Test Suite: LocalController End-to-End
// ============================================================

describe("LocalController E2E", () => {
  let engine: ChessEngine;
  let boardView: MockBoardView;
  let dom: DomElements;
  let controller: LocalController;

  beforeEach(() => {
    engine = new ChessEngine();
    boardView = new MockBoardView();
    dom = createMockDom();
    controller = new LocalController(engine, boardView as any, dom);
    controller.activate();
    boardView.renderCalls = []; // Clear activation render
  });

  it("activate sets correct DOM state for local mode", () => {
    expect(dom.onlineControls.hidden).toBe(true);
    expect(dom.connectionBadge.hidden).toBe(true);
    expect(dom.serverErrorRow.hidden).toBe(true);
    expect(dom.appSubtitle.textContent).toBe("本地双人国际象棋");
  });

  it("initial state is white's turn", () => {
    const state = controller.getState();
    expect(state.turn).toBe("white");
    expect(state.isCheckmate).toBe(false);
    expect(state.result).toBeNull();
  });

  it("clicking a white piece shows legal moves (renders board)", () => {
    controller.handleSquareClick("e2");

    expect(boardView.renderCalls.length).toBe(1);
    const renderCall = boardView.renderCalls[0];
    expect(renderCall.options.selectedSquare).toBe("e2");
    expect(renderCall.options.legalMoves.length).toBeGreaterThan(0);
  });

  it("selecting a piece then clicking a legal target executes the move", () => {
    // Select white pawn at e2
    controller.handleSquareClick("e2");
    // Move to e4
    controller.handleSquareClick("e4");

    const state = controller.getState();
    expect(state.turn).toBe("black"); // Turn switched
    expect(state.moveHistory.length).toBe(1);
    expect(state.moveHistory[0].from).toBe("e2");
    expect(state.moveHistory[0].to).toBe("e4");
  });

  it("clicking an illegal target clears selection", () => {
    controller.handleSquareClick("e2");
    boardView.renderCalls = [];

    // Click on an invalid target (e5 is not reachable for a pawn from e2 in one move)
    controller.handleSquareClick("e5");

    expect(boardView.renderCalls.length).toBe(1);
    const renderCall = boardView.renderCalls[0];
    expect(renderCall.options.selectedSquare).toBeNull();
    expect(renderCall.options.legalMoves).toEqual([]);
  });

  it("cannot move opponent's pieces", () => {
    // Try clicking black pawn on white's turn
    controller.handleSquareClick("e7");

    // Should not render (no selection change for wrong color)
    expect(boardView.renderCalls.length).toBe(0);
  });

  it("complete move sequence: white e4, black e5", () => {
    // White: e2 → e4
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");

    // Black: e7 → e5
    controller.handleSquareClick("e7");
    controller.handleSquareClick("e5");

    const state = controller.getState();
    expect(state.turn).toBe("white");
    expect(state.moveHistory.length).toBe(2);
  });

  it("newGame resets the board", () => {
    // Make a move first
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");
    expect(controller.getState().moveHistory.length).toBe(1);

    // Reset
    controller.newGame();

    const state = controller.getState();
    expect(state.turn).toBe("white");
    expect(state.moveHistory.length).toBe(0);
    expect(state.result).toBeNull();
    expect(dom.statusMessage.textContent).toBe("");
  });

  it("board interaction is disabled after game result", () => {
    // Scholar's Mate: 1. f3 e5 2. g4 Qh4#
    controller.handleSquareClick("f2"); // Select f2
    controller.handleSquareClick("f3"); // f3
    controller.handleSquareClick("e7");
    controller.handleSquareClick("e5");
    controller.handleSquareClick("g2");
    controller.handleSquareClick("g4");
    controller.handleSquareClick("d8");
    controller.handleSquareClick("h4"); // Qh4#

    const state = controller.getState();
    expect(state.isCheckmate).toBe(true);
    expect(state.result).not.toBeNull();
    expect(state.result?.winner).toBe("black");

    // Trying to click after game over — should be ignored
    boardView.renderCalls = [];
    controller.handleSquareClick("e2");
    expect(boardView.renderCalls.length).toBe(0);
  });

  it("turn label updates after each move", () => {
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");

    expect(dom.turnValue.textContent).toBe("黑方");

    controller.handleSquareClick("e7");
    controller.handleSquareClick("e5");

    expect(dom.turnValue.textContent).toBe("白方");
  });

  it("result label shows '进行中' during play and reason after mate", () => {
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");
    expect(dom.resultValue.textContent).toBe("进行中");

    // Scholar's mate continuation
    controller.handleSquareClick("e7");
    controller.handleSquareClick("e5");
    controller.handleSquareClick("f1");
    controller.handleSquareClick("c4");
    controller.handleSquareClick("b8");
    controller.handleSquareClick("c6");
    controller.handleSquareClick("d1");
    controller.handleSquareClick("h5");
    controller.handleSquareClick("g8");
    controller.handleSquareClick("f6");
    controller.handleSquareClick("h5");
    controller.handleSquareClick("f7"); // Qxf7#

    const state = controller.getState();
    if (state.isCheckmate) {
      expect(dom.resultValue.textContent).not.toBe("进行中");
    }
  });
});

// ============================================================
// Test Suite: AiController E2E
// ============================================================

describe("AiController E2E", () => {
  let engine: ChessEngine;
  let boardView: MockBoardView;
  let dom: DomElements;
  let controller: AiController;

  beforeEach(async () => {
    engine = new ChessEngine();
    boardView = new MockBoardView();
    dom = createMockDom();
    controller = new AiController(engine, boardView as any, dom);
    controller.activate();
    // Simulate clicking "start game" to begin the AI game
    dom.startAiGameButton.click();
    // Wait for Stockfish mock init to resolve (flush microtasks)
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    boardView.renderCalls = [];
    installMockStockfishCompute();
  });

  afterEach(() => {
    controller.deactivate();
    uninstallMockStockfishCompute();
  });

  it("activate sets AI mode subtitle", () => {
    expect(dom.appSubtitle.textContent).toBe("人机对弈国际象棋");
  });

  it("activate shows welcome status message", () => {
    expect(dom.statusMessage.textContent).toContain("人机模式");
  });

  it("activate shows ai-controls panel before game starts", () => {
    // Create a fresh controller to test activate without startGame
    const freshController = new AiController(engine, boardView as any, dom);
    freshController.activate();
    expect(dom.aiControls.hidden).toBe(false);
  });

  it("initial state is white's turn (human player)", () => {
    const state = controller.getState();
    expect(state.turn).toBe("white");
  });

  it("human can select and move a white piece", () => {
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");

    const state = controller.getState();
    expect(state.moveHistory.length).toBe(1);
    expect(state.moveHistory[0].from).toBe("e2");
    expect(state.moveHistory[0].to).toBe("e4");
  });

  it("AI responds automatically after human move", async () => {
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");

    // AI should be thinking...
    expect(dom.statusMessage.textContent).toBe("AI 思考中…");

    // The mock computeMove resolves immediately; flush microtask queue
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const state = controller.getState();
    // AI should have made a move, so now it's white's turn again
    expect(state.turn).toBe("white");
    expect(state.moveHistory.length).toBe(2);
  });

  it("human cannot move during AI's turn", () => {
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");

    // Before AI finishes, try to click
    boardView.renderCalls = [];
    controller.handleSquareClick("d2");

    // Should be ignored since it's AI's turn / AI is thinking
    expect(boardView.renderCalls.length).toBe(0);
  });

  it("human cannot move black pieces", () => {
    // Try to click a black piece on white's turn
    boardView.renderCalls = [];
    controller.handleSquareClick("e7");
    expect(boardView.renderCalls.length).toBe(0);
  });

  it("newGame resets and stops AI thinking", () => {
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");

    // AI is thinking...
    controller.newGame();

    const state = controller.getState();
    expect(state.turn).toBe("white");
    expect(state.moveHistory.length).toBe(0);
    // newGame returns to settings screen
    expect(dom.aiControls.hidden).toBe(false);
  });

  it("deactivate stops AI thinking mid-process", async () => {
    // Uninstall the mock so computeMove hangs (never resolves)
    uninstallMockStockfishCompute();

    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");

    // Deactivate before AI can respond
    controller.deactivate();

    // Flush microtasks
    await new Promise((r) => setTimeout(r, 0));

    // State should still show only human's move
    const state = controller.getState();
    expect(state.moveHistory.length).toBe(1); // Only human's move
  });

  it("multi-round play works: human → AI → human → AI", async () => {
    // Round 1: human
    controller.handleSquareClick("e2");
    controller.handleSquareClick("e4");
    // Flush async AI response
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(controller.getState().moveHistory.length).toBe(2);
    expect(controller.getState().turn).toBe("white");

    // Round 2: human — pick a move that's definitely legal
    controller.handleSquareClick("d2");
    controller.handleSquareClick("d4");
    // Flush async AI response
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(controller.getState().moveHistory.length).toBe(4);
    expect(controller.getState().turn).toBe("white");
  });
});

// ============================================================
// Test Suite: Controller Interface Compliance
// ============================================================

describe("Controller interface compliance", () => {
  let engine: ChessEngine;
  let boardView: MockBoardView;
  let dom: DomElements;

  beforeEach(() => {
    engine = new ChessEngine();
    boardView = new MockBoardView();
    dom = createMockDom();
  });

  const controllerFactories: Record<string, () => GameController> = {
    LocalController: () => new LocalController(engine, boardView as any, dom),
    AiController: () => new AiController(engine, boardView as any, dom),
    OnlineController: () => new OnlineController(engine, boardView as any, dom),
  };

  for (const [name, factory] of Object.entries(controllerFactories)) {
    describe(name, () => {
      it("implements activate()", () => {
        const ctrl = factory();
        expect(typeof ctrl.activate).toBe("function");
        ctrl.activate();
      });

      it("implements deactivate()", () => {
        const ctrl = factory();
        ctrl.activate();
        expect(typeof ctrl.deactivate).toBe("function");
        ctrl.deactivate();
      });

      it("implements handleSquareClick()", () => {
        const ctrl = factory();
        expect(typeof ctrl.handleSquareClick).toBe("function");
      });

      it("implements newGame()", () => {
        const ctrl = factory();
        expect(typeof ctrl.newGame).toBe("function");
      });

      it("implements getState() returning a valid GameState", () => {
        const ctrl = factory();
        const state = ctrl.getState();
        expect(state).toBeDefined();
        expect(state.fen).toBeDefined();
        expect(state.turn).toMatch(/^(white|black)$/);
        expect(typeof state.isCheck).toBe("boolean");
        expect(typeof state.isCheckmate).toBe("boolean");
        expect(Array.isArray(state.board)).toBe(true);
        expect(Array.isArray(state.moveHistory)).toBe(true);
      });

      it("can be activated and deactivated multiple times without error", () => {
        const ctrl = factory();
        ctrl.activate();
        ctrl.deactivate();
        ctrl.activate();
        ctrl.deactivate();
        ctrl.activate();
      });
    });
  }
});
