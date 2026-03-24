import { createSlice } from "@reduxjs/toolkit";

export const dialogFullscreenSlice = createSlice({
  name: 'dialog',
  initialState: {
    open: null,
    data:[],
    key:"",
    drawerLeft:null,
    drawerDataset:null
  },
  reducers: {
    setDrawerDataset: (state, action) => {
      return { ...state, drawerDataset: action.payload };
    },
    setDrawerLeft: (state, action) => {
      return { ...state, drawerLeft: action.payload };
    },
    setOpen: (state, action) => {
      return { ...state, open: action.payload };
    },
    setData: (state, action) => {
      return { ...state, data: action.payload };
    },
    setKey: (state, action) => {
      return { ...state, key: action.payload };
    },    
  },
});

export const { setOpen, setData, setKey, setDrawerLeft, setDrawerDataset  } = dialogFullscreenSlice.actions;

export default dialogFullscreenSlice.reducer;
