// Application
export { createApplication, NestWorkerApplication } from "./core/application";
export type { WorkerEnv } from "./core/application";

// Decorators
export {
  Module,
  Injectable,
  Inject,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Options,
  HttpCode,
  Body,
  Param,
  Query,
  Headers,
  Req,
  Env,
  D1,
  UseMiddleware,
  UsePipe,
} from "./decorators/index";
export type { ModuleOptions } from "./decorators/index";

// Database
export { D1Repository } from "./database/repository";
export { QueryBuilder } from "./database/query-builder";

// Middlewares
export {
  cors,
  logger,
  requestLogger,
  bearerAuth,
  devRateLimit,
  rateLimit,
} from "./extras/middlewares";
export type {
  CorsOptions,
  RequestLogEntry,
  RequestLogError,
  RequestLoggerOptions,
  BearerAuthOptions,
  RateLimitOptions,
} from "./extras/middlewares";

// Validation helpers
export { createValidationPipe, validateBody } from "./extras/validation";
export type {
  ValidationContext,
  ValidationIssue,
  ValidationPipeOptions,
  ValidationResult,
  ValidationRule,
  ValidatorFn,
} from "./extras/validation";

// Exceptions
export {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from "./core/exceptions";

// Swagger / OpenAPI
export {
  ApiModel,
  Prop,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiTags,
  buildOpenApiSpec,
  createSwaggerMiddleware,
} from "./extras/swagger";
export type {
  ApiModelOptions,
  PropOptions,
  ApiOperationOptions,
  ApiBodyOptions,
  ApiResponseOptions,
  SwaggerOptions,
} from "./extras/swagger";

// Types
export type {
  HttpMethod,
  ErrorFilterContext,
  ErrorFilterFn,
  InjectionToken,
  RouteDefinition,
  MiddlewareFn,
  PipeContext,
  PipeFn,
  ParamMetadata,
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "./core/types";
