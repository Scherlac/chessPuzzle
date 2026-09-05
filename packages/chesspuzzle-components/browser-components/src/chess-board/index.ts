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
  puzzleMoves?: string[];
};
type ComponentBridge = {
  setStateValue: (name: string, value: unknown) => void;
  setTriggerValue: (name: string, value: unknown) => void;
};
type BoardElement = HTMLElement & {
  draggablePieces: boolean;
  orientation: "white" | "black";
  setPosition(position: string, useAnimation?: boolean): void;
};
type DropEvent = CustomEvent<{ source: string; target: string; setAction(action: "snapback" | "trash"): void }>;
type GameStep = { ply: number; move: string; san: string; actor: "player" | "stockfish" | "puzzle" };
type Evaluation = { score: number | null; mate: number | null; depth: number | null };
type ComponentState = {
  fen: string;
  turn: "white" | "black";
  status: string;
  gameSteps: GameStep[];
  enginePlan: string[];
  evaluation: Evaluation;
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
  const game = new Chess(options.fen);
  const playerColor = options.playAs ?? "white";
  const playerTurn = playerColor === "white" ? "w" : "b";
  const puzzleMoves = options.puzzleMoves ?? [];
  const componentApi = bridge ?? { setStateValue: () => undefined, setTriggerValue: () => undefined };
  const wrapper = document.createElement("div");
  wrapper.className = "chess-board-wrapper";
  const board = document.createElement("chess-board") as BoardElement;
  const status = document.createElement("output");
  status.className = "chess-board-status";
  status.setAttribute("aria-live", "polite");
  board.draggablePieces = true;
  board.orientation = options.orientation ?? playerColor;
  wrapper.append(board, status);
  board.setPosition(game.fen(), false);
  const style = document.createElement("style");
  style.textContent = styles;
  target.append(style, wrapper);

  let engine: Worker | undefined;
  let engineReady = false;
  let engineThinking = false;
  let puzzleIndex = 0;
  let puzzleDeviated = false;
  let enginePlan: string[] = [];
  let evaluation: Evaluation = { score: null, mate: null, depth: null };
  const gameSteps: GameStep[] = [];

  const setStatus = (message: string) => { status.textContent = message; };
  const publishState = () => {
    const state: ComponentState = {
      fen: game.fen(), turn: colorName(game.turn()), status: status.textContent ?? "",
      gameSteps: [...gameSteps], enginePlan: [...enginePlan], evaluation: { ...evaluation },
      puzzle: { enabled: Boolean(options.puzzleMode), expected: puzzleMoves.length, completed: puzzleIndex,
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
    setStatus(`Your move (${playerColor})`);
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
    try {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
      gameSteps.push({ ply: gameSteps.length + 1, move: uci, san: move.san, actor });
      board.setPosition(game.fen());
      return true;
    } catch { return false; }
  };
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
      publishState();
    } else if (message.startsWith("bestmove ")) {
      engineThinking = false;
      const move = message.split(" ")[1];
      if (move && move !== "(none)" && engineCanMove() && applyMove(move, puzzleDeviated ? "stockfish" : "puzzle")) {
        if (options.puzzleMode && !puzzleDeviated) puzzleIndex += 1;
        setStatus(game.isGameOver() ? "Game over" : `Your move (${playerColor})`);
      }
      publishState();
    }
  };
  const handleDrop = (event: Event) => {
    const { source, target: destination, setAction } = (event as DropEvent).detail;
    if (game.turn() !== playerTurn || engineThinking) { setAction("snapback"); return; }
    const expectedMove = puzzleMoves[puzzleIndex];
    const attempted = `${source}${destination}q`;
    if (options.puzzleMode && !puzzleDeviated && expectedMove && attempted.slice(0, 4) !== expectedMove.slice(0, 4)) {
      puzzleDeviated = true;
      setStatus("Puzzle line missed; Stockfish has taken over");
    }
    if (!applyMove(attempted, "player")) {
      setAction("snapback"); setStatus("That move is not legal"); publishState(); return;
    }
    if (!puzzleDeviated && expectedMove) puzzleIndex += 1;
    setStatus(game.isGameOver() ? "Game over" : `Move accepted (${colorName(game.turn())} to move)`);
    publishState();
    requestAnalysis();
  };

  board.addEventListener("drop", handleDrop);
  setStatus(options.puzzleMode ? "Puzzle ready" : `Your move (${playerColor})`);
  if (options.enginePolicy) engine = createEngine(handleEngineMessage);
  publishState();
  return () => { board.removeEventListener("drop", handleDrop); engine?.terminate(); wrapper.remove(); };
}
