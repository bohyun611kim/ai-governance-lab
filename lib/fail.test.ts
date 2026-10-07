import { describe, expect, it } from "vitest";

describe("intentional failure", () => {
  it("CI gate 검증용 - 반드시 실패해야 함", () => {
    expect(1).toBe(2);
  });
});
