export type ResponseStatus = 'success' | 'error';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class Response<T = null> {
  public readonly code: number;
  public readonly status: ResponseStatus;
  public readonly data: T | null;
  public readonly message: string;
  public readonly meta?: PaginationMeta;

  constructor(code: number, status: ResponseStatus, data: T | null, message: string, meta?: PaginationMeta) {
    this.code = code;
    this.status = status;
    this.data = data;
    this.message = message;
    this.meta = meta;
  }

  static success<T>(code: number, data: T | null, message: string, meta?: PaginationMeta): Response<T> {
    return new Response(code, 'success', data, message, meta);
  }

  static error(code: number, message: string, data: null = null): Response<null> {
    return new Response(code, 'error', data, message);
  }
}
