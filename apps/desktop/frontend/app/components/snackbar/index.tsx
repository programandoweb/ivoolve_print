'use client'
import { useSelector, useDispatch } from "react-redux";
import { handleCloseSnackbar } from "@/store/Slices/snackbarSlice"; 
import { useState } from "react";

interface SnackbarVariant {
  success: string;
  error: string;
  warning: string;
  info: string;
}

interface SnackbarState {
  text: string | null;
  open: boolean;
  variant: keyof SnackbarVariant; 
}

export default function Snackbar() {
  const [color,setColor]                    =   useState();
  const dispatch                            =   useDispatch();
  const snackebar:SnackbarState             =   useSelector((state:any)=>state?.snackbar);
  const {text,open,variant}                 =   snackebar;

  const variants: SnackbarVariant = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-yellow-500",
    info: "bg-blue-500",
  };

  const handleClose=()=>{
    dispatch(handleCloseSnackbar());
  }

  if(!open)return;

  return (
    <>
      <div
        className={`${variants[variant]} flex min-w-[320px] items-center truncate whitespace-nowrap rounded-lg py-3 px-3.5 text-xs text-white shadow-md`}
      >
        <span className="mr-4 text-base" aria-hidden="true">
          !
        </span>        
        <span>{text}</span>
        <button
          className="bg-transparent !p-0 text-current underline"
          onClick={handleClose}
        >
          Close
        </button>
      </div>
    </>
  ) 
}
