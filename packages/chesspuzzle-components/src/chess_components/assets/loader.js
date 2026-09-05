const registryKey = "__CHESS_PUZZLE_COMPONENTS__";
const scriptId = "chesspuzzle-browser-components";

export default function (component) {
  const startedAt = performance.now();
  const { setStateValue, setTriggerValue } = component;
  const browserComponentsSource = "__BROWSER_COMPONENTS_SOURCE__";

  if (window[registryKey]) {
    console.info("[chess-loader] registry already loaded", { elapsedMs: performance.now() - startedAt });
    window.dispatchEvent(new CustomEvent("chesspuzzle-components-ready"));
    setStateValue("loaded", true);
    setTriggerValue("loaded", true);
    return;
  }

  const existingScript = document.getElementById(scriptId);
  if (existingScript) {
    console.info("[chess-loader] waiting for existing script", { elapsedMs: performance.now() - startedAt });
    existingScript.addEventListener("load", () => {
      setStateValue("loaded", true);
      setTriggerValue("loaded", true);
    }, { once: true });
    existingScript.addEventListener("error", () => {
      setStateValue("error", "Unable to load browser-components.js");
      setTriggerValue("error", "Unable to load browser-components.js");
    }, { once: true });
    return;
  }

  const script = document.createElement("script");
  console.info("[chess-loader] injecting browser bundle", { elapsedMs: performance.now() - startedAt });
  script.id = scriptId;
  script.textContent = browserComponentsSource;
  document.head.appendChild(script);
  window.dispatchEvent(new CustomEvent("chesspuzzle-components-ready"));
  setStateValue("loaded", true);
  setTriggerValue("loaded", true);
}