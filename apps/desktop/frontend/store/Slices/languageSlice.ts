import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Define los posibles tipos de lenguaje que puede tener `selectedLanguage`
type LanguageType = {
  [key: string]: string; // Cambia según la estructura real de tus traducciones
};

interface LanguageState {
  selectedLanguage: LanguageType | null; // Usamos LanguageType o null
}

const initialState: LanguageState = {
  selectedLanguage: null, // Lenguaje predeterminado es null
};

const languageSlice = createSlice({
  name: 'language',
  initialState,
  reducers: {
    setLanguage: (state, action: PayloadAction<LanguageType>) => {
      state.selectedLanguage = action.payload;
      localStorage.setItem('selectedLanguage', JSON.stringify(action.payload)); // Guardar en localStorage
    },
  },
});

export const { setLanguage } = languageSlice.actions;

export default languageSlice.reducer;
