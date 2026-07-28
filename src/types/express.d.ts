import { CiudadanoSessionPayload } from '../models/reporteCiudadano.model';
import { SessionPayload } from '../models/auth.model';

declare global {
  namespace Express {
    interface Request {
      ciudadano?: CiudadanoSessionPayload;
      usuario?: SessionPayload;
    }
  }
}

export {};
