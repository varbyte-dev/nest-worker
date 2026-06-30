import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";

// ═══════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════

export interface DetectedController {
  filePath: string;
  relativePath: string;
  className: string;
  prefix: string;
  routes: DetectedRoute[];
  tags: string[];
  hasTagsDecorator: boolean;
  lastImportEnd: number; // position where imports end
  classStart: number; // position where class declaration starts
}

export interface DetectedRoute {
  method: string;
  path: string;
  handlerName: string;
  params: DetectedParam[];
  returnTypeName: string | null;
  bodyTypeName: string | null;
  hasApiOperation: boolean;
  hasApiBody: boolean;
  hasApiResponse: boolean;
}

export interface DetectedParam {
  type: "body" | "param" | "query" | "header" | "request" | "env" | "db";
  key: string | undefined;
  tsTypeName: string | null;
}

export interface DetectedDTO {
  filePath: string;
  relativePath: string;
  className: string;
  properties: DetectedProperty[];
  hasApiModel: boolean;
  importsApiModel: boolean;
  importsProp: boolean;
}

export interface DetectedProperty {
  name: string;
  type: string;
  optional: boolean;
  hasProp: boolean;
}

export interface DetectionSummary {
  controllers: DetectedController[];
  dtos: DetectedDTO[];
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Remove comments from source code for easier parsing */
function stripComments(code: string): string {
  return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Check if a line contains an import statement */
function isImportLine(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("import ") ||
    t.startsWith("import '") ||
    t.startsWith('import "')
  );
}

/** Extract the last position where imports end in the file */
function findLastImportEnd(code: string): number {
  const lines = code.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isImportLine(lines[i])) {
      // Handle multi-line imports
      let j = i;
      while (
        j < lines.length &&
        !lines[j].includes(";") &&
        !lines[j].trim().endsWith('"') &&
        !lines[j].trim().endsWith("'")
      ) {
        j++;
      }
      lastImport = j;
      i = j;
    }
  }
  if (lastImport === -1) return 0;
  // Return the end position (line index + 1 for newline)
  let pos = 0;
  for (let i = 0; i <= lastImport; i++) {
    pos += lines[i].length + 1;
  }
  return pos;
}

/** Find the position of the class declaration */
function findClassStart(code: string): number {
  const match = code.match(/export\s+(default\s+)?class\s+\w+/);
  return match ? match.index! : -1;
}

/** Simple pluralization */
function simplePlural(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith("s")) return word;
  if (/(s|sh|ch|x|z)$/i.test(lower)) return word + "es";
  if (/([^aeiou])y$/i.test(lower)) return word.slice(0, -1) + "ies";
  return word + "s";
}

/** Description-friendly name from class name */
function classNameToDescription(name: string): string {
  return name
    .replace(/Dto$/i, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

// ═══════════════════════════════════════════════════════════════════
//  SCANNERS
// ═══════════════════════════════════════════════════════════════════

/** Scan all controllers in src/modules/ */
export function scanControllers(root: string): DetectedController[] {
  const modulesDir = resolve(root, "src", "modules");
  if (!existsSync(modulesDir)) return [];

  const controllers: DetectedController[] = [];
  scanDirForControllers(modulesDir, root, controllers);
  return controllers;
}

function scanDirForControllers(
  dir: string,
  root: string,
  result: DetectedController[],
): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      scanDirForControllers(fullPath, root, result);
    } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      const ctrl = parseControllerFile(fullPath, root);
      if (ctrl) result.push(ctrl);
    }
  }
}

/** Scan all DTOs in src/modules/ */
export function scanDTOs(root: string): DetectedDTO[] {
  const modulesDir = resolve(root, "src", "modules");
  if (!existsSync(modulesDir)) return [];

  const dtos: DetectedDTO[] = [];
  scanDirForDTOs(modulesDir, root, dtos);
  return dtos;
}

function scanDirForDTOs(
  dir: string,
  root: string,
  result: DetectedDTO[],
): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      scanDirForDTOs(fullPath, root, result);
    } else if (entry.isFile() && entry.name.endsWith(".dto.ts")) {
      const dto = parseDTOFile(fullPath, root);
      if (dto) result.push(dto);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PARSERS
// ═══════════════════════════════════════════════════════════════════

function parseControllerFile(
  filePath: string,
  root: string,
): DetectedController | null {
  const code = readFileSync(filePath, "utf-8");
  const stripped = stripComments(code);

  // Extract class name
  const classMatch = stripped.match(/export\s+(default\s+)?class\s+(\w+)/);
  if (!classMatch) return null;
  const className = classMatch[2];

  // Extract @Controller prefix
  const controllerMatch = stripped.match(/@Controller\s*\(\s*'([^']*)'\s*\)/);
  const prefix = controllerMatch ? controllerMatch[1] : "";

  // Extract @ApiTags
  const hasTagsDecorator = stripped.includes("@ApiTags");

  // Tags derived from class name
  const tags = [className.replace(/Controller$/, "")];

  // Extract routes
  const routes = extractRoutes(stripped);
  const lastImportEnd = findLastImportEnd(code);
  const classStart = findClassStart(code);

  return {
    filePath,
    relativePath: relative(root, filePath),
    className,
    prefix,
    routes,
    tags,
    hasTagsDecorator,
    lastImportEnd,
    classStart,
  };
}

function extractRoutes(code: string): DetectedRoute[] {
  const routes: DetectedRoute[] = [];
  const methodPattern =
    /@(Get|Post|Put|Patch|Delete|Options)\s*\(\s*'([^']*)'\s*\)/g;

  const routeMatches: {
    method: string;
    path: string;
    pos: number;
  }[] = [];
  let match: RegExpExecArray | null;
  while ((match = methodPattern.exec(code)) !== null) {
    routeMatches.push({
      method: match[1],
      path: match[2],
      pos: match.index,
    });
  }

  for (const routeMatch of routeMatches) {
    const nextRoutePos = routeMatches
      .filter((r) => r.pos > routeMatch.pos)
      .sort((a, b) => a.pos - b.pos)[0];
    const endPos = nextRoutePos ? nextRoutePos.pos : code.length;
    const methodBlock = code.slice(routeMatch.pos, endPos);

    // Extract handler name
    const handlerMatch = methodBlock.match(/async\s+(\w+)\s*\(/);
    const handlerName = handlerMatch ? handlerMatch[1] : "unknown";

    // Check for swagger decorators
    const hasApiOperation = methodBlock.includes("@ApiOperation");
    const hasApiBody = methodBlock.includes("@ApiBody");
    const hasApiResponse = methodBlock.includes("@ApiResponse");

    // Extract parameters
    const params = extractParams(methodBlock);

    // Body type name
    const bodyParam = params.find((p) => p.type === "body");
    const bodyTypeName = bodyParam?.tsTypeName || null;

    // Return type from type annotation
    const returnTypePattern = /\)\s*:\s*(Promise<)?\s*(\w+)\s*(\[\])?\s*>/;
    const returnTypeMatch = methodBlock.match(returnTypePattern);
    const returnTypeName = returnTypeMatch ? returnTypeMatch[2] : null;

    routes.push({
      method: routeMatch.method.toUpperCase(),
      path: routeMatch.path,
      handlerName,
      params,
      returnTypeName,
      bodyTypeName,
      hasApiOperation,
      hasApiBody,
      hasApiResponse,
    });
  }

  return routes;
}

function extractParams(code: string): DetectedParam[] {
  const params: DetectedParam[] = [];

  // @Body() paramName: TypeName
  const bodyPattern = /@Body\s*\(\s*\)\s*\w+\s*:\s*(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = bodyPattern.exec(code)) !== null) {
    params.push({ type: "body", key: undefined, tsTypeName: m[1] });
  }

  // @Param('key') paramName: TypeName
  const paramPattern = /@Param\s*\(\s*'([^']+)'\s*\)\s*\w+\s*:\s*(\w+)/g;
  while ((m = paramPattern.exec(code)) !== null) {
    params.push({ type: "param", key: m[1], tsTypeName: m[2] });
  }

  // @Query('key') paramName: TypeName
  const queryPattern = /@Query\s*\(\s*'([^']+)'\s*\)\s*\w+\s*:\s*(\w+)/g;
  while ((m = queryPattern.exec(code)) !== null) {
    params.push({ type: "query", key: m[1], tsTypeName: m[2] });
  }

  return params;
}

function parseDTOFile(filePath: string, root: string): DetectedDTO | null {
  const code = readFileSync(filePath, "utf-8");
  const stripped = stripComments(code);

  // Extract class or interface name
  const classMatch = stripped.match(
    /export\s+(default\s+)?(class|interface)\s+(\w+)/,
  );
  if (!classMatch) return null;
  const className = classMatch[3];

  const hasApiModel = stripped.includes("@ApiModel");
  const importsApiModel = /import\s*\{[^}]*ApiModel[^}]*\}/.test(code);
  const importsProp = /import\s*\{[^}]*Prop[^}]*\}/.test(code);

  // Extract properties
  const properties = extractDTOProperties(stripped);

  return {
    filePath,
    relativePath: relative(root, filePath),
    className,
    properties,
    hasApiModel,
    importsApiModel,
    importsProp,
  };
}

function extractDTOProperties(code: string): DetectedProperty[] {
  const props: DetectedProperty[] = [];

  // Match interface/class body properties
  // Pattern: propName?: Type; or propName: Type;
  const propPattern = /^\s+(\w+)(\??)\s*:\s*(\w+(?:\[\])?);?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = propPattern.exec(code)) !== null) {
    // Check if @Prop() appears before this property
    const beforeProp = code.slice(0, m.index);
    const linesBefore = beforeProp.split("\n");
    const lastDecoratorLine = linesBefore
      .filter((l) => l.trim().startsWith("@"))
      .pop();
    const hasProp = lastDecoratorLine?.trim().startsWith("@Prop") === true;

    props.push({
      name: m[1],
      type: m[3],
      optional: m[2] === "?",
      hasProp,
    });
  }

  return props;
}

// ═══════════════════════════════════════════════════════════════════
//  CODE GENERATORS
// ═══════════════════════════════════════════════════════════════════

/** Generate the import statement for swagger decorators */
export function generateSwaggerImport(): string {
  return `import { ApiModel, Prop, ApiTags, ApiOperation, ApiBody, ApiResponse } from '@varbyte/nest-worker';`;
}

/** Add swagger import to a file */
export function addSwaggerImport(code: string): {
  code: string;
  added: boolean;
} {
  if (code.includes("@varbyte/nest-worker")) {
    // Already has an import from nest-worker
    const importMatch = code.match(
      /(import\s+\{[^}]*)\}\s+from\s+['"]@varbyte\/nest-worker['"]/,
    );
    if (importMatch) {
      const existing = importMatch[1];
      // Check which decorators are already imported
      const hasApiModel = existing.includes("ApiModel");
      const hasProp = existing.includes("Prop");
      const hasApiTags = existing.includes("ApiTags");
      const hasApiOperation = existing.includes("ApiOperation");
      const hasApiBody = existing.includes("ApiBody");
      const hasApiResponse = existing.includes("ApiResponse");

      const missing: string[] = [];
      if (!hasApiModel) missing.push("ApiModel");
      if (!hasProp) missing.push("Prop");
      if (!hasApiTags) missing.push("ApiTags");
      if (!hasApiOperation) missing.push("ApiOperation");
      if (!hasApiBody) missing.push("ApiBody");
      if (!hasApiResponse) missing.push("ApiResponse");

      if (missing.length === 0) return { code, added: false };

      // Insert missing decorators into the import
      const newImport = code.replace(
        /(import\s+\{[^}]*)\}\s+from\s+['"]@varbyte\/nest-worker['"]/,
        `$1, ${missing.join(", ")}} from '@varbyte/nest-worker'`,
      );
      return { code: newImport, added: true };
    }
    return { code, added: false };
  }

  // No existing nest-worker import — add one
  const lines = code.split("\n");
  const insertAt = lines.findIndex(
    (l) => l.trim().startsWith("import ") || l.trim().startsWith("//"),
  );
  const importLine = `${generateSwaggerImport()};`;
  if (insertAt >= 0) {
    lines.splice(insertAt, 0, importLine);
  } else {
    lines.unshift(importLine);
  }
  return { code: lines.join("\n"), added: true };
}

/** Add @ApiModel() decorator to a DTO file */
export function addApiModelToDTO(
  code: string,
  className: string,
  properties: DetectedProperty[],
): { code: string; modified: boolean } {
  if (code.includes("@ApiModel")) return { code, modified: false };

  // Add import if needed
  const importResult = addSwaggerImport(code);
  code = importResult.code;

  const description = classNameToDescription(className);

  // Find the class/interface declaration and add @ApiModel before it
  const declPattern = new RegExp(
    `(export\\s+(default\\s+)?(class|interface)\\s+${escapeRegex(className)})`,
  );
  const declMatch = code.match(declPattern);
  if (!declMatch) return { code, modified: false };

  const apiModelDecorator = `@ApiModel({ description: '${description}' })\n`;
  code =
    code.slice(0, declMatch.index) +
    apiModelDecorator +
    code.slice(declMatch.index);

  return { code, modified: true };
}

/** Add @Prop() decorator before each property in a DTO */
export function addPropToDTOProperties(
  code: string,
  properties: DetectedProperty[],
): { code: string; modified: boolean } {
  let modified = false;
  let result = code;

  for (const prop of properties) {
    if (prop.hasProp) continue;

    // Find the property declaration
    const pattern = new RegExp(
      `^\\s+${escapeRegex(prop.name)}\\??\\s*:\\s*${escapeRegex(prop.type)}`,
      "m",
    );
    const match = result.match(pattern);
    if (!match) continue;

    // Determine the type mapping
    const swaggerType = mapTSToSwaggerType(prop.type);
    let propDecorator = "@Prop()";
    if (
      swaggerType !== mapTSToSwaggerType(prop.type) ||
      prop.type.endsWith("[]")
    ) {
      const opts: string[] = [];
      if (prop.type.endsWith("[]")) {
        opts.push(`type: 'array'`);
        opts.push(
          `items: { type: '${mapTSToSwaggerType(prop.type.slice(0, -2))}' }`,
        );
      } else if (swaggerType !== mapTSToSwaggerType(prop.type)) {
        opts.push(`type: '${swaggerType}'`);
      }
      if (opts.length > 0) {
        propDecorator = `@Prop({ ${opts.join(", ")} })`;
      }
    }

    result =
      result.slice(0, match.index) +
      propDecorator +
      "\n" +
      result.slice(match.index);
    modified = true;
  }

  // Add import if any decorators were added
  if (modified) {
    const importResult = addSwaggerImport(result);
    result = importResult.code;
  }

  return { code: result, modified };
}

/** Add @ApiTags() to controller */
export function addApiTagsToController(
  code: string,
  tags: string[],
): { code: string; modified: boolean } {
  if (code.includes("@ApiTags")) return { code, modified: false };

  // Find @Controller decorator
  const controllerMatch = code.match(/@Controller\s*\(/);
  if (!controllerMatch) return { code, modified: false };

  // Insert @ApiTags before @Controller
  const tagsStr = tags.map((t) => `'${t}'`).join(", ");
  const apiTags = `@ApiTags(${tagsStr})\n`;
  code =
    code.slice(0, controllerMatch.index) +
    apiTags +
    code.slice(controllerMatch.index);

  // Add import
  const importResult = addSwaggerImport(code);
  return { code: importResult.code, modified: true };
}

/** Add @ApiOperation() with auto-detected summary to route handlers */
export function addApiOperationToHandler(
  code: string,
  handlerName: string,
  route: DetectedRoute,
): { code: string; modified: boolean } {
  if (code.includes(`@ApiOperation`)) return { code, modified: false };

  // Find the route decorator (Get, Post, etc.)
  const routePattern = new RegExp(
    `@(Get|Post|Put|Patch|Delete|Options)\\s*\\(\\s*'${escapeRegex(route.path)}'\\s*\\)`,
  );
  const routeMatch = code.match(routePattern);
  if (!routeMatch) return { code, modified: false };

  // Derive a human-readable summary from the handler name
  const summary = handlerName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

  const operationDecorator = `@ApiOperation({ summary: '${summary}' })\n`;
  code =
    code.slice(0, routeMatch.index) +
    operationDecorator +
    code.slice(routeMatch.index);

  // Add import
  const importResult = addSwaggerImport(code);
  return { code: importResult.code, modified: true };
}

/** Generate the Swagger middleware setup code for worker.ts */
export function generateSwaggerWorkerCode(options: {
  title?: string;
  version?: string;
  description?: string;
  path?: string;
  auth?: boolean;
}): { importLine: string; setupLine: string } {
  const importLine = `import { swaggerConfig } from './common/config/swagger';`;
  const setupLine = `app.useSwagger(swaggerConfig);`;

  return { importLine, setupLine };
}

/** Map TypeScript primitive names to OpenAPI/Swagger types */
function mapTSToSwaggerType(tsType: string): string {
  const base = tsType.replace(/\[\]$/, "");
  const map: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    Date: "string",
    any: "object",
    unknown: "object",
    void: "string",
    undefined: "string",
    null: "string",
    object: "object",
    array: "array",
    integer: "integer",
    Record: "object",
  };
  return map[base] || "string";
}

/** Escape special regex characters in a string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
