from pathlib import Path
import json

import streamlit as st
from streamlit.components.v2 import component


_ASSET_DIR = Path(__file__).parent / "assets"
_LOADER_JS = (_ASSET_DIR / "loader.js").read_text(encoding="utf-8")
_BROWSER_COMPONENTS_JS = (_ASSET_DIR / "browser-components.js").read_text(encoding="utf-8")
_LOADER_JS = _LOADER_JS.replace(
    'const browserComponentsSource = "__BROWSER_COMPONENTS_SOURCE__";',
    f"const browserComponentsSource = {json.dumps(_BROWSER_COMPONENTS_JS)};",
)
_loader = component(
    "chesspuzzle_component_loader",
    js=_LOADER_JS,
    isolate_styles=True,
)


def load_components(*, key: str = "chesspuzzle-loader") -> object:
    """Load the browser component registry once and report its status."""
    return _loader(key=key, on_loaded_change=lambda: None, on_error_change=lambda: None)