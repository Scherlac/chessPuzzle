import { createChessBoard } from "./chess-board/index";

export type BrowserComponent = (
  target: HTMLElement,
  props?: unknown,
  bridge?: {
    setStateValue: (name: string, value: unknown) => void;
    setTriggerValue: (name: string, value: unknown) => void;
  },
) => unknown;

const components: Record<string, BrowserComponent> = {
  "chess-board": createChessBoard,
  status: (target, props) => {
    target.textContent = JSON.stringify(props ?? { ready: true });
  },
};

declare global {
  interface Window {
    __CHESS_PUZZLE_COMPONENTS__?: Record<string, BrowserComponent>;
  }
}

window.__CHESS_PUZZLE_COMPONENTS__ = components;
