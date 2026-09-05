from pathlib import Path

from streamlit.components.v2 import component


_ASSET_DIR = Path(__file__).parent / "assets"
_checker = component(
    "chesspuzzle_component_checker",
    js=(_ASSET_DIR / "checker.js").read_text(encoding="utf-8"),
    isolate_styles=True,
)


def check_component(
    *, component_name: str, key: str = "chesspuzzle-checker"
) -> object:
    """Bridge a globally registered browser component into Streamlit state."""
    return _checker(
        data={"component_name": component_name},
        key=key,
        on_result_change=lambda: None,
        on_error_change=lambda: None,
    )