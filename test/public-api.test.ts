import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  D1,
  D1Repository,
  Delete,
  Env,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Module,
  NestWorkerApplication,
  NotFoundException,
  Options,
  Param,
  Patch,
  Post,
  Put,
  Query,
  QueryBuilder,
  Req,
  UnauthorizedException,
  UseMiddleware,
  UsePipe,
  bearerAuth,
  cors,
  createApplication,
  devRateLimit,
  logger,
  rateLimit,
  requestLogger,
} from "../src/index";
import type {
  BearerAuthOptions,
  CorsOptions,
  D1Database,
  D1PreparedStatement,
  D1Result,
  ErrorFilterContext,
  ErrorFilterFn,
  HttpMethod,
  InjectionToken,
  MiddlewareFn,
  ModuleOptions,
  ParamMetadata,
  PipeContext,
  PipeFn,
  RateLimitOptions,
  RequestLogEntry,
  RequestLoggerOptions,
  RouteDefinition,
  WorkerEnv,
} from "../src/index";

describe("public API contract", () => {
  it("should expose documented runtime exports from the package entrypoint", () => {
    expect(createApplication).toEqual(expect.any(Function));
    expect(NestWorkerApplication).toEqual(expect.any(Function));
    expect(NestWorkerApplication.prototype.useErrorFilter).toEqual(
      expect.any(Function),
    );
    expect(Module).toEqual(expect.any(Function));
    expect(Injectable).toEqual(expect.any(Function));
    expect(Inject).toEqual(expect.any(Function));
    expect(Controller).toEqual(expect.any(Function));
    expect(Get).toEqual(expect.any(Function));
    expect(Post).toEqual(expect.any(Function));
    expect(Put).toEqual(expect.any(Function));
    expect(Patch).toEqual(expect.any(Function));
    expect(Delete).toEqual(expect.any(Function));
    expect(Options).toEqual(expect.any(Function));
    expect(HttpCode).toEqual(expect.any(Function));
    expect(ParameterAndMiddlewareDecorators).toHaveLength(9);
    expect(D1Repository).toEqual(expect.any(Function));
    expect(QueryBuilder).toEqual(expect.any(Function));
    expect(cors).toEqual(expect.any(Function));
    expect(logger).toEqual(expect.any(Function));
    expect(requestLogger).toEqual(expect.any(Function));
    expect(bearerAuth).toEqual(expect.any(Function));
    expect(devRateLimit).toEqual(expect.any(Function));
    expect(rateLimit).toBe(devRateLimit);
    expect(HttpException).toEqual(expect.any(Function));
    expect(BadRequestException).toEqual(expect.any(Function));
    expect(UnauthorizedException).toEqual(expect.any(Function));
    expect(ForbiddenException).toEqual(expect.any(Function));
    expect(NotFoundException).toEqual(expect.any(Function));
    expect(ConflictException).toEqual(expect.any(Function));
    expect(InternalServerErrorException).toEqual(expect.any(Function));
  });

  it("should keep public type exports available to consumers", () => {
    const method: HttpMethod = "GET";
    const token: InjectionToken = "TOKEN";
    const middleware: MiddlewareFn = () => undefined;
    const errorFilter: ErrorFilterFn = () => undefined;
    const pipe: PipeFn = (args) => args;
    const moduleOptions: ModuleOptions = { providers: [] };
    const route: RouteDefinition = {
      method: "POST",
      path: "users",
      handlerName: "create",
    };
    const param: ParamMetadata = { index: 0, type: "body" };
    const corsOptions: CorsOptions = { origin: "*" };
    const authOptions: BearerAuthOptions = { staticToken: "secret" };
    const rateLimitOptions: RateLimitOptions = { max: 10 };
    const requestLoggerOptions: RequestLoggerOptions = { json: true };
    const logEntry: RequestLogEntry = {
      timestamp: "2026-06-24T00:00:00.000Z",
      requestId: "request-id",
      method: "GET",
      path: "/health",
      status: 200,
      durationMs: 1,
    };
    const env: WorkerEnv = { APP_ENV: "test" };
    const preparedStatement = {} as D1PreparedStatement;
    const database = {} as D1Database;
    const result = {} as D1Result;
    const pipeContext = {} as PipeContext;
    const errorFilterContext = {} as ErrorFilterContext;

    expect([
      method,
      token,
      middleware,
      errorFilter,
      pipe,
      moduleOptions,
      route,
      param,
      corsOptions,
      authOptions,
      rateLimitOptions,
      requestLoggerOptions,
      logEntry,
      env,
      preparedStatement,
      database,
      result,
      pipeContext,
      errorFilterContext,
    ]).toHaveLength(19);
  });
});

const ParameterAndMiddlewareDecorators = [
  Body,
  Param,
  Query,
  Headers,
  Req,
  Env,
  D1,
  UseMiddleware,
  UsePipe,
];
