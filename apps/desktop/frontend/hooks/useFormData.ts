'use client';

import { useSelector, useDispatch } from "react-redux";
import { setError } from "@/store/Slices/errorSlice";
import { setDialogMessage, setShowModal, setDialogList } from "@/store/Slices/dialogMessagesSlice";
import { setData, setDataTable, setInputs, clearDataInputs, clearData } from "@/store/Slices/dataSlice";
import { useState } from "react";
import { useRouter } from 'next/navigation';
import { handleCloseLoading, handleOpenLoading } from "@/store/Slices/loadingSlice";

/**
 * Contract
 */
interface FormInputs {
  [key: string]: string | number | boolean;
}

let defaultEndPoint = typeof window !== 'undefined' ? window.location.origin : '/';
const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
const search = typeof window !== 'undefined' ? window.location.search : '/';
//const user = typeof window !== 'undefined' ? localStorage.getItem("user") : null;

interface RootState {
  data: {
    dataInputs: any;
  };
}

/**
 * 🔔 Toast helper (NO altera lógica)
 */
const fireToast = (message: string, type: 'success' | 'error' | 'info') => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: { message, type }
    })
  );
};

const useFormData = (
  endPoint?: string | undefined | false,
  autoload?: boolean,
  prefixed?: string | undefined | false,
  skipLoading?: boolean | undefined | false,
) => {

  /**
   * Armo endpoint backend
   */
  if (defaultEndPoint.includes("localhost")) {
    defaultEndPoint = defaultEndPoint.replace(
      "localhost:" + process.env.NEXT_PUBLIC_PORT_FRONT,
      "localhost:" + process.env.NEXT_PUBLIC_PORT
    );
  }

  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    defaultEndPoint = process.env.NEXT_PUBLIC_BACKEND_URL;
  }

  const [dataset, setDataset] = useState<any>(null);
  const router = useRouter();
  const backend = (endPoint || defaultEndPoint + process.env.NEXT_PUBLIC_VERSION);
  const formData = useSelector<RootState>(state => state.data.dataInputs);
  const dispatch = useDispatch();
  const [input, setInput] = useState<FormInputs>({});

  /**
   * Error helpers
   */
  const errorResponse = (error: any) => {
    dispatch(setError(error));
  };

  const redirectLogin = (message: string) => {
    localStorage.removeItem('user');
    setTimeout(() => {
      router.replace(`/auth`);
      dispatch(setDialogMessage(message));
    }, 1000);
  };

  const errorDialog = (message: string, list: any) => {
    if (message === 'Route [login] not defined.') {
      redirectLogin("No está autorizado para estar aquí.<div>Debe iniciar sesión</div>");
      return dispatch(setShowModal(true));
    }

    dispatch(setDialogMessage(message));
    dispatch(setShowModal(true));
    dispatch(setDialogList(list || []));
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    const inputs: any = input;
    const method: "get" | "post" | "put" | "delete" = inputs?.id ? "put" : "post";
    handleRequest(backend + window.location.pathname, method, inputs, false);
  };

  const getUserLocalStore = async () => {
    const userStr = localStorage.getItem('user');

    if (!userStr) return false;

    try {
      const parsed = JSON.parse(userStr);
      return parsed?.token || false;
    } catch {
      return false;
    }
  };

  /**
   * 🚀 HANDLE REQUEST (con toast agregado)
   */
  const handleRequest = async (
    url: string = backend,
    method: "get" | "post" | "put" | "delete" = 'get',
    body: object | undefined = {},
    isFileUpload: boolean = false
  ) => {
    const shouldToast = method !== 'get';

    try {
      if (!skipLoading) dispatch(handleOpenLoading());
      dispatch(clearDataInputs());
      dispatch(clearData());

      if (typeof window === 'undefined') return;

      let token: string | false | null = null;

      

      const userSecondary = localStorage.getItem("user");
      if (!token && userSecondary) {
        try {
          const parsed = JSON.parse(userSecondary);
          token = parsed?.token || null;
        } catch {
          token = null;
        }
      }

      if (!token) {
        token = await getUserLocalStore();
      }

      const headers = new Headers({
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      });

      const options: RequestInit = {
        method,
        headers,
        body: method !== 'get' && body ? JSON.stringify(body) : undefined,
      };

      const response = await fetch(url, options);

      if (!response.ok) {
        const dataResponse = await response.json();

        if (shouldToast) {
          fireToast(
            dataResponse?.message || 'Error en la solicitud',
            'error'
          );
        }

        return errorDialog(dataResponse.message, dataResponse.errors || []);
      }

      const contentType = response.headers.get('Content-Type');
      dispatch(handleCloseLoading());

      if (contentType && contentType.includes('application/json')) {
        try {
          const dataResponse = await response.json();

          if (dataResponse.status === 200 || dataResponse.status === 201) {

            if (shouldToast && dataResponse?.message) {
              fireToast(dataResponse.message, 'success');
            }

            setDataset(dataResponse.data);

            if (dataResponse.data && typeof dataResponse.data === "object") {
              Object.entries(dataResponse.data).map((row) => {
                const dataRow: any = row[1] || {};

                if (dataRow?.current_page) {
                  return dispatch(setDataTable(dataRow));
                }

                if (dataRow?.id) {
                  dispatch(setInputs(dataRow));
                }

                dispatch(setData(dataRow));
              });
            }

            dispatch(handleCloseLoading());
            return dataResponse.data;
          }

        } catch (error) {
          dispatch(handleCloseLoading());
          errorResponse(error);
          console.error('Error parsing JSON:', error);
        }
      } else {
        dispatch(handleCloseLoading());
        errorResponse('Non-JSON response received');
      }

    } catch (error: any) {
      dispatch(handleCloseLoading());

      console.log(error)

      if (shouldToast) {
        fireToast(
          'Error de comunicación con el servidor',
          'error'
        );
      }

      errorResponse("error de petición: NetworkError");
      console.log('Error:', error);
    }

    dispatch(handleCloseLoading());
  };

  const autoDispatch = () => {
    handleRequest(backend + pathname + search);
  };

  const onUpload = (name: any, value: any) => {
    setInput((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return {
    dataset,
    onUpload,
    inputs: input,
    setInputs: setInput,
    autoDispatch,
    search,
    pathname,
    handleRequest,
    backend,
    handleSubmit,
    endPoint: endPoint || defaultEndPoint,
    autoload: autoload || false,
    prefixed: prefixed || '',
  };
};

export default useFormData;
