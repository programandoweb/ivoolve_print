// slices/soundSlice.ts
import { createSlice } from "@reduxjs/toolkit";

export const soundSlice = createSlice({
  name: "sound",
  initialState: {
    enabled: false,   // Permiso global
    play: false,       // Estado del “disparo” del sonido
    play2: false
  },
  reducers: {
    enableSound: (state) => ({ ...state, enabled: true }),

    // 🔥 Activa el sonido y se auto-desactiva en 3 segundos
    triggerPlaySound: (state, action) => {
      if(action.payload===1){
        console.log("este")
        state.play2 = true;
      }else{
        state.play = true;
      }      
    },

    stopPlaySound: (state) => {
      state.play = false;
    },

    stopPlaySound2: (state) => {
      state.play2 = false;
    }
  },
});

export const { enableSound, triggerPlaySound, stopPlaySound , stopPlaySound2 } = soundSlice.actions;

export default soundSlice.reducer;
