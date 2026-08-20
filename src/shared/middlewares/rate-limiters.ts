import rateLimit from 'express-rate-limit';
import { Response as ApiResponse } from '../utils/response';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(ApiResponse.error(429, 'Demasiados intentos. Intenta nuevamente mas tarde.'));
  },
});
