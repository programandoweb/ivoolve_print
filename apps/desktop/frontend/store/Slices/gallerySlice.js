import { createSlice } from "@reduxjs/toolkit";

export const gallerySlice = createSlice({
  name: 'gallery',
  initialState: {
    items: [],
  },
  reducers: {
    setItemsGallery: (state, action) => {
      return { ...state, items: action.payload };
    },
    clearSession: (state) => {
      return { ...state, items: null };
    },
  },
});

export const { setItemsGallery, clearSession } = gallerySlice.actions;

export default gallerySlice.reducer;
