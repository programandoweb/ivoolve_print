import { createSlice } from "@reduxjs/toolkit";

export const favoritiesSlice = createSlice({
  name: 'favorities',
  initialState: {
    data: {},
  },
  reducers: {
    setFavorities: (state, action) => {
      return { ...state, data: action.payload };
    },    
  },
});

export const { setFavorities } = favoritiesSlice.actions;

export default favoritiesSlice.reducer;
