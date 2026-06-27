export type ResponseStatus = 'success' | 'error';

export class Response<T = null> {
  public readonly code: number;
  public readonly status: ResponseStatus;
  public readonly data: T | null;
  public readonly message: string;

  constructor(code: number, status: ResponseStatus, data: T | null, message: string) {
    this.code = code;
    this.status = status;
    this.data = data;
    this.message = message;
  }

  static success<T>(code: number, data: T | null, message: string): Response<T> {
    return new Response(code, 'success', data, message);
  }

  static error(code: number, message: string, data: null = null): Response<null> {
    return new Response(code, 'error', data, message);
  }
}
