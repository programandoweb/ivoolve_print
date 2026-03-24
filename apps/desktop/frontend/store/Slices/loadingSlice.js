import { createSlice } from "@reduxjs/toolkit";

export const loadingSlice = createSlice({
  name: 'loading',
  initialState: {
    open:false,    
  },
  reducers: {
    handleOpenLoading: (state) => {
      return { ...state, open: true};
    },
    handleCloseLoading: (state) => {
      return { ...state, open:false };
    },    
  },
});

export const {handleOpenLoading,handleCloseLoading } = loadingSlice.actions;

export default loadingSlice.reducer;
