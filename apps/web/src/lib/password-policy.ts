export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_POLICY_HINT = "Mật khẩu dài từ 8 đến 128 ký tự, bao gồm chữ, số và ký tự đặc biệt.";

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: "Mật khẩu phải có tối thiểu 8 ký tự." };
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return { valid: false, error: "Mật khẩu không được vượt quá 128 ký tự." };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
    return { valid: false, error: "Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt." };
  }
  return { valid: true };
}
