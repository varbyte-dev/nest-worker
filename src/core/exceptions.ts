export class HttpException extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'HttpException';
  }

  toResponse(): Response {
    return new Response(
      JSON.stringify({ error: this.message, statusCode: this.statusCode, details: this.details }),
      {
        status: this.statusCode,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad Request', details?: unknown) {
    super(message, 400, details);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not Found') {
    super(message, 404);
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = 'Internal Server Error') {
    super(message, 500);
  }
}
