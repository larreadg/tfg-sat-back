import { prisma } from '../../config/prisma';

/**
 * Limites anti-abuso por numero (ERS §3). Viven en la `ConfiguracionCriticidad`
 * activa (`limitesAntiabuso`), nunca hardcodeados. Si no hay config activa se
 * usan los defaults del ERS.
 */
export interface LimitesAntiabuso {
  otpPorHora: number;
  reportesPor24h: number;
}

const DEFAULTS: LimitesAntiabuso = { otpPorHora: 3, reportesPor24h: 3 };

export async function obtenerLimitesAntiabuso(): Promise<LimitesAntiabuso> {
  const config = await prisma.configuracionCriticidad.findFirst({
    where: { activa: true },
    select: { limitesAntiabuso: true },
  });

  const raw = (config?.limitesAntiabuso ?? {}) as Partial<LimitesAntiabuso>;

  return {
    otpPorHora: typeof raw.otpPorHora === 'number' ? raw.otpPorHora : DEFAULTS.otpPorHora,
    reportesPor24h: typeof raw.reportesPor24h === 'number' ? raw.reportesPor24h : DEFAULTS.reportesPor24h,
  };
}
