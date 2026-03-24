'use client'
import { NextPage } from 'next'
 
 const FooterComponent: NextPage = () => {
   return <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white px-4 py-3 text-center">
            <p className="text-sm text-slate-600">
              Desarrollado por{" "}
              <span className="font-semibold">Jorge Méndez - Programandoweb</span>
            </p>
          </footer>
 }
 
 export default FooterComponent