import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const mockChangePassword = jest.fn();
const mockGetSessions = jest.fn();
const mockLogout = jest.fn();

jest.mock("@/lib/api-client", () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
  getSessions: () => mockGetSessions(),
  errorText: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  revokeSession: jest.fn(),
  logoutAll: jest.fn(),
}));

jest.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { email: "an@example.test", role: "customer" },
    logout: mockLogout,
  }),
}));

import { SettingsPage } from "./settings-page";

describe("SettingsPage password policy", () => {
  beforeEach(() => {
    mockChangePassword.mockReset();
    mockGetSessions.mockReset().mockResolvedValue({ items: [] });
    mockLogout.mockReset();
  });

  it("displays the canonical 8-128 character hint and not 15 characters", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeInTheDocument());
    expect(screen.getByText("Mật khẩu dài từ 8 đến 128 ký tự, bao gồm chữ, số và ký tự đặc biệt.")).toBeInTheDocument();
    expect(screen.queryByText(/15 ký tự/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu mới")).toHaveAttribute("minlength", String(PASSWORD_MIN_LENGTH));
    expect(screen.getByLabelText("Mật khẩu mới")).toHaveAttribute("maxlength", String(PASSWORD_MAX_LENGTH));
  });

  it("rejects passwords shorter than 8 characters before calling API", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), { target: { value: "CurrentPass123!" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "Short1!" } });
    fireEvent.submit(screen.getByRole("button", { name: "Đổi mật khẩu" }).closest("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent("Mật khẩu phải có tối thiểu 8 ký tự.");
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("rejects passwords missing required character groups before calling API", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), { target: { value: "CurrentPass123!" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "simplepassword123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Đổi mật khẩu" }).closest("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent("Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt.");
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("submits valid passwords satisfying the canonical policy", async () => {
    mockChangePassword.mockResolvedValueOnce(undefined);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), { target: { value: "CurrentPass123!" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "ValidNewPass456#" } });
    fireEvent.submit(screen.getByRole("button", { name: "Đổi mật khẩu" }).closest("form")!);

    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith("CurrentPass123!", "ValidNewPass456#"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Mật khẩu đã được cập nhật. Bạn cần đăng nhập lại để tiếp tục."));
  });

  it("displays error specifically next to current password and keeps session when current password is wrong", async () => {
    mockChangePassword.mockRejectedValueOnce(new Error("Mật khẩu hiện tại không đúng."));
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeInTheDocument());

    const currentInput = screen.getByLabelText("Mật khẩu hiện tại");
    const newInput = screen.getByLabelText("Mật khẩu mới");

    fireEvent.change(currentInput, { target: { value: "WrongPass123!" } });
    fireEvent.change(newInput, { target: { value: "ValidNewPass456#" } });
    fireEvent.submit(screen.getByRole("button", { name: "Đổi mật khẩu" }).closest("form")!);

    await waitFor(() => expect(screen.getByText("Mật khẩu hiện tại không đúng.")).toBeInTheDocument());
    expect(mockLogout).not.toHaveBeenCalled();
    expect(currentInput).toHaveAttribute("aria-invalid", "true");
    expect(currentInput).toHaveValue("WrongPass123!");
    expect(newInput).toHaveValue("ValidNewPass456#");

    // Typing into current password field clears the error
    fireEvent.change(currentInput, { target: { value: "WrongPass123!corrected" } });
    expect(screen.queryByText("Mật khẩu hiện tại không đúng.")).not.toBeInTheDocument();
    expect(currentInput).not.toHaveAttribute("aria-invalid");
  });
});
