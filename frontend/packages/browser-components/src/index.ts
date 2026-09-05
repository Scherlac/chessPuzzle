export type BrowserComponent = (target: HTMLElement, props?: unknown) => unknown;

const components: Record<string, BrowserComponent> = {
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