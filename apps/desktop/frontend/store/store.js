import { configureStore } from "@reduxjs/toolkit";
import errorReducer from "./Slices/errorSlice";
import errorInputsSliceReducer from "./Slices/errorInputsSlice";
import userReducer from "./Slices/userSlice";
import dataSlice from "./Slices/dataSlice";
import dialogMessagesSlice from "./Slices/dialogMessagesSlice";
import shoppingCartSlice from "./Slices/shoppingCartSlice";
import snackbarSlice from "./Slices/snackbarSlice";
import loadingSlice from "./Slices/loadingSlice";
import languageSlice from "./Slices/languageSlice";
import storeSlice from "./Slices/storeSlice";
import tableSlice from "./Slices/tableSlice";
import socketOns from "./Slices/socketSlice";
import soundSlice from "./Slices/soundSlice";
import productionSlice from "./Slices/productionSlice";

export default configureStore({
  reducer: {
    sound: soundSlice,
    socketOns: socketOns,
    data: dataSlice,
    snackbar: snackbarSlice,
    shoppingCart: shoppingCartSlice,
    error: errorReducer,
    errorInputs: errorInputsSliceReducer,
    user: userReducer,
    dialog: dialogMessagesSlice,
    loading: loadingSlice,
    lang: languageSlice,
    store: storeSlice,
    table: tableSlice,
    production: productionSlice,
    socketRedux:socketOns,
  },
});