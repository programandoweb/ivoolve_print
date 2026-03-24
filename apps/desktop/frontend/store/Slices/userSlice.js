import { createSlice } from "@reduxjs/toolkit";

// Leer usuario almacenado (si existe)
let storedUser = null;
if (typeof window !== "undefined") {
  try {
    const data = localStorage.getItem("user");
    storedUser = data ? JSON.parse(data) : null;
  } catch (_) {
    storedUser = null;
  }
}

export const userSlice = createSlice({
  name: "user",
  initialState: {
    user: storedUser, // ← ahora se llama user
  },
  reducers: {
    setUser: (state, action) => {
      localStorage.setItem("user", JSON.stringify(action.payload));
      return { ...state, user: action.payload };
    },
    clearUser: (state) => {
      localStorage.removeItem("user");
      return { ...state, user: null };
    },
  },
});

export const { setUser, clearUser } = userSlice.actions;

export default userSlice.reducer;
