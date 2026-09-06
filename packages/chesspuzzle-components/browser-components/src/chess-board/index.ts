import "chessboard-element";
import { Chess } from "chess.js";
import engineSource from "stockfish.js/stockfish.js";
import styles from "./board.css";

type BoardProps = {
  fen?: string;
  orientation?: "white" | "black";
  playAs?: "white" | "black";
  enginePolicy?: "follow" | "play";
  engineLevel?: number;
  puzzleMode?: boolean;
  puzzleSetupMove?: string | null;
  puzzleMoves?: string[];
  hintGoal?: string;
  browserStorageKey?: string;
  command?: { action: string; nonce: number };
  state?: ComponentState;
};
type ComponentBridge = {
  setStateValue: (name: string, value: unknown) => void;
  setTriggerValue: (name: string, value: unknown) => void;
};
type BoardElement = HTMLElement & {
  draggablePieces: boolean;
  orientation: "white" | "black";
  fen(): string;
  setPosition(position: string, useAnimation?: boolean): void;
};
type BoardTarget = HTMLElement & {
  __chesspuzzleUpdate?: (props: unknown) => void;
};
type DropEvent = CustomEvent<{
  source: string;
  target: string;
  piece: string;
  newPosition: Record<string, string>;
  oldPosition: Record<string, string>;
  setAction(action: "snapback" | "trash"): void;
}>;
type GameStep = { ply: number; move: string; san: string; actor: "player" | "stockfish" | "puzzle" };
type Evaluation = { score: number | null; mate: number | null; depth: number | null };
type Snapshot = {
  fen: string;
  steps: GameStep[];
  puzzleIndex: number;
  puzzleDeviated: boolean;
  enginePlan: string[];
  evaluation: Evaluation;
};
type ComponentState = {
  fen: string;
  turn: "white" | "black";
  status: string;
  gameSteps: GameStep[];
  enginePlan: string[];
  evaluation: Evaluation;
  history: Snapshot[];
  canUndo: boolean;
  puzzle: { enabled: boolean; expected: number; completed: number; deviated: boolean; complete: boolean };
};

function createEngine(onMessage: (message: string) => void): Worker {
  const source = new Blob([engineSource], { type: "application/javascript" });
  const worker = new Worker(URL.createObjectURL(source));
  worker.addEventListener("message", (event) => onMessage(String(event.data)));
  worker.postMessage("uci");
  return worker;
}

function colorName(color: "w" | "b"): "white" | "black" {
  return color === "w" ? "white" : "black";
}

export function createChessBoard(target: HTMLElement, props?: unknown, bridge?: ComponentBridge): () => void {
  const options = (props ?? {}) as BoardProps;
  if (options.browserStorageKey) {
    window.localStorage.setItem(options.browserStorageKey, options.browserStorageKey);
  }
  const savedState = options.state;
  const initialGame = new Chess(options.fen);
  let game = new Chess(savedState?.fen ?? options.fen);
  const initialTurn = initialGame.turn();
  const playerColor = options.playAs ?? "white";
  const puzzleMoves = options.puzzleMoves ?? [];
  const setupMove = options.puzzleMode === true ? options.puzzleSetupMove ?? null : null;
  const hasSetupMove = Boolean(setupMove);
  const playerTurn = hasSetupMove
    ? initialTurn === "w" ? "b" : "w"
    : playerColor === "white" ? "w" : "b";
  const componentApi = bridge ?? { setStateValue: () => undefined, setTriggerValue: () => undefined };
  const wrapper = document.createElement("div");
  wrapper.className = "chess-board-wrapper";
  const board = document.createElement("chess-board") as BoardElement;
  const promotionDialog = document.createElement("dialog");
  promotionDialog.className = "chess-board-promotion";
  promotionDialog.innerHTML = `
    <form method="dialog">
      <p>Choose promotion</p>
      <div class="chess-board-promotion-options">
        <button type="submit" value="q">Queen</button>
        <button type="submit" value="r">Rook</button>
        <button type="submit" value="b">Bishop</button>
        <button type="submit" value="n">Knight</button>
      </div>
    </form>`;
  board.draggablePieces = true;
  board.orientation = options.orientation ?? playerColor;
  wrapper.append(board, promotionDialog);
  board.setPosition(game.fen(), false);
  const style = document.createElement("style");
  style.textContent = styles;
  target.append(style, wrapper);

  let engine: Worker | undefined;
  let engineReady = false;
  let engineThinking = false;
  let puzzleIndex = savedState
    ? savedState.puzzle.completed
    : 0;
  let puzzleDeviated = savedState?.puzzle.deviated ?? false;
  let enginePlan: string[] = savedState?.enginePlan ? [...savedState.enginePlan] : [];
  let evaluation: Evaluation = savedState?.evaluation ?? { score: null, mate: null, depth: null };
  const gameSteps: GameStep[] = savedState?.gameSteps ? [...savedState.gameSteps] : [];
  const history: Snapshot[] = savedState?.history ? [...savedState.history] : [];
  let currentStatus = savedState?.status ?? "";

  const setStatus = (message: string) => { currentStatus = message; };
  const logBoardState = (label: string, details: Record<string, unknown> = {}) => {
    console.log("[chess-board]", label, {
      ...details,
      gameFen: game.fen(),
      boardFen: board.fen(),
      puzzleIndex,
      stepCount: gameSteps.length,
    });
  };
  const refreshBoardAfterEvent = (fen: string, label: string) => {
    board.setPosition(fen, false);
    window.setTimeout(() => {
      board.setPosition(fen, false);
      logBoardState(label, { expectedFen: fen });
    }, 0);
  };
  board.addEventListener("change", (event) => {
    const detail = (event as CustomEvent<{ value: Record<string, string>; oldValue: Record<string, string> }>).detail;
    logBoardState("board change", {
      eventFen: board.fen(),
      eventValue: detail?.value,
      eventOldValue: detail?.oldValue,
    });
  });
  board.addEventListener("snap-end", (event) => {
    logBoardState("board snap-end", { detail: (event as CustomEvent).detail });
  });
  const publishState = () => {
    const state: ComponentState = {
      fen: game.fen(), turn: colorName(game.turn()), status: currentStatus,
      gameSteps: [...gameSteps], enginePlan: [...enginePlan], evaluation: { ...evaluation }, history: [...history],
      canUndo: history.length > 0,
      puzzle: { enabled: Boolean(options.puzzleMode), expected: puzzleMoves.length,
        completed: puzzleIndex,
        deviated: puzzleDeviated, complete: options.puzzleMode === true && puzzleIndex >= puzzleMoves.length },
    };
    componentApi.setStateValue("state", state);
    componentApi.setTriggerValue("updated", state);
  };
  const sendEngine = (command: string) => engine?.postMessage(command);
  const engineCanMove = () =>
    (options.enginePolicy === "play" || puzzleDeviated) &&
    game.turn() !== playerTurn &&
    !game.isGameOver();
  const followPuzzleMove = () => {
    const expectedMove = puzzleMoves[puzzleIndex];
    if (!options.puzzleMode || puzzleDeviated || !expectedMove || game.turn() === playerTurn) return false;
    if (!applyMove(expectedMove, "puzzle")) return false;
    puzzleIndex += 1;
    setStatus(`Puzzle opponent played ${gameSteps[gameSteps.length - 1].san}. Your move (${playerColor})`);
    publishState();
    return true;
  };
  const requestAnalysis = () => {
    if (!engine || !engineReady || engineThinking || game.isGameOver()) return;
    if (followPuzzleMove()) return;
    engineThinking = true;
    sendEngine(`position fen ${game.fen()}`);
    sendEngine(`go depth ${Math.max(6, Math.min(20, Number(options.engineLevel ?? 10)))}`);
    setStatus(engineCanMove() ? "Stockfish is thinking..." : "Stockfish is evaluating...");
    publishState();
  };
  const applyMove = (uci: string, actor: GameStep["actor"]): boolean => {
    const snapshot: Snapshot = {
      fen: game.fen(), steps: [...gameSteps], puzzleIndex, puzzleDeviated,
      enginePlan: [...enginePlan], evaluation: { ...evaluation },
    };
    try {
      logBoardState("before move", { actor, uci });
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
      history.push(snapshot);
      gameSteps.push({ ply: gameSteps.length + 1, move: uci, san: move.san, actor });
      refreshBoardAfterEvent(game.fen(), "deferred board refresh");
      logBoardState("after move", { actor, uci, san: move.san, captured: move.captured ?? null });
      return true;
    } catch (error) {
      logBoardState("move failed", { actor, uci, error: String(error) });
      return false;
    }
  };
  if (hasSetupMove && !savedState && setupMove) {
    try {
      const move = game.move({ from: setupMove.slice(0, 2), to: setupMove.slice(2, 4), promotion: setupMove[4] ?? "q" });
      gameSteps.push({ ply: 1, move: setupMove, san: move.san, actor: "puzzle" });
      puzzleIndex = 1;
      refreshBoardAfterEvent(game.fen(), "deferred setup refresh");
      logBoardState("after setup move", { uci: setupMove, san: move.san });
    } catch {
      setStatus("Puzzle setup move is invalid");
      logBoardState("setup move failed", { uci: setupMove });
    }
  }
  const handleEngineMessage = (message: string) => {
    if (message === "uciok") {
      sendEngine(`setoption name Skill Level value ${Math.max(0, Math.min(20, Number(options.engineLevel ?? 10)))}`);
      sendEngine("isready");
    } else if (message === "readyok") {
      engineReady = true;
      requestAnalysis();
    } else if (message.startsWith("info ")) {
      const score = message.match(/score cp (-?\d+)/)?.[1];
      const mate = message.match(/score mate (-?\d+)/)?.[1];
      const depth = message.match(/\bdepth (\d+)/)?.[1];
      const pv = message.match(/\bpv (.+)$/)?.[1];
      evaluation = { score: score ? Number(score) / 100 : evaluation.score, mate: mate ? Number(mate) : evaluation.mate, depth: depth ? Number(depth) : evaluation.depth };
      if (pv) enginePlan = pv.split(" ");
    } else if (message.startsWith("bestmove ")) {
      engineThinking = false;
      const move = message.split(" ")[1];
      const isPuzzleMove = options.puzzleMode === true && !puzzleDeviated && puzzleIndex < puzzleMoves.length;
      if (move && move !== "(none)" && engineCanMove() && applyMove(move, isPuzzleMove ? "puzzle" : "stockfish")) {
        if (isPuzzleMove) puzzleIndex += 1;
        const lastStep = gameSteps[gameSteps.length - 1];
        setStatus(game.isGameOver() ? "Game over" : `${lastStep.actor === "stockfish" ? "Stockfish takeover" : "Puzzle opponent"}: ${lastStep.san}. Your move (${playerColor})`);
      } else if (options.puzzleMode && !puzzleDeviated && puzzleIndex >= puzzleMoves.length) {
        setStatus(game.isGameOver() ? "Game over" : "Puzzle complete. Stockfish evaluation ready");
      }
      publishState();
    }
  };
  const handleDrop = (event: Event) => {
    const drop = (event as DropEvent).detail;
    const { source, target: destination, setAction } = drop;
    logBoardState("drop received", {
      source,
      destination,
      draggedPiece: drop.piece,
      dropNewPosition: drop.newPosition,
      dropOldPosition: drop.oldPosition,
    });
    if (game.turn() !== playerTurn || engineThinking) { setAction("snapback"); return; }
    const expectedMove = puzzleMoves[puzzleIndex];
    const piece = game.get(source as Parameters<typeof game.get>[0]);
    if (piece?.type === "p" && (destination[1] === "1" || destination[1] === "8")) {
      setAction("snapback");
      promotionDialog.addEventListener("close", () => {
        const choice = promotionDialog.returnValue;
        if (!choice) {
          setStatus("Promotion cancelled");
          publishState();
          return;
        }
        handlePlayerMove(`${source}${destination}${choice}`, expectedMove);
      }, { once: true });
      promotionDialog.showModal();
      return;
    }
    handlePlayerMove(`${source}${destination}`, expectedMove, setAction);
  };

  const handlePlayerMove = (
    attempted: string,
    expectedMove: string | undefined,
    setAction?: (action: "snapback" | "trash") => void,
  ) => {
    if (options.puzzleMode && !puzzleDeviated && expectedMove && attempted.slice(0, 4) !== expectedMove.slice(0, 4)) {
      puzzleDeviated = true;
      setStatus("Puzzle line missed; Stockfish has taken over");
    }
    if (!applyMove(attempted, "player")) {
      setAction?.("snapback"); setStatus("That move is not legal"); publishState(); return;
    }
    if (!puzzleDeviated && expectedMove) puzzleIndex += 1;
    setStatus(game.isGameOver() ? "Game over" : puzzleDeviated ? "Stockfish takeover active" : `Move accepted (${colorName(game.turn())} to move)`);
    publishState();
    queueMicrotask(() => logBoardState("after drop handler microtask", { expectedFen: game.fen() }));
    requestAnalysis();
  };

  const undoLastTurn = () => {
    let snapshot = history.pop();
    if (!snapshot) return;
    if (history.length > 0) snapshot = history.pop() ?? snapshot;
    sendEngine("stop");
    engineThinking = false;
    game = new Chess(snapshot.fen);
    gameSteps.splice(0, gameSteps.length, ...snapshot.steps);
    puzzleIndex = snapshot.puzzleIndex;
    puzzleDeviated = snapshot.puzzleDeviated;
    enginePlan = snapshot.enginePlan;
    evaluation = snapshot.evaluation;
    board.setPosition(game.fen(), false);
    setStatus("Took back one turn for both players");
    publishState();
  };

  let lastCommandNonce = options.command?.nonce ?? 0;
  const applyCommand = (nextProps: BoardProps) => {
    const command = nextProps.command;
    if (!command || command.nonce <= lastCommandNonce) return;
    lastCommandNonce = command.nonce;
    if (command.action === "takeback") {
      undoLastTurn();
    } else if (command.action === "hint-goal") {
      setStatus(`Goal: ${nextProps.hintGoal ?? "Find the best move"}`);
      publishState();
    } else if (command.action === "hint-next-piece") {
      const move = puzzleMoves[puzzleIndex];
      const piece = move ? game.get(move.slice(0, 2) as Parameters<typeof game.get>[0]) : undefined;
      setStatus(piece ? `Hint: move the ${piece.color === "w" ? "white" : "black"} ${piece.type}` : "No next piece available");
      publishState();
    } else if (command.action === "hint-next-move") {
      const move = puzzleMoves[puzzleIndex] ?? enginePlan[0];
      setStatus(move ? `Hint: consider ${move.slice(0, 2)} to ${move.slice(2, 4)}` : "No suggested move available");
      publishState();
    } else if (command.action === "hint-evaluation") {
      setStatus(evaluation.depth ? `Stockfish depth ${evaluation.depth}` : "Stockfish is still evaluating");
      publishState();
    }
  };

  board.addEventListener("drop", handleDrop);
  setStatus(savedState?.status ?? (options.puzzleMode ? "Puzzle ready" : `Your move (${playerColor})`));
  if (options.enginePolicy) engine = createEngine(handleEngineMessage);
  publishState();
  const boardTarget = target as BoardTarget;
  boardTarget.__chesspuzzleUpdate = (nextProps) => applyCommand((nextProps ?? {}) as BoardProps);
  return () => {
    board.removeEventListener("drop", handleDrop);
    engine?.terminate();
    delete boardTarget.__chesspuzzleUpdate;
    wrapper.remove();
  };
}
