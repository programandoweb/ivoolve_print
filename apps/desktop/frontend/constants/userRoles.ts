export const USER_ROLES = {
  // 🔹 Administrativos
  ADMINISTRATIVOS: [
    'super-admin',
    'gerente-general',
    'admin',
  ],

  // 🔹 Corte
  CORTE: [
    'jefe-de-corte',
    'aux-de-corte',
  ],

  // 🔹 Almacén
  ALMACEN: [
    'jefe-de-almacen',
    'almacen',
    'aux-de-almacen',
  ],

  // 🔹 Taller
  TALLER: [
    'jefe-de-taller',
    'taller',
    'aux-de-taller',
  ],

  // 🔹 Costura
  COSTURA: [
    'jefe-de-costura',
    'costurera',
    'aux-de-costura',
  ],

  // 🔹 Calidad
  CALIDAD: [
    'jefe-de-calidad',
    'control-de-calidad',
    'aux-de-calidad',
    'inspector-calidad',
    'supervisor-calidad',
  ],

  // 🔹 Externos
  EXTERNOS: [
    'clients',
    'suppliers',
    'employees',
  ],

  SYSTEM: [
    'system',    
  ],
} as const;
