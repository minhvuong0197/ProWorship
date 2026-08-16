import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  describeObsClose,
  obsAuthSecret,
  sha256B64,
} from "../src/lib/obs";

describe("describeObsClose", () => {
  it("maps 4007 to wrong-password message", () => {
    const msg = describeObsClose(4007, "");
    expect(msg).toContain("Sai mật khẩu");
  });

  it("maps 4009 to password-required message", () => {
    const msg = describeObsClose(4009, "");
    expect(msg).toContain("yêu cầu mật khẩu");
  });

  it("maps 4006 to not-authenticated message", () => {
    const msg = describeObsClose(4006, "");
    expect(msg).toContain("chưa xác thực");
  });

  it("maps 1006 to connection-failed message", () => {
    const msg = describeObsClose(1006, "");
    expect(msg).toContain("Không thể kết nối tới OBS");
  });

  it("falls back to reason text when the code is not special", () => {
    expect(describeObsClose(1001, "authentication failed")).toContain("Sai mật khẩu");
    expect(describeObsClose(1001, "Authentication Required")).toContain("yêu cầu mật khẩu");
    expect(describeObsClose(1001, "not authenticated")).toContain("chưa xác thực");
  });

  it("returns null for unrelated close codes", () => {
    expect(describeObsClose(1001, "normal closure")).toBeNull();
    expect(describeObsClose(4008, "")).toBeNull();
  });
});

describe("OBS SHA-256 auth", () => {
  it("sha256B64 matches Node's SHA-256 base64", async () => {
    const input = "password123";
    const expected = createHash("sha256").update(input).digest("base64");
    expect(await sha256B64(input)).toBe(expected);
  });

  it("obsAuthSecret follows secret + challenge algorithm", async () => {
    const password = "secret-pin";
    const salt = "abc123";
    const challenge = "challenge-token";
    const secret = createHash("sha256")
      .update(password + salt)
      .digest("base64");
    const expected = createHash("sha256")
      .update(secret + challenge)
      .digest("base64");
    expect(await obsAuthSecret(password, salt, challenge)).toBe(expected);
  });

  it("changes whenever password, salt or challenge change", async () => {
    const base = await obsAuthSecret("p", "s", "c");
    expect(await obsAuthSecret("q", "s", "c")).not.toBe(base);
    expect(await obsAuthSecret("p", "t", "c")).not.toBe(base);
    expect(await obsAuthSecret("p", "s", "d")).not.toBe(base);
  });
});