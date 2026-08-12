import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockSuccess = jest.fn();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ login: mockLogin, register: mockRegister }),
}));

import { LoginForm, RegisterForm } from "@/features/auth/auth-pages";

describe("registration screen", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockRegister.mockReset();
    mockSuccess.mockReset();
  });

  it("keeps the landing login form wired to the auth provider", async () => {
    mockLogin.mockResolvedValueOnce({ sub: "usr-1", email: "an@example.test", role: "customer" });
    render(<LoginForm onSuccess={mockSuccess} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "an@example.test" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "a reliable local passphrase" } });
    fireEvent.submit(screen.getByRole("button", { name: "Đăng nhập" }).closest("form")!);

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("an@example.test", "a reliable local passphrase"));
    await waitFor(() => expect(mockSuccess).toHaveBeenCalled());
  });

  it("blocks a short password before it reaches the Gateway", () => {
    render(<RegisterForm onSuccess={mockSuccess} />);
    fireEvent.change(screen.getByLabelText("Họ và tên"), { target: { value: "Nguyễn An" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "an@example.test" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "too-short" } });
    fireEvent.submit(screen.getByRole("button", { name: "Tạo tài khoản" }).closest("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent("15 ký tự");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("hands a valid registration to the auth provider and routes only after success", async () => {
    mockRegister.mockResolvedValueOnce({ sub: "usr-1", email: "an@example.test", role: "customer" });
    render(<RegisterForm onSuccess={mockSuccess} />);
    fireEvent.change(screen.getByLabelText("Họ và tên"), { target: { value: "Nguyễn An" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "an@example.test" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "a reliable local passphrase" } });
    fireEvent.submit(screen.getByRole("button", { name: "Tạo tài khoản" }).closest("form")!);

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith("Nguyễn An", "an@example.test", "a reliable local passphrase"));
    await waitFor(() => expect(mockSuccess).toHaveBeenCalled());
  });
});
