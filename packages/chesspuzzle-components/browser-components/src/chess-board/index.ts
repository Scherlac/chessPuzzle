import template from "./board.html";
import styles from "./board.css";

type BoardProps = {
  fen?: string;
  orientation?: "white" | "black";
};

const pieces: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const startingPosition = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

function expandRank(rank: string): string[] {
  return [...rank].flatMap((value) =>
    /[1-8]/.test(value) ? Array(Number(value)).fill("") : value,
  );
}

function readPosition(fen?: string): string[] {
  const ranks = (fen || startingPosition).split(" ")[0].split("/");
  if (ranks.length !== 8 || ranks.some((rank) => expandRank(rank).length !== 8)) {
    return startingPosition.split("/").flatMap(expandRank);
  }
  return ranks.flatMap(expandRank);
}

export function createChessBoard(target: HTMLElement, props?: unknown): () => void {
  const options = (props ?? {}) as BoardProps;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = template;
  const board = wrapper.firstElementChild as HTMLElement;
  const squares = board.querySelector(".chess-board__squares") as HTMLElement;
  const position = readPosition(options.fen);
  const order = options.orientation === "black" ? [...Array(64).keys()].reverse() : [...Array(64).keys()];
  let selected: HTMLButtonElement | undefined;

  const buttons = order.map((index) => {
    const square = document.createElement("button");
    const row = Math.floor(index / 8);
    const column = index % 8;
    square.className = `chess-board__square ${(row + column) % 2 === 0 ? "chess-board__square--light" : "chess-board__square--dark"}`;
    square.type = "button";
    square.setAttribute("role", "gridcell");
    square.setAttribute("aria-label", `Chess square ${index + 1}`);
    square.textContent = pieces[position[index]] ?? "";
    square.addEventListener("click", () => {
      selected?.classList.remove("chess-board__square--selected");
      selected = square;
      square.classList.add("chess-board__square--selected");
    });
    squares.appendChild(square);
    return square;
  });

  const style = document.createElement("style");
  style.textContent = styles;
  target.append(style, board);

  return () => {
    buttons.forEach((button) => button.replaceWith(button.cloneNode(true)));
    wrapper.remove();
  };
}