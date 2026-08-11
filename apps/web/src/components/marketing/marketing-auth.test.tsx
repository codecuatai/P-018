import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ status: "unauthenticated", login: mockLogin, register: mockRegister }),
}));

import { MarketingAuthProvider } from "@/components/marketing/marketing-auth";
import { MarketingHeader } from "@/components/marketing/marketing-header";

function MarketingHarness() {
  return <MarketingAuthProvider><MarketingHeader /></MarketingAuthProvider>;
}

describe("marketing authentication dialog", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockRegister.mockReset();
    mockReplace.mockReset();
  });

  it("opens Login from the marketing header", () => {
    render(<MarketingHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("opens Register and switches Login/Register inside the same dialog", () => {
    render(<MarketingHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu với X-One" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("heading", { name: "Bắt đầu với X-One" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Đăng nhập" }));

    expect(within(dialog).getByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Mật khẩu")).toBeInTheDocument();
  });

  it("closes and routes to /app after a successful modal login", async () => {
    mockLogin.mockResolvedValueOnce({ sub: "usr-1", email: "an@example.test", role: "customer" });
    render(<MarketingHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "an@example.test" } });
    fireEvent.change(within(dialog).getByLabelText("Mật khẩu"), { target: { value: "a reliable local passphrase" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Đăng nhập" }).closest("form")!);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/app"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
