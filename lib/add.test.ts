import { describe, expect, it } from "vitest";
import { add } from "./add";

describe("add", () => {
  it("두 숫자를 더한다", () => {
    expect(add(2, 3)).toBe(5);
  });
});
