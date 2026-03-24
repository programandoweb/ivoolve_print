'use client';
import { useState, useEffect } from 'react';
import { USER_ROLES } from '@/constants/userRoles';

export default function useUserHook() {
  const [user, setUser] = useState<any>(null);
  const [user2, setUser2] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // ----------------------------
  // Cargar usuario desde localStorage (async)
  // ----------------------------
  const loadUser = async () => {
    setLoading(true);

    await new Promise(resolve => setTimeout(resolve, 0));

    const stored = localStorage.getItem('user');
    const stored2 = localStorage.getItem('user2');

    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }

    if (stored2) {
      try {
        setUser2(JSON.parse(stored2));
      } catch {
        setUser2(null);
      }
    } else {
      setUser2(null);
    }

    setLoading(false);
  };

  // Ejecutar al montar
  useEffect(() => {
    loadUser();
  }, []);

  // Método para refrescar manualmente
  const refreshUser = async () => {
    await loadUser();
  };

  const restoreUser = async () => {
    try {
      if (user2) {
        localStorage.setItem('user', JSON.stringify(user2));
        localStorage.removeItem('user2');
      }
    } catch (error) {
      console.error('Error restoring user:', error);
    }
  };


  // --------------------------------------------
  // DEFINICIÓN DE ROLES POR GRUPOS (Booleanos)
  // --------------------------------------------
  const role = user?.role ?? null;

  const is_admin =
    role && USER_ROLES.ADMINISTRATIVOS.includes(role);

  const is_operativo =
    role &&
    (
      USER_ROLES.CORTE.includes(role) ||
      USER_ROLES.ALMACEN.includes(role) ||
      USER_ROLES.TALLER.includes(role) ||
      USER_ROLES.COSTURA.includes(role)
    );

  const is_system =
    role &&
    (
      USER_ROLES.SYSTEM.includes(role)       
    );  

  const is_calidad =
    role && USER_ROLES.CALIDAD.includes(role);

  const is_externo =
    role && USER_ROLES.EXTERNOS.includes(role);

  return {
    user,
    user2,
    loading,
    refreshUser,
    restoreUser,

    // 🔥 Flags listos para usar
    is_admin,
    is_operativo,
    is_calidad,
    is_externo,
    is_system
  };
}
