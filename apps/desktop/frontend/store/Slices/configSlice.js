import { createSlice } from "@reduxjs/toolkit";

export const configSlice = createSlice({
  name: 'config',
  initialState: {
    data: null,
  },
  reducers: {
    setData: (state, action) => {
      return { ...state, data: action.payload };
    },    
  },
});

export const { setData } = configSlice.actions;

export default configSlice.reducer;
