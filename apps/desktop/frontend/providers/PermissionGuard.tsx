'use client'

/**
 * ---------------------------------------------------
 * Desarrollado por: Jorge Méndez - Programandoweb
 * Proyecto: Ivoolve
 * ---------------------------------------------------
 */

import useUserHook from '@/hooks/useUserHook';
import { motion } from 'framer-motion';

interface PermissionGuardProps {
    permission: string
    children: React.ReactNode
}

export default function PermissionGuard({
    permission,
    children
}: PermissionGuardProps) {

    const { user, loading } = useUserHook()

    if (loading) return null

    const hasPermission = user?.permissions?.includes(permission)

    if (!hasPermission) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-2xl shadow-sm">
                    No estás autorizado para acceder a este módulo.
                </div>
            </div>
        )
    }

    return  <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
            >
                {children}
            </motion.div>
    
    
}
