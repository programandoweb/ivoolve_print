import { createSlice } from "@reduxjs/toolkit";

export const mesasSlice = createSlice({
  name: 'mesas',
  initialState: {
    items:null,
    connects:null
  },
  reducers: {
    setMesa: (state, action) => {
      return { ...state, items: action.payload };
    },
    setConnects: (state, action) => {
      return { ...state, connects: action.payload };
    },     
  },
});

export const { setMesa , setConnects}   =   mesasSlice.actions;

export default mesasSlice.reducer;
