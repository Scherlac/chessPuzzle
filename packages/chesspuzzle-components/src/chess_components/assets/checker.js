export default function (component) {
  const startedAt = performance.now();
  const { data, parentElement, setStateValue, setTriggerValue } = component;
  const name = data?.component_name;
  console.info("[chess-checker] component invoked", { name, hasData: Boolean(data) });

  const configuration = { ...(data?.props ?? {}) };
  delete configuration.state;
  const configurationSignature = JSON.stringify(configuration);
  const existingState = parentElement.__chesspuzzleCheckerState;
  if (existingState && existingState.name === name && existingState.configurationSignature === configurationSignature) {
    console.info("[chess-checker] reusing existing component", { elapsedMs: performance.now() - startedAt });
    return () => {};
  }

  let cleanup;
  let target;
  let retryTimer;
  let attempts = 0;

  const mount = () => {
    const registry = window.__CHESS_PUZZLE_COMPONENTS__;
    if (!registry) {
      console.info("[chess-checker] registry not ready", { attempts, elapsedMs: performance.now() - startedAt });
      if (attempts++ < 100) {
        retryTimer = window.setTimeout(mount, 50);
      } else {
        const message = "The browser component registry could not be loaded";
        setStateValue("error", message);
        setTriggerValue("error", message);
      }
      return;
    }

    if (typeof registry[name] !== "function") {
      const message = `Browser component '${name}' is not registered`;
      setStateValue("error", message);
      setTriggerValue("error", message);
      return;
    }

    if (parentElement.__chesspuzzleCheckerState) {
      const previousState = parentElement.__chesspuzzleCheckerState;
      console.info("[chess-checker] replacing component configuration", { elapsedMs: performance.now() - startedAt });
      if (typeof previousState.cleanup === "function") previousState.cleanup();
      previousState.target.remove();
    }

    target = document.createElement("div");
    target.dataset.chesspuzzleCheckerTarget = "true";
    parentElement.appendChild(target);
    cleanup = registry[name](target, data?.props, { setStateValue, setTriggerValue });
    parentElement.__chesspuzzleCheckerState = { name, configurationSignature, target, cleanup };
    console.info("[chess-checker] mounted", { elapsedMs: performance.now() - startedAt, hasCleanup: typeof cleanup === "function" });
    const result = { component_name: name, loaded: true, bridged: true };
    setStateValue("result", result);
    setTriggerValue("result", result);
  };

  mount();

  return () => {
    console.info("[chess-checker] cleanup", { elapsedMs: performance.now() - startedAt });
    if (parentElement.__chesspuzzleCheckerState?.target !== target) return;
    window.clearTimeout(retryTimer);
    if (typeof cleanup === "function") cleanup();
    target?.remove();
    delete parentElement.__chesspuzzleCheckerState;
  };
}
