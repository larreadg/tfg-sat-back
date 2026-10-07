-- Baja del captcha SVG: el gate anti-bot pasa a ser Cloudflare Turnstile
-- (login del panel, validacion de telefono y envio de reporte), que se verifica
-- server-side contra Cloudflare y no necesita estado propio en la base.

DROP TABLE IF EXISTS "Captcha";
