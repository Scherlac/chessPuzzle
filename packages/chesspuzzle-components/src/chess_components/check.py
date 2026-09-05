from pathlib import Path
from collections.abc import Callable

from streamlit.components.v2 import component


_ASSET_DIR = Path(__file__).parent / "assets"
_checker = component(
    "chesspuzzle_component_checker",
    js=(_ASSET_DIR / "checker.js").read_text(encoding="utf-8"),
    isolate_styles=True,
)


def check_component(
    *,
    component_name: str,
    props: object | None = None,
    key: str = "chesspuzzle-checker",
    on_state_change: Callable[[], None] | None = None,
) -> object:
    """Bridge a globally registered browser component into Streamlit state."""
    return _checker(
        data={"component_name": component_name, "props": props},
        key=key,
        on_result_change=lambda: None,
        on_error_change=lambda: None,
        on_updated_change=on_state_change or (lambda: None),
    )