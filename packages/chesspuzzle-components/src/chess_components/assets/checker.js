export default function (component) {
  const { data, parentElement, setStateValue, setTriggerValue } = component;
  const name = data?.component_name;

  let cleanup;
  let retryTimer;
  let attempts = 0;

  const mount = () => {
    const registry = window.__CHESS_PUZZLE_COMPONENTS__;
    if (!registry) {
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

    const target = document.createElement("div");
    parentElement.appendChild(target);
    cleanup = registry[name](target, data?.props, { setStateValue, setTriggerValue });
    const result = { component_name: name, loaded: true, bridged: true };
    setStateValue("result", result);
    setTriggerValue("result", result);
  };

  mount();

  return () => {
    window.clearTimeout(retryTimer);
    if (typeof cleanup === "function") cleanup();
    target.remove();
  };
}
