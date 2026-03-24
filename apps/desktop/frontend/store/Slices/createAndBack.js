import { createSlice } from "@reduxjs/toolkit";

export const createAndBack = createSlice({
  name: 'createAndBack',
  initialState: {
    session: null,
  },
  reducers: {
    setSession: (state, action) => {
      return { ...state, session: action.payload };
    },
    clearSession: (state) => {
      return { ...state, session: null };
    },
  },
});

export const { setSession, clearSession } = createAndBack.actions;

export default createAndBack.reducer;
