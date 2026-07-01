/**
 * Static Assets / Workers Sites support for nest-worker.
 *
 * Provides a middleware and decorator to serve static files from
 * Cloudflare Workers Sites (or any KV/FILES namespace).
 *
 * @module static-assets
 */

import type { MiddlewareFn } from "../core/types";

// ─── Types ─────────────────────────────────────────────────────────────

export interface ServeStaticOptions {
  /**
   * URL path prefix for static files, e.g. "/assets".
   * Requests matching this prefix will be checked against the
   * static content binding.
   */
  root?: string;
  /**
   * Index / fallback file for SPA routing (default: "index.html").
   * When a requested file is not found, this file is served instead.
   * Set to `false` to disable SPA fallback.
   */
  index?: string | false;
  /**
   * Name of the env binding that holds the static content store
   * (default: "__STATIC_CONTENT").
   */
  contentBinding?: string;
  /**
   * Name of the env binding that holds the static content manifest JSON
   * (default: "__STATIC_CONTENT_MANIFEST").
   */
  manifestBinding?: string;
}

// ─── MIME types ────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".map": "application/json",
};

function getContentType(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ─── Middleware ────────────────────────────────────────────────────────

/**
 * Middleware that serves static files from a Workers Sites binding.
 *
 * Place this as a global middleware or use the `@ServeStatic()` decorator
 * to apply it to specific controllers or routes.
 *
 * @example
 * ```ts
 * // App-level
 * app.use(serveStaticAssets({ root: "/assets", index: "index.html" }));
 * ```
 */
export function serveStaticAssets(
  options: ServeStaticOptions = {},
): MiddlewareFn {
  const root = options.root ?? "";
  const indexFile =
    options.index !== false ? (options.index ?? "index.html") : null;
  const contentBinding = options.contentBinding ?? "__STATIC_CONTENT";

  return async (req: Request, env: any) => {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();

    // Only handle GET and HEAD
    if (method !== "GET" && method !== "HEAD") return;

    let filePath = url.pathname;

    // Check if the path matches the root prefix
    if (root) {
      const normalizedRoot = root.endsWith("/") ? root.slice(0, -1) : root;
      if (!filePath.startsWith(normalizedRoot)) return; // not for us
      filePath = filePath.slice(normalizedRoot.length) || "/";
    }

    // Normalize: collapse double slashes, remove leading slash
    filePath = filePath.split("/").filter(Boolean).join("/");

    // If empty, serve the index
    if (!filePath) {
      filePath = indexFile || "";
    }

    // Try to serve from the static content binding
    try {
      const content: any = env[contentBinding];
      if (!content || typeof content.get !== "function") return;

      // Try the exact path first
      let data = await content.get(filePath, { type: "arrayBuffer" });
      let contentType = getContentType(filePath);

      // SPA fallback: if not found, serve the index file
      if (data === null && indexFile && filePath !== indexFile) {
        data = await content.get(indexFile, { type: "arrayBuffer" });
        contentType = "text/html; charset=utf-8";
      }

      if (data !== null) {
        return new Response(data, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    } catch {
      // If static content is not available, silently pass through
    }

    // Not found → continue to next handler
    return;
  };
}

// ─── Metadata key ──────────────────────────────────────────────────────

const SERVE_STATIC_KEY = "__serve_static__";

// ─── Decorator ─────────────────────────────────────────────────────────

/**
 * Decorator that marks a controller method to serve static assets.
 *
 * Registers a GET route with a wildcard path that matches the `root`
 * prefix and serves files from the Workers Sites binding. The method
 * body serves as a fallback when no matching file is found.
 *
 * @param options - Static asset options.
 *
 * @example
 * ```ts
 * import { Controller, Get, ServeStatic } from "@varbyte/nest-worker";
 *
 * @Controller()
 * class AssetsController {
 *   @ServeStatic({ root: "/assets", index: "index.html" })
 *   assets() {
 *     // Fallback when file not found
 *     return new Response("Not Found", { status: 404 });
 *   }
 * }
 * ```
 */
export function ServeStatic(options?: ServeStaticOptions): MethodDecorator {
  const middleware = serveStaticAssets(options);

  return (target, propertyKey) => {
    const key = String(propertyKey);
    const root = options?.root ?? "";

    // Store metadata for introspection
    const entries: Array<{
      handlerName: string;
      options?: ServeStaticOptions;
    }> = Reflect.getMetadata(SERVE_STATIC_KEY, target.constructor) || [];
    entries.push({ handlerName: key, options });
    Reflect.defineMetadata(SERVE_STATIC_KEY, entries, target.constructor);

    // Register the middleware on the route
    const mwKey = `__middlewares__:${key}`;
    const existing: MiddlewareFn[] =
      Reflect.getMetadata(mwKey, target.constructor) || [];
    existing.push(middleware);
    Reflect.defineMetadata(mwKey, existing, target.constructor);

    // Also register a GET route so the middleware can intercept requests.
    // The route path uses a wildcard to match any sub-path under root.
    let routePath = root;
    if (routePath && !routePath.endsWith("/")) routePath += "/";
    routePath += ":path*";

    const ROUTES_KEY = "__routes__";
    const routes = Reflect.getMetadata(ROUTES_KEY, target.constructor) || [];
    routes.push({
      method: "GET" as const,
      path: routePath.replace(/^\//, ""),
      handlerName: key,
    });
    Reflect.defineMetadata(ROUTES_KEY, routes, target.constructor);
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Returns registered `@ServeStatic()` entries for a class.
 */
export function getServeStaticEntries(
  target: any,
): Array<{ handlerName: string; options?: ServeStaticOptions }> {
  return Reflect.getMetadata(SERVE_STATIC_KEY, target) || [];
}
