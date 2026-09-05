import streamlit as st

from chess_components import check_component, load_components


st.set_page_config(page_title="Chess Puzzle")

st.title("Chess Puzzle")
load_components()
result = check_component(
	component_name="chess-board",
	props={"orientation": "white"},
)
st.json(result)