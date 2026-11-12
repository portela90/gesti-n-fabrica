-- =====================================================================================
-- 0008 · NÚCLEO: la imagen de la firma se guarda en la propia firma.
-- Una firma hecha con el dedo pesa unos 10–40 KB: guardarla aquí (como en las apps de ahora)
-- evita montar Storage solo para esto y entra en la copia nocturna con todo lo demás.
-- imagen_ruta se queda para firmas que en el futuro vayan a Storage.
-- Como las firmas solo se añaden, la imagen tampoco se puede cambiar una vez guardada.
-- =====================================================================================
alter table nucleo.firmas add column imagen text
  check (imagen is null or (imagen ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' and length(imagen) <= 400000));
comment on column nucleo.firmas.imagen is 'Imagen de la firma (PNG en base64, máx. 400 KB).';
