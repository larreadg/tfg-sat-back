import { prisma } from '../../config/prisma';

/**
 * Parametros geograficos/temporales del motor (ERS §5.4, §5.5) que viven en la
 * `ConfiguracionCriticidad` activa: radio de proximidad, ventana temporal y
 * minimo de reportes para consolidar un punto critico. Si no hay config activa,
 * defaults del ERS.
 */
export interface ParametrosGeo {
  radioMetros: number;
  ventanaDias: number;
  minReportes: number;
}

const DEFAULTS: ParametrosGeo = { radioMetros: 500, ventanaDias: 7, minReportes: 3 };

export async function obtenerParametrosGeo(): Promise<ParametrosGeo> {
  const config = await prisma.configuracionCriticidad.findFirst({
    where: { activa: true },
    select: { radioMetros: true, ventanaDias: true, minReportes: true },
  });

  return {
    radioMetros: config?.radioMetros ?? DEFAULTS.radioMetros,
    ventanaDias: config?.ventanaDias ?? DEFAULTS.ventanaDias,
    minReportes: config?.minReportes ?? DEFAULTS.minReportes,
  };
}
