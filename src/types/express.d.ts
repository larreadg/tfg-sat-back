import { CiudadanoSessionPayload } from '../modules/citizen-auth/citizen-auth.types';
import { SessionPayload } from '../modules/auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      ciudadano?: CiudadanoSessionPayload;
      usuario?: SessionPayload;
    }
  }
}

export {};
