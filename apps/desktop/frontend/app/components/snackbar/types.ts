export type SnackbarType = {
    key: string; // snackbar identifier
    text: React.ReactNode; //  text to show within snackbar
    icon?: React.FunctionComponent<React.SVGProps<SVGSVGElement>>; // snackbar icon
  }
  
  export type TSnackbarProps = Omit<SnackbarType, 'key'> & {
    handleClose: () => void; // Function that is run when the snackbar is closed
    open: boolean; //whether to open the snackbar or not
    variant:any;
  }