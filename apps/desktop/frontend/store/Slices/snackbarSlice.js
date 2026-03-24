import { createSlice } from "@reduxjs/toolkit";

export const snackbarSlice = createSlice({
  name: 'snackebar',
  initialState: {
    text: null,
    open:false,
    variant:'info'
  },
  reducers: {
    setVariantSnacbar: (state, action) => {
      return { ...state, variant: action.payload };
    },
    setTextSnacbar: (state, action) => {
      return { ...state, text: action.payload };
    },
    clearTextSnacbar: () => {
      return { ...state, values: null };
    },    
    handleOpenSnackbar: (state) => {
      return { ...state, open: true };
    },
    handleCloseSnackbar: (state) => {
      return { ...state, open: false };
    },    
  },
});

export const {setVariantSnacbar,handleCloseSnackbar,handleOpenSnackbar,clearTextSnacbar,setTextSnacbar } = snackbarSlice.actions;

export default snackbarSlice.reducer;
