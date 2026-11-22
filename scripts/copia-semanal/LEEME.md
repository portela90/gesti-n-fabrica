# Copia semanal de la app vieja a la nueva (parte 8)

Decidido por Cristian (22/11): durante las semanas en paralelo **solo apunta en la app vieja**; una vez por semana se copia
a la nueva lo de la vieja y él comprueba que la nueva enseña lo mismo. Estos archivos son la «receta» (sin datos).
Los datos de cada semana van en un archivo aparte **fuera del repositorio** (llevan nombres y notas).

## Cómo se hace cada semana (Personal)
1. Leer la vieja (limpieza-cie, solo lectura) con la consulta de abajo: devuelve el principio del archivo
   (crea `v_horas`, `v_vac` y `v_dias` y los llena).
2. Archivo de la semana = ese principio + `scripts/copia-semanal/personal.sql`. Guardarlo en el scratchpad.
3. Ensayo en colada-mapri sin guardar nada: `begin;` + archivo + `do $$ begin raise exception '%', (select string_agg(…) from r_resumen); end $$;`
   (el error trae el resumen y lo deshace todo).
4. Dárselo a Cristian: lo pega en el SQL Editor de colada-mapri y sale el resumen. Comprobar con las huellas (abajo).

## Leer la vieja (Personal)
```sql
select concat(
 'create temp table v_horas (persona uuid, fecha date, trabajadas numeric, fuera numeric, extra numeric, falta text, nota text);', E'\n',
 'insert into v_horas values ', (select string_agg(format('(%L,%L,%s,%s,%s,%L,%L)', trabajador, fecha, coalesce(trabajadas::text,'null'),
    coalesce(fuera,0), coalesce(extra_mano,0), falta, nota), E',\n' order by trabajador, fecha)
    from horas_dia where coalesce(falta,'') <> 'vacaciones'), ';', E'\n',
 'create temp table v_vac (id uuid, persona uuid, desde date, hasta date, nota text);', E'\n',
 'insert into v_vac values ', (select string_agg(format('(%L,%L,%L,%L,%L)', id, trabajador, desde, hasta, nota), E',\n' order by desde)
    from cal_vac where not coalesce(borrado,false)), ';', E'\n',
 'create temp table v_dias (equipo text, fecha date, tipo text, nombre text, horario text);', E'\n',
 'insert into v_dias values ', (select string_agg(format('(%L,%L,%L,%L,%L)', equipo, fecha, tipo, nombre, horario), E',\n' order by equipo, fecha)
    from cal_dia where not coalesce(borrado,false)), ';') as principio;
```
Las 316 jornadas `falta = 'vacaciones'` de `horas_dia` no se copian como horas: son las vacaciones (`cal_vac`).

## Comprobar (huellas: tienen que salir iguales en las dos)
Vieja:
```sql
select md5(string_agg(concat_ws('|', trabajador, fecha, trabajadas::float8, coalesce(fuera,0)::float8, coalesce(extra_mano,0)::float8, coalesce(falta,''),
  case when nullif(trim(nota),'') is null and (coalesce(fuera,0)>0 or coalesce(extra_mano,0)>0) then '(sin motivo en la app vieja)' else coalesce(trim(nota),'') end),
  ',' order by trabajador, fecha)) horas from horas_dia where coalesce(falta,'') <> 'vacaciones';
select md5(string_agg(concat_ws('|', id, trabajador, desde, hasta, coalesce(trim(nota),'')), ',' order by id)) vac from cal_vac where not coalesce(borrado,false);
```
Nueva:
```sql
select md5(string_agg(concat_ws('|', persona_id, fecha, trabajadas::float8, fuera::float8, coalesce(extra_mano,0)::float8, coalesce(falta,''), coalesce(nota,'')),
  ',' order by persona_id, fecha)) horas from personal.horas_dia where origen = 'limpieza-cie:horas_dia';
select md5(string_agg(concat_ws('|', split_part(origen,':',3), persona_id, desde, hasta, coalesce(nota,'')), ',' order by split_part(origen,':',3))) vac
  from personal.vacaciones where origen like 'limpieza-cie:cal_vac:%';
```
