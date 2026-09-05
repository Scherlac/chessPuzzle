"use strict";
(() => {
  // packages/browser-components/src/index.ts
  var components = {
    status: (target, props) => {
      target.textContent = JSON.stringify(props ?? { ready: true });
    }
  };
  window.__CHESS_PUZZLE_COMPONENTS__ = components;
})();
