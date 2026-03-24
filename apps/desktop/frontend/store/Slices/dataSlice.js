import { createSlice } from "@reduxjs/toolkit";

export const dataSlice = createSlice({
  name: 'data',
  initialState: {
    values: null,
    dataTable:{},
    dataInputs:{}
  },
  reducers: {
    setData: (state, action) => {
      return { ...state, values: action.payload };
    },
    clearData: (state) => {
      return { ...state, values: null };
    },    
    clearDataInputs: (state) => {
      return { ...state, dataInputs: {} };
    },    
    setDataTable: (state, action) => {
      return { ...state, dataTable: action.payload };
    },    
    setInputs: (state, action) => {
      return { ...state, dataInputs: { ...state.dataInputs, ...action.payload } };
    },        
  },
});

export const { clearData, clearDataInputs, setData, setDataTable, setInputs } = dataSlice.actions;

export default dataSlice.reducer;
