import { createSlice } from "@reduxjs/toolkit";

export const socketSlice = createSlice({
  name: 'socketState',
  initialState: {
    eventDinamic: null,
    sock: null,
    status: null,
    mesa_id: null,
    cuenta_id: null,
    user: null,
    dispatchEmit: null
  },
  reducers: {
    setDispatchEmit: (state, action) => ({ ...state, dispatchEmit: action.payload }),
    clearDispatchEmit: (state) => ({ ...state, dispatchEmit: null }),
    clearEventDinamic: (state) => ({ ...state, eventDinamic: null }),
    setEventDinamic: (state, action) => (
      { ...state, eventDinamic: action.payload }
    ),
    setSock: (state, action) => ({ ...state, sock: action.payload }),
    setStatus: (state, action) => ({ ...state, status: action.payload }),
    setMesaId: (state, action) => ({ ...state, mesa_id: action.payload }),
    setCuentaId: (state, action) => ({ ...state, cuenta_id: action.payload }),
    setUser: (state, action) => ({ ...state, user: action.payload }),
  },
});

export const {
  setEventDinamic,
  setSock,
  setStatus,
  setMesaId,
  setDispatchEmit,
  setCuentaId,
  setUser,
  clearDispatchEmit,
  clearEventDinamic
} = socketSlice.actions;

export default socketSlice.reducer;
