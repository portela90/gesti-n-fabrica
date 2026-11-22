-- PEGAR EN LA APP VIEJA (limpieza-cie). Solo lee. Copia la casilla que sale y pégala en el SQL Editor de colada-mapri.
-- Copia semanal de Prevención (generado por scripts/copia-semanal/montar.sh; no editar a mano).
select concat(
 'create temp table v_toolbox (anio int, mes int, compromiso text, cuerpo text, puntos jsonb, tema text, tema_intro text, tema_puntos jsonb, imagen text, codigo text);', E'\n',
 coalesce('insert into v_toolbox values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', anio, mes, compromiso, cuerpo, puntos, tema, tema_intro,
    tema_puntos, imagen, codigo), E',\n') from prl_toolbox) || ';', ''), E'\n',
 'create temp table v_sesion (id uuid, anio int, mes int, denominacion text, fecha date, centro text, duracion int, formador text, observaciones text, ',
 'previstos uuid[], enviada_en timestamptz, estado text, cerrada_en timestamptz, creado timestamptz, prev_enviado_en timestamptz, prev_destino text);', E'\n',
 coalesce('insert into v_sesion values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', id, anio, mes, denominacion, fecha, centro,
    duracion, formador, observaciones, previstos, enviada_en, estado, cerrada_en, creado, prev_enviado_en, prev_destino), E',\n') from prl_sesion) || ';', ''), E'\n',
 'create temp table v_firma (id uuid, sesion uuid, trabajador uuid, nombre text, puesto text, firma text, firmado_en timestamptz);', E'\n',
 coalesce('insert into v_firma values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L)', id, sesion, trabajador, nombre, puesto, firma, firmado_en), E',\n')
    from prl_firma) || ';', ''), E'\n',
 'create temp table v_doc (tabla text, id uuid, tipo text, trabajador uuid, fecha date, datos jsonb, firma text, firmado_en timestamptz, enviada_en timestamptz, ',
 'creado timestamptz, borrado boolean, evaluacion jsonb);', E'\n',
 coalesce('insert into v_doc values ' || (select string_agg(x, E',\n') from (
    select format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', 'prl_doc', id, tipo, trabajador, fecha, datos, firma, firmado_en, enviada_en, creado,
      coalesce(borrado, false), null) x from prl_doc
    union all
    select format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', 'prl_formacion', id, 'formacion', trabajador, fecha,
      jsonb_strip_nulls(jsonb_build_object('items', to_jsonb(items), 'duracion', duracion, 'direccion', direccion, 'impartida', impartida, 'otros1', otros1, 'otros6', otros6)),
      firma, firmado_en, enviada_en, creado, coalesce(borrado, false),
      case when eval_fecha is not null or eval_eficaz is not null or nueva_fecha is not null
           then jsonb_strip_nulls(jsonb_build_object('fecha', eval_fecha, 'eficaz', eval_eficaz, 'nueva_fecha', nueva_fecha)) end) from prl_formacion) d) || ';', ''), E'\n',
 'create temp table v_cert (id uuid, trabajador uuid, tipo text, titulo text, entidad text, horas numeric, fecha date, caduca date, notas text, archivos int, borrado boolean);', E'\n',
 coalesce('insert into v_cert values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%s,%L)', c.id, c.trabajador, c.tipo, c.titulo, c.entidad, c.horas,
    c.fecha, c.caduca, c.notas, (select count(*) from prl_cert_arch a where a.cert = c.id), coalesce(c.borrado, false)), E',\n') from prl_cert c) || ';', ''), E'\n',
 'create temp table v_ficha (trabajador uuid, dni text, puesto text, fecha_alta date, fecha_baja date, motivo_baja text, telefono text, emerg_nombre text, emerg_tel text, idioma text, tallas jsonb);', E'\n',
 coalesce('insert into v_ficha values ' || (select string_agg(format('(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)', trabajador, dni, puesto, fecha_alta, fecha_baja, motivo_baja,
    telefono, emerg_nombre, emerg_tel, idioma, tallas), E',\n') from prl_trab) || ';', ''), E'\n',
$receta$-- Copia semanal de Prevención (parte 8, decidido por Cristian el 22/11). SIN DATOS: el archivo de cada semana empieza llenando
-- v_toolbox, v_sesion, v_firma, v_doc, v_cert y v_ficha con lo de la vieja (leer-vieja-prevencion.sql). Reglas:
--  · Lo firmado solo se añade (la nueva no deja cambiar ni borrar firmas, asistencias ni documentos firmados). Una charla cerrada no se toca.
--  · Las firmas se copian con su imagen (nucleo.firmas.imagen). Su «huella del documento» es la del registro de la vieja.
--  · Certificados sin su archivo (en la nota: «N archivos en la app vieja»). Fichas sin el reconocimiento médico (decidido: no se migra).
--  · Al copiar NO se descuenta stock de EPI (se apaga el disparador «stock» y se vuelve a encender). Todo o nada. Resumen al final.

create temp table r_resumen (orden int, que text, cuantos bigint, detalle text);
alter table prevencion.documentos disable trigger stock;

do $$
declare
  v_emp uuid := (select id from nucleo.empresas where nombre = 'Limpieza');
  n bigint;
  r record;
  v_firma uuid;
begin
  if v_emp is null then raise exception 'No encuentro la unidad de trabajo Limpieza'; end if;
  perform set_config('prevencion.firmando', 'si', true);   -- para poder poner la firma a los documentos copiados

  -- ---------- textos del Toolbox (charla de cada mes) ----------
  with q as (
    insert into prevencion.charlas (empresa_id, anio, mes, codigo, compromiso, cuerpo, puntos, tema, tema_intro, tema_puntos, imagen, origen)
    select v_emp, t.anio, t.mes, t.codigo, t.compromiso, t.cuerpo, coalesce(t.puntos, '[]'), t.tema, t.tema_intro, coalesce(t.tema_puntos, '[]'), t.imagen,
           'limpieza-cie:prl_toolbox:' || t.anio || '-' || lpad(t.mes::text, 2, '0')
      from v_toolbox t
    on conflict (empresa_id, anio, mes) do update set codigo = excluded.codigo, compromiso = excluded.compromiso, cuerpo = excluded.cuerpo, puntos = excluded.puntos,
      tema = excluded.tema, tema_intro = excluded.tema_intro, tema_puntos = excluded.tema_puntos, imagen = excluded.imagen
      where prevencion.charlas.origen like 'limpieza-cie:%'
        and (prevencion.charlas.codigo, prevencion.charlas.compromiso, prevencion.charlas.cuerpo, prevencion.charlas.puntos, prevencion.charlas.tema,
             prevencion.charlas.tema_intro, prevencion.charlas.tema_puntos, prevencion.charlas.imagen)
            is distinct from (excluded.codigo, excluded.compromiso, excluded.cuerpo, excluded.puntos, excluded.tema, excluded.tema_intro, excluded.tema_puntos, excluded.imagen)
    returning anio, mes)
  insert into r_resumen select 1, 'Toolbox: textos nuevos o cambiados', count(*), string_agg(mes || '/' || anio, ', ' order by anio, mes) from q;

  -- ---------- sesiones (la charla de cada mes con sus datos) ----------
  with q as (
    insert into prevencion.sesiones (id, empresa_id, charla_id, denominacion, fecha, centro, duracion, formador, observaciones, previstos, enviada_en, cerrada_en,
      origen, creado, prev_enviado_en, prev_destino)
    select s.id, v_emp, c.id, s.denominacion, s.fecha, s.centro, s.duracion, s.formador, s.observaciones,
           array(select p from unnest(coalesce(s.previstos, '{}')) p where exists (select 1 from nucleo.personas x where x.id = p and x.empresa_id = v_emp)),
           s.enviada_en, case when s.estado = 'cerrada' then coalesce(s.cerrada_en, now()) end, 'limpieza-cie:prl_sesion:' || s.id, coalesce(s.creado, now()),
           s.prev_enviado_en, s.prev_destino
      from v_sesion s join prevencion.charlas c on c.empresa_id = v_emp and c.anio = s.anio and c.mes = s.mes
    on conflict (id) do update set denominacion = excluded.denominacion, fecha = excluded.fecha, centro = excluded.centro, duracion = excluded.duracion,
      formador = excluded.formador, observaciones = excluded.observaciones, previstos = excluded.previstos, enviada_en = excluded.enviada_en,
      cerrada_en = excluded.cerrada_en, prev_enviado_en = excluded.prev_enviado_en, prev_destino = excluded.prev_destino
      where prevencion.sesiones.origen like 'limpieza-cie:%' and prevencion.sesiones.cerrada_en is null
        and (prevencion.sesiones.denominacion, prevencion.sesiones.fecha, prevencion.sesiones.centro, prevencion.sesiones.duracion, prevencion.sesiones.formador,
             prevencion.sesiones.observaciones, prevencion.sesiones.previstos, prevencion.sesiones.enviada_en, prevencion.sesiones.cerrada_en,
             prevencion.sesiones.prev_enviado_en, prevencion.sesiones.prev_destino)
            is distinct from (excluded.denominacion, excluded.fecha, excluded.centro, excluded.duracion, excluded.formador, excluded.observaciones,
             excluded.previstos, excluded.enviada_en, excluded.cerrada_en, excluded.prev_enviado_en, excluded.prev_destino)
    returning fecha)
  insert into r_resumen select 2, 'Charlas: sesiones nuevas o cambiadas', count(*), string_agg(fecha::text, ', ' order by fecha) from q;
  insert into r_resumen select 10, 'Aviso: sesiones sin el texto de su mes en la nueva (no se copian)', count(*), string_agg(s.mes || '/' || s.anio, ', ')
    from v_sesion s where not exists (select 1 from prevencion.charlas c where c.empresa_id = v_emp and c.anio = s.anio and c.mes = s.mes);

  -- ---------- firmas de las charlas (solo se añaden) ----------
  n := 0;
  for r in select f.* from v_firma f
            where exists (select 1 from prevencion.sesiones s where s.id = f.sesion and s.empresa_id = v_emp)
              and exists (select 1 from nucleo.personas p where p.id = f.trabajador and p.empresa_id = v_emp)
              and f.firma ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
              and not exists (select 1 from prevencion.asistencias a where a.origen = 'limpieza-cie:prl_firma:' || f.id) loop
    insert into nucleo.firmas (empresa_id, modulo, documento, documento_id, persona_id, conforme, imagen, sha256_documento, firmado_en, dispositivo)
    values (v_emp, 'prevencion', 'charla', r.sesion, r.trabajador, true, r.firma, encode(sha256(convert_to('limpieza-cie:prl_firma:' || r.id, 'UTF8')), 'hex'),
            coalesce(r.firmado_en, now()), '{"origen": "app vieja"}')
    returning id into v_firma;
    insert into prevencion.asistencias (empresa_id, sesion_id, persona_id, nombre, puesto, firma_id, origen, creado)
    values (v_emp, r.sesion, r.trabajador, coalesce(r.nombre, (select nombre from nucleo.personas where id = r.trabajador)), r.puesto, v_firma,
            'limpieza-cie:prl_firma:' || r.id, coalesce(r.firmado_en, now()));
    n := n + 1;
  end loop;
  insert into r_resumen values (3, 'Charlas: firmas nuevas', n, null);

  -- ---------- documentos: entregas de EPI y formaciones ----------
  with q as (
    delete from prevencion.documentos d where d.empresa_id = v_emp and d.firma_id is null and d.firmado_en is null
       and exists (select 1 from v_doc x where x.borrado and 'limpieza-cie:' || x.tabla || ':' || x.id = d.origen) returning fecha)
  insert into r_resumen select 6, 'Documentos quitados (borrados en la vieja, sin firmar)', count(*), string_agg(fecha::text, ', ') from q;
  with q as (
    insert into prevencion.documentos (id, empresa_id, tipo, persona_id, fecha, datos, enviado_en, origen, creado, evaluacion)
    select x.id, v_emp, x.tipo, x.trabajador, x.fecha, x.datos, x.enviada_en, 'limpieza-cie:' || x.tabla || ':' || x.id, coalesce(x.creado, now()), x.evaluacion
      from v_doc x where not x.borrado and exists (select 1 from nucleo.personas p where p.id = x.trabajador and p.empresa_id = v_emp)
    on conflict (id) do update set fecha = excluded.fecha, datos = excluded.datos, enviado_en = excluded.enviado_en, evaluacion = excluded.evaluacion
      where prevencion.documentos.origen like 'limpieza-cie:%' and prevencion.documentos.firma_id is null
        and (prevencion.documentos.fecha, prevencion.documentos.datos, prevencion.documentos.enviado_en, prevencion.documentos.evaluacion)
            is distinct from (excluded.fecha, excluded.datos, excluded.enviado_en, excluded.evaluacion)
    returning tipo)
  insert into r_resumen select 4, 'Documentos nuevos o cambiados', count(*), string_agg(distinct tipo, ', ') from q;
  -- la evaluación de una formación ya firmada sí se puede apuntar
  update prevencion.documentos d set evaluacion = x.evaluacion from v_doc x
   where d.origen = 'limpieza-cie:' || x.tabla || ':' || x.id and d.firma_id is not null and d.evaluacion is distinct from x.evaluacion and x.evaluacion is not null;
  n := 0;
  for r in select x.*, d.id doc from v_doc x join prevencion.documentos d on d.origen = 'limpieza-cie:' || x.tabla || ':' || x.id
            where not x.borrado and d.firma_id is null and x.firma ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' loop
    insert into nucleo.firmas (empresa_id, modulo, documento, documento_id, persona_id, conforme, imagen, sha256_documento, firmado_en, dispositivo)
    values (v_emp, 'prevencion', r.tipo, r.doc, r.trabajador, true, r.firma, encode(sha256(convert_to('limpieza-cie:' || r.tabla || ':' || r.id, 'UTF8')), 'hex'),
            coalesce(r.firmado_en, now()), '{"origen": "app vieja"}')
    returning id into v_firma;
    update prevencion.documentos set firma_id = v_firma, firmado_en = coalesce(r.firmado_en, now()) where id = r.doc;
    n := n + 1;
  end loop;
  insert into r_resumen values (5, 'Documentos: firmas nuevas', n, null);

  -- ---------- certificados de cursos (sin archivo) ----------
  with q as (
    insert into prevencion.cursos (id, empresa_id, persona_id, tipo, titulo, entidad, fecha, horas, caduca, notas, archivos, origen)
    select c.id, v_emp, c.trabajador, c.tipo, c.titulo, c.entidad, c.fecha, c.horas, c.caduca,
           nullif(concat_ws(' · ', nullif(trim(c.notas), ''), case when c.archivos > 0 then c.archivos || case when c.archivos = 1 then ' archivo' else ' archivos' end || ' en la app vieja' end), ''),
           '[]', 'limpieza-cie:prl_cert:' || c.id
      from v_cert c where not c.borrado and exists (select 1 from nucleo.personas p where p.id = c.trabajador and p.empresa_id = v_emp)
    on conflict (id) do update set tipo = excluded.tipo, titulo = excluded.titulo, entidad = excluded.entidad, fecha = excluded.fecha, horas = excluded.horas,
      caduca = excluded.caduca, notas = excluded.notas
      where prevencion.cursos.origen like 'limpieza-cie:%'
        and (prevencion.cursos.tipo, prevencion.cursos.titulo, prevencion.cursos.entidad, prevencion.cursos.fecha, prevencion.cursos.horas, prevencion.cursos.caduca, prevencion.cursos.notas)
            is distinct from (excluded.tipo, excluded.titulo, excluded.entidad, excluded.fecha, excluded.horas, excluded.caduca, excluded.notas)
    returning titulo)
  insert into r_resumen select 7, 'Certificados nuevos o cambiados', count(*), string_agg(titulo, ', ') from q;
  with q as (delete from prevencion.cursos c where c.empresa_id = v_emp and c.origen like 'limpieza-cie:prl_cert:%'
               and not exists (select 1 from v_cert x where not x.borrado and 'limpieza-cie:prl_cert:' || x.id = c.origen) returning titulo)
  insert into r_resumen select 8, 'Certificados quitados (borrados en la vieja)', count(*), string_agg(titulo, ', ') from q;

  -- ---------- fichas (sin el reconocimiento médico) ----------
  with q as (
    insert into prevencion.fichas (persona_id, empresa_id, dni, puesto, fecha_alta, fecha_baja, motivo_baja, telefono, emerg_nombre, emerg_tel, idioma, tallas, origen)
    select f.trabajador, v_emp, nullif(trim(f.dni), ''), nullif(trim(f.puesto), ''), f.fecha_alta, f.fecha_baja, nullif(trim(f.motivo_baja), ''),
           nullif(trim(f.telefono), ''), nullif(trim(f.emerg_nombre), ''), nullif(trim(f.emerg_tel), ''), nullif(trim(f.idioma), ''), coalesce(f.tallas, '{}'),
           'limpieza-cie:prl_trab:' || f.trabajador
      from v_ficha f where exists (select 1 from nucleo.personas p where p.id = f.trabajador and p.empresa_id = v_emp)
    on conflict (persona_id) do update set dni = excluded.dni, puesto = excluded.puesto, fecha_alta = excluded.fecha_alta, fecha_baja = excluded.fecha_baja,
      motivo_baja = excluded.motivo_baja, telefono = excluded.telefono, emerg_nombre = excluded.emerg_nombre, emerg_tel = excluded.emerg_tel,
      idioma = excluded.idioma, tallas = excluded.tallas, origen = excluded.origen
      where (prevencion.fichas.dni, prevencion.fichas.puesto, prevencion.fichas.fecha_alta, prevencion.fichas.fecha_baja, prevencion.fichas.motivo_baja,
             prevencion.fichas.telefono, prevencion.fichas.emerg_nombre, prevencion.fichas.emerg_tel, prevencion.fichas.idioma, prevencion.fichas.tallas)
            is distinct from (excluded.dni, excluded.puesto, excluded.fecha_alta, excluded.fecha_baja, excluded.motivo_baja, excluded.telefono,
             excluded.emerg_nombre, excluded.emerg_tel, excluded.idioma, excluded.tallas)
    returning persona_id)
  insert into r_resumen select 9, 'Fichas nuevas o cambiadas', count(*), null from q;
end $$;

alter table prevencion.documentos enable trigger stock;

select que as "Qué", cuantos as "Cuántos", coalesce(detalle, '') as "Detalle" from r_resumen where cuantos > 0 order by orden;
$receta$) as "Copia esta casilla y pégala en colada-mapri";
