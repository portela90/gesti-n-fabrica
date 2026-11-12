# Copias de seguridad

Cada noche GitHub hace una copia de la base de datos (núcleo y apps de ahora), la cifra y la guarda 30 días.
La última copia sale en la app, en **Configuración → Salud de la app**.

## Ponerla en marcha (una vez)
En GitHub → repositorio `gesti-n-fabrica` → **Settings → Secrets and variables → Actions → New repository secret**:

1. `SUPABASE_DB_URL`: en Supabase (colada-mapri) pulsa **Connect** arriba → **Session pooler** → copia la dirección
   (`postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`) y cambia `[YOUR-PASSWORD]` por la
   contraseña de la base de datos. Si no la recuerdas: Project Settings → Database → Reset database password
   (ojo: si algo más usa esa contraseña, habría que cambiarla también allí).
2. `COPIA_CLAVE`: una frase larga que te inventes. **Guárdala en un sitio seguro**: sin ella las copias no se pueden abrir.

Después: GitHub → **Actions → Copia nocturna → Run workflow** para hacer la primera y comprobar que sale en verde.

## Recuperar una copia
1. GitHub → Actions → Copia nocturna → la ejecución del día que quieras → **Artifacts** → descargar y descomprimir el zip.
2. Descifrar (en un ordenador con OpenSSL; te pedirá la frase de `COPIA_CLAVE`):
   ```
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in copia-AAAA-MM-DD.sql.gz.cifrado -out copia.sql.gz
   gunzip copia.sql.gz
   ```
3. `copia.sql` se carga con `psql` en un proyecto de Supabase nuevo (o en una base de pruebas) para revisar o restaurar.
   Restaurar encima del proyecto de verdad se hace solo con calma y con Claude delante.

## Probar que una copia vale
Una vez al mes, descifra la última copia y cárgala en una base de pruebas: una copia que nunca se ha recuperado no cuenta.
