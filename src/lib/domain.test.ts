import { describe, expect, it } from "vitest";
import { userRoleSchema, userStatusSchema } from "./domain";

describe("user enums", () => {
  it("accepts the defined roles and statuses", () => {
    expect(userRoleSchema.parse("ROOT")).toBe("ROOT");
    expect(userRoleSchema.parse("USER")).toBe("USER");
    expect(userStatusSchema.parse("PENDING")).toBe("PENDING");
    expect(userStatusSchema.parse("ACTIVE")).toBe("ACTIVE");
  });

  it("rejects anything else", () => {
    expect(userRoleSchema.safeParse("ADMIN").success).toBe(false);
    expect(userStatusSchema.safeParse("BANNED").success).toBe(false);
  });
});
