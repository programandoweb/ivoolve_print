import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// Interfaz para el estado del store
interface TableState {
  order: {
    items: any[];
    client_id: string | null;
    order_number: string | null;
  };
  label: string;
  id: string;
  cuenta: {
    [key: string]: any;
  };
}

// Estado inicial del store
const initialState: TableState = {
  order: {
    items: [],
    client_id: null,
    order_number: null,
  },
  label: "",
  id: "",
  cuenta: {},
};

// Slice de Redux
export const tableSlice = createSlice({
  name: "table",
  initialState,
  reducers: {
    setTable: (state, action: PayloadAction<TableState>) => {
      return { ...state, ...action.payload };
    },
    clearTable: (state) => {
      return initialState;
    },
  },
});

// Acciones exportadas
export const { setTable, clearTable } = tableSlice.actions;

// Reducer exportado
export default tableSlice.reducer;