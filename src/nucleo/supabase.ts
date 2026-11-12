import { createClient } from '@supabase/supabase-js';

// Proyecto de Supabase de MAPRI (colada-mapri). La clave es la publicable: va en la web y no es secreta;
// lo que protege los datos son las reglas de seguridad por fila de la base de datos.
export const SUPABASE_URL = 'https://whemhkcrgwyjucpaswrm.supabase.co';
export const SUPABASE_CLAVE = 'sb_publishable_hcFf66q2-0X6pR1gq5YKpw_u4G6HriG';

export const supabase = createClient(SUPABASE_URL, SUPABASE_CLAVE, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Todas las tablas y funciones del núcleo están en el esquema «nucleo». */
export const nucleo = () => supabase.schema('nucleo');

export const VERSION: string = __VERSION__;

/** Dirección a la que vuelven los enlaces del correo (entrar sin contraseña, cambiar contraseña). */
export const direccionApp = () => location.origin + import.meta.env.BASE_URL;
