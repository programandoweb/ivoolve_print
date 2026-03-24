import { createSlice } from "@reduxjs/toolkit";

export const Slice = createSlice({
    name:'formInputs',
    initialState:{
        data:false
    },
    reducers: {
        setInputs: (state, action) => {
            return { ...state, data: { ...state.data, ...action.payload } };
        },
        clearInputs: (state) => {
            return { ...state, data: null };
        },
    }
})
export const    {
                    clearInputs,
                    setInputs
                }   =   Slice.reducer;
                