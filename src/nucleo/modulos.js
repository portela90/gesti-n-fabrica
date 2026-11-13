export const MODULOS = [
    { codigo: 'coladas', nombre: 'Coladas', descripcion: 'Entradas de aluminio, stock, consumo por relevo y cierre de mes', color: '#3b6e99', icono: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z', fase: 4 },
    { codigo: 'almacen', nombre: 'Almacén', descripcion: 'Consumibles, reposición, pedidos, aceites y contadores', color: '#475569', icono: 'M3 8l9-5 9 5v10l-9 5-9-5zM3 8l9 5 9-5M12 13v10', fase: 3 },
    { codigo: 'mantenimiento', nombre: 'Mantenimiento', descripcion: 'Ejes, pistones, hornos, tolvas, reparaciones y averías', color: '#4338ca', icono: 'M14 6a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-3 3-3-3z', fase: 3 },
    { codigo: 'limpieza', nombre: 'Limpieza', descripcion: 'Trabajos, checklists, fotos y fin de semana', color: '#0f766e', icono: 'M4 20l6-6M14 4l6 6-8 8-6-6zM9 9l6 6', fase: 2 },
    { codigo: 'personal', nombre: 'Personal', descripcion: 'Fichaje, horas, calendario, vacaciones y firmas', color: '#9a3412', icono: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', fase: 1 },
    { codigo: 'prevencion', nombre: 'Prevención', descripcion: 'Charlas, EPIs, formación y firmas', color: '#b91c1c', icono: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', fase: 1 },
];
export const moduloPorCodigo = (c) => MODULOS.find((m) => m.codigo === c);
