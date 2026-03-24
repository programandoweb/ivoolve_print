import { createSlice } from "@reduxjs/toolkit";

export const errorInputsSlice = createSlice({
  name: 'errorInputs',
  initialState: {
    inputErrors:  {
                    message:100
                  },
  },
  reducers: {
    setInputError: (state, action) => {
      const { inputName, errorMessage } = action.payload;
      
      return {
        ...state,
        inputErrors: {
          ...state.inputErrors,
          [inputName]: errorMessage,
        },
      };
    },
    clearInputErrors: (state) => {
      return { ...state, inputErrors: {} };
    },
  },
});

export const { setInputError, clearInputErrors } = errorInputsSlice.actions;

export default errorInputsSlice.reducer;
