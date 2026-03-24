import { createSlice } from "@reduxjs/toolkit";

export const commentsNotifySlice = createSlice({
  name: 'commentsNotify',
  initialState: {
    session: false,
    sonar:false,
  },
  reducers: {
    setActive: (state, action) => {
      return { ...state, session: action.payload };
    }, 
    setSound: (state, action) => {
      return { ...state, sonar: action.payload };
    },    
  },
});

export const { setActive, setSound } = commentsNotifySlice.actions;

export default commentsNotifySlice.reducer;
