import svgCaptcha from 'svg-captcha';
import { prisma } from '../../config/prisma';
import { BadRequestError } from '../utils/errors';

export async function generateCaptcha(ip: string): Promise<string> {
  const captcha = svgCaptcha.create({
    color: true,
    noise: 4,
    charPreset: 'abcdefghijklmnpqrstuvwxyz123456789',
    background: 'transparent',
  });

  await prisma.$transaction([
    prisma.captcha.deleteMany({ where: { ip } }),
    prisma.captcha.create({
      data: {
        ip,
        captcha: captcha.text,
      },
    }),
  ]);

  return captcha.data;
}

export async function verifyCaptcha(ip: string, captcha: string): Promise<void> {
  const registro = await prisma.captcha.findFirst({
    where: { ip },
    orderBy: { fechaCreacion: 'desc' },
  });

  if (!registro || registro.captcha.toLowerCase() !== captcha.toLowerCase()) {
    throw new BadRequestError('El captcha es incorrecto o ha expirado.');
  }

  await prisma.captcha.delete({ where: { id: registro.id } });
}
