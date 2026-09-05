import "chessboard-element";
import { Chess } from "chess.js";
import engineSource from "stockfish.js/stockfish.js";
import styles from "./board.css";

type BoardProps = {
  fen?: string;
  orientation?: "white" | "black";
  playAs?: "white" | "black";
  engine?: boolean;
};

type BoardElement = HTMLElement & {
  draggablePieces: boolean;
  orientation: "white" | "black";
  setPosition(position: string, useAnimation?: boolean): void;
};

type DropEvent = CustomEvent<{
  source: string;
  target: string;
  setAction(action: "snapback" | "trash"): void;
}>;

function createEngine(onMessage: (message: string) => void): Worker {
  const source = new Blob([engineSource], { type: "application/javascript" });
  const worker = new Worker(URL.createObjectURL(source));
  worker.addEventListener("message", (event) => onMessage(String(event.data)));
  worker.postMessage("uci");
  return worker;
}

export function createChessBoard(target: HTMLElement, props?: unknown): () => void {
  const options = (props ?? {}) as BoardProps;
  const game = new Chess(options.fen);
  const wrapper = document.createElement("div");
  wrapper.className = "chess-board-wrapper";
  const board = document.createElement("chess-board") as BoardElement;
  const status = document.createElement("output");
  status.className = "chess-board-status";
  status.setAttribute("aria-live", "polite");
  board.draggablePieces = true;
  board.orientation = options.orientation ?? "white";
  wrapper.append(board, status);
  board.setPosition(game.fen(), false);
  const style = document.createElement("style");
  style.textContent = styles;
  target.append(style, wrapper);

  const playerColor = options.playAs ?? "white";
  const playerTurn = playerColor === "white" ? "w" : "b";
  let engine: Worker | undefined;
  let engineReady = false;

  const updateStatus = (message: string) => {
    status.textContent = message;
  };

  updateStatus(options.engine ? `Your move (${playerColor})` : "Ready to play");

  const askEngineToMove = () => {
    if (!engine || !engineReady || game.isGameOver()) return;
    engine.postMessage(`position fen ${game.fen()}`);
    engine.postMessage("go depth 12");
    updateStatus("Stockfish is thinking...");
  };

  const handleEngineMessage = (message: string) => {
    if (message === "uciok") {
      engine?.postMessage("isready");
    } else if (message === "readyok") {
      engineReady = true;
      if (game.turn() !== playerTurn) askEngineToMove();
    } else if (message.startsWith("bestmove ")) {
      const move = message.split(" ")[1];
      if (move && move !== "(none)" && game.turn() !== playerTurn) {
        game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        board.setPosition(game.fen());
        updateStatus(game.isGameOver() ? "Game over" : `Your move (${playerColor})`);
      }
    }
  };

  if (options.engine) engine = createEngine(handleEngineMessage);

  const handleDrop = (event: Event) => {
    const { source, target: destination, setAction } = (event as DropEvent).detail;
    if (game.turn() !== playerTurn) {
      setAction("snapback");
      return;
    }
    try {
      game.move({ from: source, to: destination, promotion: "q" });
      updateStatus(game.isGameOver() ? "Game over" : `Your move (${game.turn() === "w" ? "white" : "black"})`);
      if (options.engine) askEngineToMove();
    } catch {
      setAction("snapback");
      updateStatus("That move is not legal");
    }
  };
  board.addEventListener("drop", handleDrop);

  return () => {
    board.removeEventListener("drop", handleDrop);
    engine?.terminate();
    wrapper.remove();
  };
}