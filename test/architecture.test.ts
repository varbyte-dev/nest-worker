import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

describe("source architecture boundaries", () => {
  it("keeps core runtime independent from bundled middleware extras", () => {
    const runtimeFiles = [
      "src/core/application.ts",
      "src/core/router.ts",
    ];

    for (const file of runtimeFiles) {
      const content = source(file);

      expect(content).not.toContain("../extras/middlewares");
      expect(content).not.toContain("./middlewares");
    }
  });

  it("keeps bundled middlewares behind the public extras boundary", () => {
    const entrypoint = source("src/index.ts");

    expect(entrypoint).toContain("./extras/middlewares");
    expect(entrypoint).not.toContain("./core/middlewares");
  });
});
