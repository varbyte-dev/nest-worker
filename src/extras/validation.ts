import { BadRequestException } from "../core/exceptions";
import { ParamMetadata, PipeContext, PipeFn } from "../core/types";

export interface ValidationIssue {
  message: string;
  field?: string;
  code?: string;
  value?: unknown;
}

export type ValidationResult =
  | void
  | boolean
  | string
  | ValidationIssue
  | ValidationIssue[];

export type ValidatorFn<T = unknown> = (
  value: T,
  context: ValidationContext,
) => Promise<ValidationResult> | ValidationResult;

export interface ValidationContext extends PipeContext {
  parameter: ParamMetadata;
}

export interface ValidationRule<T = any> {
  type: ParamMetadata["type"];
  key?: string;
  validate: ValidatorFn<T>;
  message?: string;
}

export interface ValidationPipeOptions {
  message?: string;
}

export function validateBody<T = unknown>(
  validate: ValidatorFn<T>,
  options: ValidationPipeOptions = {},
): PipeFn {
  return createValidationPipe({
    type: "body",
    validate,
    message: options.message,
  });
}

export function createValidationPipe(
  rules: ValidationRule<any> | ValidationRule<any>[],
  options: ValidationPipeOptions = {},
): PipeFn {
  const normalizedRules = Array.isArray(rules) ? rules : [rules];

  return async (args, context) => {
    for (const rule of normalizedRules) {
      const parameters = context.parameters.filter((parameter) =>
        parameterMatchesRule(parameter, rule)
      );

      for (const parameter of parameters) {
        const result = await rule.validate(args[parameter.index], {
          ...context,
          parameter,
        });
        const issues = toValidationIssues(
          result,
          rule.message || options.message || "Validation failed",
          parameter,
        );
        if (issues.length) {
          throw new BadRequestException("Validation failed", { issues });
        }
      }
    }
  };
}

function parameterMatchesRule(
  parameter: ParamMetadata,
  rule: ValidationRule,
): boolean {
  return parameter.type === rule.type && (
    rule.key === undefined || parameter.key === rule.key
  );
}

function toValidationIssues(
  result: ValidationResult,
  fallbackMessage: string,
  parameter: ParamMetadata,
): ValidationIssue[] {
  if (result === undefined || result === true) return [];
  if (result === false) {
    return [{
      message: fallbackMessage,
      field: parameter.key,
    }];
  }
  if (typeof result === "string") {
    return [{
      message: result,
      field: parameter.key,
    }];
  }
  if (Array.isArray(result)) {
    return result.map((issue) => withFallbackField(issue, parameter));
  }
  return [withFallbackField(result, parameter)];
}

function withFallbackField(
  issue: ValidationIssue,
  parameter: ParamMetadata,
): ValidationIssue {
  return {
    ...issue,
    field: issue.field ?? parameter.key,
  };
}
