# Día del cambio · lista paso a paso

Preparado el 22/11/2026 con Cristian (parte 8). Los operarios cambian de app **una sola vez**, este día.
Los archivos están en `scripts/dia-del-cambio/` y `scripts/copia-semanal/`. Todos se pegan en el **SQL Editor** de Supabase.

## La víspera o el mismo día, antes de empezar
1. **Avisar** a los operarios de qué día y a qué hora se cambia, y que tengan el móvil a mano.
2. **Imprimir** nada todavía: los códigos caducan a los 7 días; la hoja se saca el mismo día (paso 6).

## El día del cambio
3. **Última copia semanal** (la vieja todavía manda): los cuatro `leer-vieja-*.sql` en el SQL Editor de **limpieza-cie** y la casilla
   de cada uno en el de **colada-mapri**. Decirle a Claude «ya está la última copia» para que compruebe que todo cuadra.
4. **Ver qué se borra**: pegar `scripts/dia-del-cambio/ver-pruebas.sql` en **colada-mapri** (solo mira). Revisar la lista.
   Apuntar los «Archivo: …» que salgan (diploma, firmas antiguas, fotos de los trabajos de prueba).
5. **Borrar las pruebas**: pegar `scripts/dia-del-cambio/borrar-pruebas.sql` en **colada-mapri**. Sale un resumen de lo borrado.
   Después, en Supabase → Storage, quitar a mano los archivos apuntados en el paso 4.
6. **Hoja de códigos**: en la app nueva, Configuración → Usuarios → **«Hoja de códigos (PDF)»**. Comprobar que salen todos los
   operarios, rol «Operario», y sacar el PDF. Imprimir y recortar.
7. **Repartir las tarjetas** y que cada uno dé de alta su móvil y elija su PIN (en iPhone: primero añadir la app a la pantalla de
   inicio y escribir el código dentro de la app). Ir mirando en Usuarios que a cada uno le sale «Con PIN».
8. **Certificados**: volver a subir a mano en la ficha de cada uno los 3 archivos de certificados que había en la app vieja
   (Prevención → Fichas → la persona → Cursos).
9. **Avisar a todos** de que desde ahora se apunta todo en la app nueva.

## Después
- Las **fotos** de los trabajos anteriores se quedan en la app vieja (en la nueva, cada trabajo dice cuántas tenía).
- **Qué hacer con la app vieja** (dejarla para consultar, cerrarla…): lo decide Cristian más adelante. Claude no toca las apps viejas.
- Los encargados con correo siguen entrando con su correo; si alguno quiere PIN, se le quitan los roles de su usuario con correo y se
  le saca un código.
