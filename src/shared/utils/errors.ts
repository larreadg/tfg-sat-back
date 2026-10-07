export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

/**
 * 502: la request a nuestra API estaba bien, pero un servicio EXTERNO del que
 * dependemos fallo o rechazo la operacion (p.ej. el servidor SMTP configurado
 * rechaza las credenciales). No es un 400 —el cliente no se equivoco— ni un 500
 * —no se rompio nuestro codigo—.
 */
export class BadGatewayError extends AppError {
  constructor(message = 'Upstream service error') {
    super(message, 502);
  }
}
