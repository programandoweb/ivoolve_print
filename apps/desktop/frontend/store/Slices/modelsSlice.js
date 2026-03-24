import { createSlice } from "@reduxjs/toolkit";

export const modelsSlice = createSlice({
  name: 'models',
  initialState: {
    bool: null,
  },
  reducers: {
    setBool: (state, action) => {
      return { ...state, bool: action.payload };
    },    
  },
});

export const { setBool } = modelsSlice.actions;

export default modelsSlice.reducer;
