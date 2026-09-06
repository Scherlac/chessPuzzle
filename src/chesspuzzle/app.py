from dataclasses import asdict
import logging
import tempfile
from time import perf_counter
from pathlib import Path

import streamlit as st

from chess_components import check_component, load_components, load_puzzles
from chesspuzzle.designer import capture_design, describe_puzzle, rank_solutions


logger = logging.getLogger("chesspuzzle")
STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


def state_from_result(result: object, fallback: object | None) -> dict:
    state = getattr(result, "state", None)
    if isinstance(state, dict):
        return state
    return fallback if isinstance(fallback, dict) else {}


def render_status(state: dict, evaluation: object | None = None) -> None:
    status = state.get("status", "Waiting for the board")
    turn = state.get("turn", "unknown").title()
    puzzle = state.get("puzzle", {})
    evaluation_state = state.get("evaluation", {})
    col1, col2, col3 = st.columns(3)
    col1.metric("Next", turn)
    col2.metric("Puzzle", "Complete" if puzzle.get("complete") else "In progress")
    score = evaluation_state.get("score")
    mate = evaluation_state.get("mate")
    score_text = f"mate {mate}" if mate is not None else f"{score:+.2f}" if isinstance(score, (int, float)) else "pending"
    depth = evaluation_state.get("depth")
    col3.metric("Stockfish", score_text, delta=f"depth {depth}" if depth else None)
    st.caption(status)
    if evaluation is not None:
        with st.expander("Puzzle details"):
            st.json(asdict(evaluation))


def command_buttons(prefix: str, *, puzzle: bool) -> dict | None:
    actions = [("takeback", "Take back"), ("hint-goal", "Hint: goal"), ("hint-next-piece", "Hint: next piece"), ("hint-next-move", "Hint: next move")]
    if not puzzle:
        actions = [actions[0], actions[-1]]
    columns = st.columns(len(actions))
    for column, (action, label) in zip(columns, actions):
        if column.button(label, key=f"{prefix}-{action}"):
            nonce = st.session_state.setdefault("command_nonce", 0) + 1
            st.session_state["command_nonce"] = nonce
            return {"action": action, "nonce": nonce}
    return None


def set_puzzle_level(level: int) -> None:
    st.session_state["puzzle_selector_widget"] = level


def render_board(*, key: str, props: dict, fallback_state: object | None) -> dict:
    started = perf_counter()
    result = check_component(component_name="chess-board", key=key, props=props)
    state = state_from_result(result, fallback_state)
    logger.info("Rendered board %s in %.3fs", key, perf_counter() - started)
    return state


def component_saved_state(component_key: str) -> dict | None:
    if st.session_state.get(f"{component_key}-hydrated"):
        return None
    stored = st.session_state.get(component_key, {})
    saved_state = stored.get("state") if isinstance(stored, dict) else None
    st.session_state[f"{component_key}-hydrated"] = True
    return saved_state if isinstance(saved_state, dict) else None


st.set_page_config(page_title="Chess Puzzle", layout="wide")
st.markdown(
    """
    <style>
        .stMainBlockContainer {
            max-width: 90vw;
            padding-left: 0;
            padding-right: 0;
            padding-top: 1.25rem;
        }
        .chess-page-heading {
            margin: 0 0 0.75rem;
            font-size: 1.65rem;
            line-height: 1.15;
            font-weight: 650;
        }
        [data-testid="stMetricValue"] {
            white-space: nowrap;
            font-size: clamp(1.2rem, 2.2vw, 2rem);
        }
        @media (max-width: 800px) {
            .stMainBlockContainer {
                max-width: 100%;
                padding-left: 1rem;
                padding-right: 1rem;
                padding-top: 0.75rem;
            }
        }
    </style>
    """,
    unsafe_allow_html=True,
)
load_components()
puzzles = load_puzzles()
puzzle_labels = [f"{p.puzzle_id} | {p.rating} | {' '.join(p.themes[:3])}" for p in puzzles]
st.session_state.setdefault("puzzle_selector_widget", 0)
st.session_state.setdefault("level_memory_loaded", False)
level_memory = check_component(
    component_name="local-storage",
    key="chess-puzzle-level-memory",
    props={
        "storageKey": "chesspuzzle:selected-level",
        "value": None if not st.session_state.get("level_memory_loaded") else str(st.session_state["puzzle_selector_widget"]),
    },
)
if not st.session_state["level_memory_loaded"]:
    memory_state = getattr(level_memory, "state", None)
    if isinstance(memory_state, dict) and "value" in memory_state:
        remembered_level = memory_state["value"]
        if isinstance(remembered_level, str) and remembered_level.isdigit():
            remembered_index = min(int(remembered_level), len(puzzles) - 1)
            st.session_state["puzzle_selector_widget"] = remembered_index
        st.session_state["level_memory_loaded"] = True
st.session_state.setdefault("puzzle_reset_nonce", 0)
st.session_state.setdefault("play_reset_nonce", 0)

puzzle_tab, play_tab, designer_tab = st.tabs(["Puzzle", "Play", "Puzzle designer"])
with puzzle_tab:
    st.markdown('<h1 class="chess-page-heading">Chess - Puzzle</h1>', unsafe_allow_html=True)
    board_col, info_col = st.columns([1, 1], gap="large")
    with info_col:
        st.subheader("Puzzle controls")
        puzzle_index = st.selectbox(
            "Puzzle level",
            range(len(puzzles)),
            format_func=lambda index: puzzle_labels[index],
            key="puzzle_selector_widget",
        )
        previous_col, next_col, reset_col = st.columns(3)
        previous_col.button(
            "Previous",
            disabled=puzzle_index == 0,
            on_click=set_puzzle_level,
            args=(puzzle_index - 1,),
        )
        next_col.button(
            "Next",
            disabled=puzzle_index == len(puzzles) - 1,
            on_click=set_puzzle_level,
            args=(puzzle_index + 1,),
        )
        if reset_col.button("Reset"):
            st.session_state["puzzle_reset_nonce"] += 1
            st.rerun()

        selected_puzzle = puzzles[puzzle_index]
        fen_side = selected_puzzle.fen.split()[1]
        puzzle_color = (
            "white" if fen_side == "b" else "black"
        ) if selected_puzzle.setup_move else ("white" if fen_side == "w" else "black")
        component_key = f"chess-board-puzzle-{selected_puzzle.puzzle_id}-{st.session_state['puzzle_reset_nonce']}"
        saved_state = component_saved_state(component_key)
        engine_policy = st.selectbox("Opponent", ["follow", "play"], format_func=lambda value: "Puzzle line" if value == "follow" else "Stockfish takeover", key="puzzle-opponent")
        engine_level = st.slider("Stockfish level", 1, 20, 10, key="puzzle-level")
        command = command_buttons("puzzle", puzzle=True)
        st.divider()
    with board_col:
        board_state = render_board(
            key=component_key,
            fallback_state=saved_state,
            props={
                "orientation": puzzle_color,
                "playAs": puzzle_color,
                "enginePolicy": engine_policy,
                "engineLevel": engine_level,
                "puzzleMode": True,
                "puzzleSetupMove": selected_puzzle.setup_move,
                "puzzleMoves": selected_puzzle.moves,
                "hintGoal": selected_puzzle.evaluation.objective,
                "browserStorageKey": f"chesspuzzle:last-level:{selected_puzzle.puzzle_id}",
                "command": command,
                "fen": selected_puzzle.fen,
                "state": saved_state,
            },
        )
    with info_col:
        render_status(board_state, selected_puzzle.evaluation)

with play_tab:
    st.markdown('<h1 class="chess-page-heading">Chess - Play game</h1>', unsafe_allow_html=True)
    play_key = f"chess-board-play-{st.session_state['play_reset_nonce']}"
    play_state = component_saved_state(play_key)
    board_col, info_col = st.columns([1, 1], gap="large")
    with info_col:
        st.subheader("Game controls")
        play_color = st.radio("Play as", ["white", "black"], horizontal=True, key="play-color")
        play_policy = st.selectbox("Opponent", ["play", "follow"], format_func=lambda value: "Stockfish" if value == "play" else "Analysis only", key="play-policy")
        play_level = st.slider("Stockfish level", 1, 20, 10, key="play-level")
        if st.button("New game", key="play-new-game"):
            st.session_state["play_reset_nonce"] += 1
            st.rerun()
        play_command = command_buttons("play", puzzle=False)
        st.divider()
    with board_col:
        board_state = render_board(
            key=play_key,
            fallback_state=play_state,
            props={
                "orientation": play_color,
                "playAs": play_color,
                "enginePolicy": play_policy,
                "engineLevel": play_level,
                "puzzleMode": False,
                "fen": STANDARD_FEN,
                "command": play_command,
                "state": play_state,
            },
        )
    with info_col:
        render_status(board_state)

with designer_tab:
    st.markdown('<h1 class="chess-page-heading">Chess - Puzzle designer</h1>', unsafe_allow_html=True)
    st.caption("Start from a FEN or board image, rank candidate lines, then create a shareable puzzle description.")
    source_col, preview_col = st.columns([1, 1], gap="large")
    with source_col:
        st.subheader("1. Starting position")
        source_mode = st.radio("Position source", ["FEN", "Board image"], horizontal=True, key="designer-source-mode")
        designer_fen = st.text_area("FEN", value=STANDARD_FEN, key="designer-fen") if source_mode == "FEN" else None
        uploaded = st.file_uploader("Board image", type=["png", "jpg", "jpeg", "webp"], key="designer-image") if source_mode == "Board image" else None
        side_to_move = st.selectbox("Side to move", ["w", "b"], format_func=lambda value: "White" if value == "w" else "Black", key="designer-side")
        objective = st.selectbox("Objective", ["gain", "concept", "mate"], key="designer-objective")
        winner = st.selectbox("Winner", ["White", "Black", "Draw"], key="designer-winner")
        setup_move = st.text_input("Optional setup move (UCI)", key="designer-setup") or None
        solve_clicked = st.button("Solve and rank lines", type="primary", key="designer-solve")
        if solve_clicked:
            if not designer_fen and not uploaded:
                st.error("Provide a FEN or upload a board image.")
            else:
                try:
                    image_path = None
                    if uploaded:
                        image_path = Path(tempfile.gettempdir()) / f"chesspuzzle-designer-{uploaded.name}"
                        image_path.write_bytes(uploaded.getvalue())
                    st.session_state["designer-result"] = rank_solutions(designer_fen, image_path=image_path, setup_move=setup_move, side_to_move=side_to_move)
                    st.session_state["designer-fen-active"] = st.session_state["designer-result"]["startFen"]
                except Exception as error:
                    st.error(str(error))
        result = st.session_state.get("designer-result")
        if result:
            candidates = result["line"][0]["candidates"] if result["line"] else []
            def candidate_label(index: int, candidate: dict) -> str:
                value = candidate["score"] if candidate["score"] is not None else f"mate {candidate['mate']}"
                return f"{index + 1}. {candidate['pv'][0]} | {value}"

            labels = [candidate_label(index, candidate) for index, candidate in enumerate(candidates)]
            selected_index = st.selectbox("Favored solution", range(len(candidates)), format_func=lambda index: labels[index], key="designer-selected")
            selected = candidates[selected_index]
            st.json({"bestmove": selected["pv"][0], "principal_variation": selected["pv"], "objective": objective})
    with preview_col:
        st.subheader("2. Position pair")
        active_fen = st.session_state.get("designer-fen-active", designer_fen or STANDARD_FEN)
        selected_line = []
        if st.session_state.get("designer-result"):
            selected_index = st.session_state.get("designer-selected", 0)
            selected_line = st.session_state["designer-result"]["line"][0]["candidates"][selected_index]["pv"]
        start_key = f"designer-start-{st.session_state.get('designer-result', {}).get('startFen', 'empty')}"
        render_board(key=start_key, fallback_state=None, props={"fen": active_fen, "orientation": "white", "playAs": "white", "puzzleMode": False, "puzzleMoves": selected_line})
        final_fen = st.session_state.get("designer-result", {}).get("line", [{}])[-1].get("fen", active_fen)
        st.caption("Starting position with the selected line")
        render_board(key=f"designer-final-{final_fen}", fallback_state=None, props={"fen": final_fen, "orientation": "white", "playAs": "white", "puzzleMode": False})
        st.caption("Final position")
        if st.button("Create title and factual description", key="designer-describe"):
            if not st.session_state.get("designer-result") or not selected_line:
                st.error("Solve the position and select a solution first.")
            else:
                try:
                    with tempfile.TemporaryDirectory() as temporary_directory:
                        image_path = Path(temporary_directory) / "puzzle-design.png"
                        capture_design(active_fen, selected_line, image_path, setup_move=setup_move)
                        metadata = describe_puzzle(image_path, {
                            "side_to_move": side_to_move,
                            "objective": objective,
                            "winner": winner,
                            "line": selected_line,
                        })
                    st.session_state["designer-metadata"] = metadata
                except Exception as error:
                    st.error(str(error))
        metadata = st.session_state.get("designer-metadata")
        if metadata:
            st.subheader(metadata.get("title", "Puzzle title"))
            st.write(metadata.get("description", ""))
