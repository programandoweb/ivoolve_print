'use client'

/**
 * ---------------------------------------------------
 * Desarrollado por: Jorge Méndez - Programandoweb
 * Proyecto: Ivoolve
 * ---------------------------------------------------
 */

import { useState } from 'react'
import { FiMail, FiLock, FiEye, FiEyeOff, FiLogIn } from 'react-icons/fi'
import LogoComponent from './components/Logo'
import useFormData from '@/hooks/useFormData';
import { useRouter } from 'next/navigation';


export default function LoginPage() {
  const router = useRouter();
  const formData = useFormData(false, false, false, true);
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    email: 'impresion@delicetiendavirtual.com',
    password: '123',
    remember: false,
  })
  const [loading, setLoading] = useState(false)

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      console.log('Login payload:', form) 
      const endpoint =  formData.backend + location.pathname + "auth"
      

      const response  =   await formData.handleRequest(endpoint, "post", form);

      const user      =   response?.user
        ? { ...response.user, token: response?.token }
        : null;

      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("token", JSON.stringify(response?.token));

      /*
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: { message: "Error creando la orden "+endpoint, type: "error" },
        })
      );
      */

      if(response?.token){
        router.replace("/dashboard");
      }

    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-slate-100 via-white to-slate-200 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-white/90 backdrop-blur-xl shadow-2xl p-8 md:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-36 w-36 items-center justify-center">
              <LogoComponent/>
            </div>

            <h1 className="text-3xl font-bold text-slate-900">
              Bienvenido
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Ingresa tus credenciales para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Correo electrónico
              </label>

              <div className="flex items-center rounded-2xl border border-slate-300 bg-slate-50 px-4 focus-within:border-pink-500 focus-within:ring-2 focus-within:ring-pink-200 transition">
                <FiMail className="text-slate-400" size={18} />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="correo@empresa.com"
                  className="w-full bg-transparent px-3 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Contraseña
              </label>

              <div className="flex items-center rounded-2xl border border-slate-300 bg-slate-50 px-4 focus-within:border-pink-500 focus-within:ring-2 focus-within:ring-pink-200 transition">
                <FiLock className="text-slate-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent px-3 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-500 hover:text-pink-500 transition"
                >
                  {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
            </div>
           

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-500 py-4 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <FiLogIn size={18} />
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>
          
        </div>
      </div>
    </main>
  )
}