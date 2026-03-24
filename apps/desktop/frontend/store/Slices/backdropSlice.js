import { createSlice } from "@reduxjs/toolkit";

export const backdropSlice = createSlice({
  name: 'backdrop',
  initialState: {
    status: false,
  },
  reducers: {
    setStatus: (state, action) => {
      return { ...state, status: action.payload };
    },    
  },
});

export const { setStatus } = backdropSlice.actions;

export default backdropSlice.reducer;
