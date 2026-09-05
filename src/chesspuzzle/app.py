import streamlit as st

from chess_components import check_component, load_components, load_puzzles


st.set_page_config(page_title="Chess Puzzle")

st.title("Chess Puzzle")
load_components()

puzzles = load_puzzles()
puzzle_labels = [f"{p.puzzle_id} | {p.rating} | {' '.join(p.themes[:3])}" for p in puzzles]
selected_label = st.selectbox("Puzzle", puzzle_labels)
selected_puzzle = puzzles[puzzle_labels.index(selected_label)]

col1, col2, col3 = st.columns(3)
with col1:
    engine_policy = st.selectbox("Stockfish", ["follow", "play"], format_func=lambda value: {
        "follow": "Follow game (analysis only)",
        "play": "Allowed to move",
    }[value])
with col2:
    engine_level = st.slider("Stockfish level", min_value=1, max_value=20, value=10)
with col3:
    puzzle_mode = st.toggle("Puzzle mode", value=True)

if st.button("Reset puzzle"):
    st.rerun()

result = check_component(
	component_name="chess-board",
	key=f"chess-board-{selected_puzzle.puzzle_id}",
	props={
		"orientation": "white",
		"playAs": "white",
		"enginePolicy": engine_policy,
		"engineLevel": engine_level,
		"puzzleMode": puzzle_mode,
		"puzzleMoves": selected_puzzle.moves,
		"fen": selected_puzzle.fen,
	},
)
st.caption(f"Puzzle {selected_puzzle.puzzle_id} | Rating {selected_puzzle.rating}")
st.json(getattr(result, "state", None) or getattr(result, "result", None))