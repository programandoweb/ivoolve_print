'use client';
import { createContext, ReactNode, useEffect, useContext } from 'react';

export interface ThemeContextInterface {
    theme: 'light';
    setTheme: (theme: 'light') => void;
}

export const ThemeContext = createContext({} as ThemeContextInterface);

type Props = {
    children: ReactNode;
};

export default function ThemeProvider({ children }: Props) {
    const rawSetTheme = (rawTheme: 'light') => {
        const root = window.document.documentElement;
        root.classList.remove('dark');
        root.classList.add('light');
        localStorage.setItem('color-theme', rawTheme);
    };

    useEffect(() => {
        // Siempre establecer el tema claro
        rawSetTheme('light');
    }, []);

    return (
        <ThemeContext.Provider
            value={{
                theme: 'light',
                setTheme: () => {}, // La función no hará nada porque siempre es 'light'
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export const useThemeContext = () => useContext(ThemeContext);
