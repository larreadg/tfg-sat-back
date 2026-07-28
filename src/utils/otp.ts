export function generarCodigoNumerico(longitud: number): string {
  let codigo = '';
  for (let i = 0; i < longitud; i++) {
    codigo += Math.floor(Math.random() * 10).toString();
  }
  return codigo;
}
