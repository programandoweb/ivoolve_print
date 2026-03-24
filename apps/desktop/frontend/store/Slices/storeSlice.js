import { createSlice } from "@reduxjs/toolkit";

export const storeSlice = createSlice({
  name: 'store',
  initialState: {
    data: { 
            open:0,
            close:0,
            operationDay:0,
            totalSale:0,
          },
  },
  reducers: {
    setStore: (state, action) => {
      return { ...state, data: action.payload };
    },    
  },
});

export const { setStore } = storeSlice.actions;

export default storeSlice.reducer;
