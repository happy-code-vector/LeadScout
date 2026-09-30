import { describe, expect, it } from "vitest";
import { deriveRootCredentials } from "./ensure-root";

describe("deriveRootCredentials", () => {
  it("normalizes a valid pair", () => {
    expect(deriveRootCredentials({ ROOT_EMAIL: " Root@Example.COM ", ROOT_PASSWORD: "longenough1" })).toEqual({
      email: "root@example.com",
      password: "longenough1",
    });
  });

  it("is 'missing' when either var is absent/empty", () => {
    expect(deriveRootCredentials({})).toBe("missing");
    expect(deriveRootCredentials({ ROOT_EMAIL: "a@b.test" })).toBe("missing");
    expect(deriveRootCredentials({ ROOT_PASSWORD: "longenough1" })).toBe("missing");
  });

  it("is 'invalid' for a malformed email or short password", () => {
    expect(deriveRootCredentials({ ROOT_EMAIL: "not-an-email", ROOT_PASSWORD: "longenough1" })).toBe("invalid");
    expect(deriveRootCredentials({ ROOT_EMAIL: "a@b.test", ROOT_PASSWORD: "short" })).toBe("invalid");
  });
});
