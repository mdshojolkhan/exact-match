import { describe, expect, test } from "bun:test";
import { toolRegistry } from "../tools/builtin.server";

describe("AI role permissions", () => {
  test("helper cannot see or run workspace write tools", async () => {
    const names = toolRegistry.listForModel("helper").map((t) => t.name);
    expect(names).not.toContain("file_write");
    expect(names).toContain("file_read");
    await expect(
      toolRegistry.run("file_write", { path: "a.txt", content: "x" }, { conversationId: "t", aiRole: "helper" }),
    ).rejects.toThrow();
  });
  test("missing role defaults to helper", async () => {
    await expect(
      toolRegistry.run("file_write", { path: "a.txt", content: "x" }, { conversationId: "t" }),
    ).rejects.toThrow();
  });
  test("admin can write", async () => {
    expect(toolRegistry.listForModel("admin").map((t) => t.name)).toContain("file_write");
    const out = await toolRegistry.run("file_write", { path: "a.txt", content: "x" }, { conversationId: "t", aiRole: "admin" });
    expect(out).toContain("Saved");
  });
});
