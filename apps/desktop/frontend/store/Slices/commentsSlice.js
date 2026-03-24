import { createSlice } from "@reduxjs/toolkit";

export const commentsSlice = createSlice({
  name: 'comments',
  initialState: {
    session: false,
  },
  reducers: {
    setReload: (state, action) => {
      return { ...state, session: action.payload };
    },    
  },
});

export const { setReload } = commentsSlice.actions;

export default commentsSlice.reducer;
