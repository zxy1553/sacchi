import type { GameState, PlayerColor, Square } from "../types/chess";

// --- Capture burst effect ---

/**
 * Show a burst of particles on the captured square.
 */
export function showCaptureBurst(boardGrid: HTMLElement, square: Square): void {
  const squareEl = boardGrid.querySelector<HTMLElement>(
    `[data-square="${square}"]`
  );
  if (!squareEl) return;

  const rect = squareEl.getBoundingClientRect();
  const gridRect = boardGrid.getBoundingClientRect();
  const cx = rect.left - gridRect.left + rect.width / 2;
  const cy = rect.top - gridRect.top + rect.height / 2;

  const particleCount = 12;
  const colors = ["#ef4444", "#f97316", "#eab308", "#f43f5e", "#fb923c"];

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.className = "capture-particle";
    const angle = (Math.PI * 2 * i) / particleCount;
    const distance = 20 + Math.random() * 30;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const size = 4 + Math.random() * 6;

    particle.style.cssText = `
      left: ${cx}px;
      top: ${cy}px;
      width: ${size}px;
      height: ${size}px;
      background: ${colors[i % colors.length]};
      --dx: ${dx}px;
      --dy: ${dy}px;
    `;

    boardGrid.style.position = "relative";
    boardGrid.appendChild(particle);

    particle.addEventListener("animationend", () => particle.remove());
  }

  // Add flash effect to the square itself
  squareEl.classList.add("capture-flash");
  squareEl.addEventListener(
    "animationend",
    () => squareEl.classList.remove("capture-flash"),
    { once: true }
  );
}

// --- Check flash effect ---

/**
 * Flash the king square red when in check.
 */
export function showCheckEffect(
  boardGrid: HTMLElement,
  state: GameState
): void {
  // Remove any existing check effects
  boardGrid.querySelectorAll(".in-check").forEach((el) => {
    el.classList.remove("in-check");
  });

  if (!state.isCheck) return;

  // Find the king of the side that is in check (the side whose turn it is)
  const kingSquare = state.board
    .flat()
    .find((p) => p?.type === "king" && p?.color === state.turn)?.square;

  if (!kingSquare) return;

  const squareEl = boardGrid.querySelector<HTMLElement>(
    `[data-square="${kingSquare}"]`
  );
  if (squareEl) {
    squareEl.classList.add("in-check");
  }
}

// --- Victory celebration ---

const colorLabel = (c: PlayerColor) => (c === "white" ? "白方" : "黑方");

/**
 * Show the game over overlay with celebration effects.
 */
export function showGameOverEffect(state: GameState): void {
  // Remove any previous overlay
  hideGameOverEffect();

  const result = state.result;
  if (!result) return;

  const overlay = document.createElement("div");
  overlay.className = "game-over-overlay";
  overlay.id = "game-over-overlay";

  const banner = document.createElement("div");
  banner.className = "game-over-banner";

  // Emoji & message based on outcome
  let emoji = "";
  let title = "";
  let subtitle = "";

  switch (result.outcome) {
    case "checkmate":
      emoji = "👑";
      title = `${colorLabel(result.winner!)} 获胜！`;
      subtitle = "将杀！";
      break;
    case "stalemate":
      emoji = "🤝";
      title = "和棋";
      subtitle = "逼和（无子可动）";
      break;
    case "draw":
      emoji = "🤝";
      title = "和棋";
      subtitle = result.reason;
      break;
    case "resigned":
      emoji = "🏳️";
      title = `${colorLabel(result.winner!)} 获胜！`;
      subtitle = "对手认输";
      break;
  }

  banner.innerHTML = `
    <div class="game-over-emoji">${emoji}</div>
    <div class="game-over-title">${title}</div>
    <div class="game-over-subtitle">${subtitle}</div>
    <button class="game-over-dismiss" type="button">关闭</button>
  `;

  overlay.appendChild(banner);
  document.body.appendChild(overlay);

  // Dismiss button
  overlay.querySelector(".game-over-dismiss")?.addEventListener("click", () => {
    hideGameOverEffect();
  });

  // Click on backdrop to dismiss
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideGameOverEffect();
  });

  // Spawn confetti only on win
  if (result.outcome === "checkmate" || result.outcome === "resigned") {
    spawnConfetti(overlay);
  }
}

export function hideGameOverEffect(): void {
  document.getElementById("game-over-overlay")?.remove();
}

// --- Confetti ---

function spawnConfetti(container: HTMLElement): void {
  const colors = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6"
  ];

  const count = 60;

  for (let i = 0; i < count; i++) {
    const confetti = document.createElement("div");
    confetti.className = "confetti-piece";

    const x = Math.random() * 100;
    const delay = Math.random() * 1.5;
    const duration = 2 + Math.random() * 2;
    const rotation = Math.random() * 360;
    const size = 6 + Math.random() * 8;
    const color = colors[Math.floor(Math.random() * colors.length)];

    confetti.style.cssText = `
      left: ${x}%;
      width: ${size}px;
      height: ${size * 1.5}px;
      background: ${color};
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      --rotation: ${rotation}deg;
    `;

    container.appendChild(confetti);
    confetti.addEventListener("animationend", () => confetti.remove());
  }
}
