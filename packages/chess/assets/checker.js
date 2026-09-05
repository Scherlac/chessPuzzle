export default function (component) {
  const { data, parentElement, setStateValue, setTriggerValue } = component;
  const registry = window.__CHESS_PUZZLE_COMPONENTS__;
  const name = data?.component_name;

  if (!registry) {
    const message = "The browser component registry is not loaded";
    setStateValue("error", message);
    setTriggerValue("error", message);
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
  const cleanup = registry[name](target, data?.props);
  const result = { component_name: name, loaded: true, bridged: true };
  setStateValue("result", result);
  setTriggerValue("result", result);

  return () => {
    if (typeof cleanup === "function") cleanup();
    target.remove();
  };
}