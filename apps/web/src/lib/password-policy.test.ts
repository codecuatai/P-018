import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
} from "./password-policy";

describe("canonical password policy", () => {
  it("exports canonical bounds and hint", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(PASSWORD_POLICY_HINT).toBe("Mật khẩu dài từ 8 đến 128 ký tự, bao gồm chữ, số và ký tự đặc biệt.");
  });

  it("rejects passwords shorter than 8 characters (boundary 7)", () => {
    const result = validatePasswordPolicy("Pass1!a");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Mật khẩu phải có tối thiểu 8 ký tự.");
  });

  it("accepts valid passwords at the lower boundary (8 characters)", () => {
    const result = validatePasswordPolicy("Pass12!@");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts valid passwords at the upper boundary (128 characters)", () => {
    const valid128 = "A1!" + "a".repeat(125);
    expect(valid128.length).toBe(128);
    const result = validatePasswordPolicy(valid128);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects passwords longer than 128 characters (boundary 129)", () => {
    const invalid129 = "A1!" + "a".repeat(126);
    expect(invalid129.length).toBe(129);
    const result = validatePasswordPolicy(invalid129);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Mật khẩu không được vượt quá 128 ký tự.");
  });

  it("rejects passwords missing letters", () => {
    const result = validatePasswordPolicy("12345678!@#");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt.");
  });

  it("rejects passwords missing numbers", () => {
    const result = validatePasswordPolicy("Password!@#");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt.");
  });

  it("rejects passwords missing special characters", () => {
    const result = validatePasswordPolicy("Password123");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt.");
  });
});
