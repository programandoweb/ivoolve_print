import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  batches: [],
  steps_all: [],
  dataset: null,
  main: {},
  steps_all_batches:[],
  isEditing: false, // ✅ NUEVO
  loadingGlobal: false, 
};

export const productionSlice = createSlice({
  name: "production",
  initialState,
  reducers: {
    setBatches: (state, action) => {
      state.batches = action.payload;
    },
    setStepsAll: (state, action) => {
      state.steps_all = action.payload;
    },
    setSteps_all_batches: (state, action) => {
      state.steps_all_batches = action.payload;
    },
    setDataset: (state, action) => {
      state.dataset = action.payload;
    },
    setMain: (state, action) => {
      state.main = action.payload;
    },
    setLoadingGlobal: (state, action) => {
      state.loadingGlobal = action.payload;
    },
    clearProduction: () => initialState,
    setEditing(state, action) {
      state.isEditing = action.payload;
    },
  },
});

export const {
  setBatches,
  setStepsAll,
  setSteps_all_batches,
  setDataset,
  setMain,
  clearProduction,
  setEditing,
  setLoadingGlobal
} = productionSlice.actions;

export default productionSlice.reducer;
