import streamlit as st

from chess_components import check_component, load_components


st.set_page_config(page_title="Chess Puzzle")

st.title("Chess Puzzle")
load_components()
result = check_component(component_name="status")
st.json(result)