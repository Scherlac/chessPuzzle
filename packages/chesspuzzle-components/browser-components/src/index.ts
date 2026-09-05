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
  "local-storage": (target, props, bridge) => {
    const options = (props ?? {}) as { storageKey?: string; value?: string | null };
    const key = options.storageKey ?? "chesspuzzle-value";
    const publish = (value: string | null) => {
      bridge?.setStateValue("value", value);
      bridge?.setTriggerValue("value", value);
    };
    if (options.value === undefined || options.value === null) {
      publish(window.localStorage.getItem(key));
    } else {
      window.localStorage.setItem(key, options.value);
      publish(options.value);
    }
    (target as HTMLElement & { __chesspuzzleUpdate?: (next: unknown) => void }).__chesspuzzleUpdate = (next) => {
      const value = (next as { value?: string | null })?.value;
      if (value !== undefined && value !== null) {
        window.localStorage.setItem(key, value);
        publish(value);
      }
    };
    return () => undefined;
  },
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
