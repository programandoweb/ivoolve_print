import { createSlice } from "@reduxjs/toolkit";

export const shoppingCartSlice = createSlice({
  name: 'shoppingCart',
  initialState: {
    current_page: 0,
    first_page_url: null,
    from: null,
    last_page: null,
    last_page_url: null,
    links: null,
    next_page_url: null,
    path: null,
    per_page: null,
    prev_page_url: null,
    to: null,
    total: null,
    subtotal:0,
    price: 0,
    data: [],
    products: [],
    categories: [],
    orderItems: {},    
    order_id: null,
    referer_id: null,
    client_id: null,
    responseBackend: null,
    items: {},
    describe: {},
    annotation: {},
    search: null,
  },
  reducers: {
    setSubTotal: (state, action) => {
      return { ...state, subtotal: action.payload };
    },
    setPrice: (state, action) => {
      return { ...state, price: action.payload };
    },
    setValue: (state, action) => {
      return { ...state, items: action.payload };
    },
    setDescribe: (state, action) => {
      return { ...state, describe: action.payload };
    },    
    setAnnotation: (state, action) => {
      return { ...state, annotation: action.payload };
    },    
    setResponseBackend: (state, action) => {
      return { ...state, responseBackend: action.payload };
    },    
    setOrderItems: (state, action) => {
      return { ...state, orderItems: action.payload };
    }, 
    setOrderId: (state, action) => {
      return { ...state, order_id: action.payload };
    },    
    setReferer_id: (state, action) => {
      return { ...state, referer_id: action.payload };
    }, 
    setClient_id: (state, action) => {
      return { ...state, client_id: action.payload };
    },
    setProducts: (state, action) => {
      return { ...state, products: action.payload };
    },    
    setCategories: (state, action) => {
      return { ...state, categories: action.payload };
    },    
    setCurrentPage: (state, action) => {
      return { ...state, current_page: action.payload };
    },
    setFirstPageUrl: (state, action) => {
      return { ...state, first_page_url: action.payload };
    },
    setFrom: (state, action) => {
      return { ...state, from: action.payload };
    },
    setLastPage: (state, action) => {
      return { ...state, last_page: action.payload };
    },
    setLastPageUrl: (state, action) => {
      return { ...state, last_page_url: action.payload };
    },
    setLinks: (state, action) => {
      return { ...state, links: action.payload };
    },
    setNextPageUrl: (state, action) => {
      return { ...state, next_page_url: action.payload };
    },
    setPath: (state, action) => {
      return { ...state, path: action.payload };
    },
    setPerPage: (state, action) => {
      return { ...state, per_page: action.payload };
    },
    setPrevPageUrl: (state, action) => {
      return { ...state, prev_page_url: action.payload };
    },
    setTo: (state, action) => {
      return { ...state, to: action.payload };
    },
    setTotal: (state, action) => {
      return { ...state, total: action.payload };
    },
    setSearch: (state, action) => {
      return { ...state, search: action.payload };
    },
  },
});

export const { 
  setValue, 
  setDescribe, 
  setAnnotation, 
  setResponseBackend, 
  setOrderItems,
  setOrderId,
  setReferer_id,
  setClient_id,
  setProducts,
  setCurrentPage,
  setFirstPageUrl,
  setFrom,
  setLastPage,
  setLastPageUrl,
  setLinks,
  setNextPageUrl,
  setPath,
  setPerPage,
  setPrevPageUrl,
  setTo,
  setTotal,
  setCategories,
  setSearch,
  setPrice,
  setSubTotal
} = shoppingCartSlice.actions;

export default shoppingCartSlice.reducer;
