import { createSlice } from "@reduxjs/toolkit";

export const errorSlice = createSlice({
  name: 'error',
  initialState: {
    message: null,
    inputs:{}
  },
  reducers: {
    setInputError: (state, action) => {
      return { ...state, inputs: action.payload };
    },
    setError: (state, action) => {
      return { ...state, message: action.payload };
    },
    clearError: (state) => {
      return { ...state, message: null };
    },
  },
});

export const { setError, clearError, setInputError } = errorSlice.actions;

export default errorSlice.reducer;
