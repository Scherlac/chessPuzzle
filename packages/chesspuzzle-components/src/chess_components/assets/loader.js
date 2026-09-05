const registryKey = "__CHESS_PUZZLE_COMPONENTS__";
const scriptId = "chesspuzzle-browser-components";

export default function (component) {
  const { setStateValue, setTriggerValue } = component;
  const browserComponentsSource = "__BROWSER_COMPONENTS_SOURCE__";

  if (window[registryKey]) {
    window.dispatchEvent(new CustomEvent("chesspuzzle-components-ready"));
    setStateValue("loaded", true);
    setTriggerValue("loaded", true);
    return;
  }

  const existingScript = document.getElementById(scriptId);
  if (existingScript) {
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
  script.id = scriptId;
  script.textContent = browserComponentsSource;
  document.head.appendChild(script);
  window.dispatchEvent(new CustomEvent("chesspuzzle-components-ready"));
  setStateValue("loaded", true);
  setTriggerValue("loaded", true);
}