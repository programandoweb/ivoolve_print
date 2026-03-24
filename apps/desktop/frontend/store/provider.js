'use client';
import { Provider } from "react-redux";
import configureStore  from "./store";


function Providers({ children }) {
  return <Provider store={configureStore}>{children}</Provider>;
}

export default Providers;
