import "reflect-metadata";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  serveStaticAssets,
  ServeStatic,
  ServeStaticOptions,
  getServeStaticEntries,
} from "../src/extras/static-assets";
import { Controller, Module, Get } from "../src/decorators/index";
import { createApplication } from "../src/core/application";

// ─── Fake static content store ─────────────────────────────────────────

function fakeStore(files: Record<string, ArrayBuffer>) {
  return {
    get: vi.fn(async (path: string, _opts?: any) => {
      return files[path] ?? null;
    }),
  };
}

function strToBuf(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

function bufToStr(b: ArrayBuffer): string {
  return new TextDecoder().decode(b);
}

describe("serveStaticAssets middleware", () => {
  it("should skip non-GET requests", async () => {
    const mw = serveStaticAssets({ contentBinding: "FILES" });
    const env = { FILES: fakeStore({}) };

    const postRes = await mw(
      new Request("http://localhost/test", { method: "POST" }),
      env,
    );
    expect(postRes).toBeUndefined();

    const putRes = await mw(
      new Request("http://localhost/test", { method: "PUT" }),
      env,
    );
    expect(putRes).toBeUndefined();
  });

  it("should skip if content binding is missing", async () => {
    const mw = serveStaticAssets({ contentBinding: "FILES" });

    const res = await mw(new Request("http://localhost/test"), {});
    expect(res).toBeUndefined();
  });

  it("should serve a file from the static store", async () => {
    const files = { "styles.css": strToBuf("body { color: red }") };
    const mw = serveStaticAssets({ contentBinding: "FILES" });

    const res = await mw(new Request("http://localhost/styles.css"), {
      FILES: fakeStore(files),
    });

    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe("body { color: red }");
    expect(res!.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
  });

  it("should serve the index file for root path", async () => {
    const files = { "index.html": strToBuf("<h1>Hello</h1>") };
    const mw = serveStaticAssets({
      contentBinding: "FILES",
      index: "index.html",
    });

    const res = await mw(new Request("http://localhost/"), {
      FILES: fakeStore(files),
    });

    expect(res).toBeInstanceOf(Response);
    expect(await res!.text()).toBe("<h1>Hello</h1>");
  });

  it("should do SPA fallback when file is not found", async () => {
    const files = { "index.html": strToBuf("<h1>SPA</h1>") };
    const mw = serveStaticAssets({
      contentBinding: "FILES",
      index: "index.html",
    });

    const res = await mw(new Request("http://localhost/some/unknown/path"), {
      FILES: fakeStore(files),
    });

    expect(res).toBeInstanceOf(Response);
    expect(await res!.text()).toBe("<h1>SPA</h1>");
    expect(res!.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  });

  it("should respect the root prefix", async () => {
    const files = { "logo.png": strToBuf("fake-png") };
    const mw = serveStaticAssets({
      root: "/assets",
      contentBinding: "FILES",
    });

    // URL with matching prefix
    const res = await mw(new Request("http://localhost/assets/logo.png"), {
      FILES: fakeStore(files),
    });
    expect(res).toBeInstanceOf(Response);
    expect(await res!.text()).toBe("fake-png");

    // URL without matching prefix
    const res2 = await mw(new Request("http://localhost/logo.png"), {
      FILES: fakeStore(files),
    });
    expect(res2).toBeUndefined();
  });

  it("should pass through when file is not found and no SPA fallback", async () => {
    const mw = serveStaticAssets({
      contentBinding: "FILES",
      index: false, // disable SPA fallback
    });

    const res = await mw(new Request("http://localhost/missing.txt"), {
      FILES: fakeStore({}),
    });
    expect(res).toBeUndefined();
  });
});

// ─── @ServeStatic decorator ────────────────────────────────────────────

describe("@ServeStatic decorator", () => {
  it("should register metadata on the class", () => {
    class AssetsCtrl {
      @ServeStatic({ root: "/public", index: "index.html" })
      serve() {}
    }

    const entries = getServeStaticEntries(AssetsCtrl);
    expect(entries).toHaveLength(1);
    expect(entries[0].handlerName).toBe("serve");
    expect(entries[0].options?.root).toBe("/public");
  });

  it("should register the middleware on the route", () => {
    class AssetsCtrl {
      @ServeStatic({ contentBinding: "FILES" })
      assets() {}
    }

    const mwKey = "__middlewares__:assets";
    const mws = Reflect.getMetadata(mwKey, AssetsCtrl);
    expect(mws).toBeDefined();
    expect(mws).toHaveLength(1);
    expect(typeof mws[0]).toBe("function");
  });
});

// ─── Integration ───────────────────────────────────────────────────────

describe("Static assets integration", () => {
  it("should serve static files alongside HTTP routes", async () => {
    const files = { "hello.txt": strToBuf("Hello from static!") };

    class AssetsCtrl {
      @ServeStatic({ contentBinding: "FILES", root: "/static" })
      staticAssets() {
        return new Response("fallback", { status: 404 });
      }

      @Get("api/health")
      health() {
        return new Response("ok");
      }
    }

    @Module({ controllers: [AssetsCtrl] })
    class AppModule {}

    const app = createApplication(AppModule);

    // Static file
    const staticRes = await app.handle(
      new Request("http://localhost/static/hello.txt"),
      { FILES: fakeStore(files) },
      {} as ExecutionContext,
    );
    expect(staticRes.status).toBe(200);
    expect(await staticRes.text()).toBe("Hello from static!");

    // Regular API route still works
    const apiRes = await app.handle(
      new Request("http://localhost/api/health"),
      {},
      {} as ExecutionContext,
    );
    expect(apiRes.status).toBe(200);
    expect(await apiRes.text()).toBe("ok");
  });
});
