import { fireEvent, render, screen } from "@testing-library/react";

const mockUpdateProfile = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

const mockUser = {
  id: "user-123",
  sub: "user-123",
  email: "test@example.com",
  role: "user",
  full_name: "Tai Tran",
  phone: "0901234567",
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    user: mockUser,
    updateProfile: mockUpdateProfile,
  }),
}));

jest.mock("@/lib/api-client", () => ({
  createSavedAddress: jest.fn(),
  errorText: (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)),
  resolveAddress: jest.fn(),
}));

import { OnboardingPage } from "./onboarding-page";

describe("OnboardingPage input behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows the user to completely clear full name and enter a new name without resetting", () => {
    render(<OnboardingPage />);

    // Step 0: Welcome -> click "Bắt đầu"
    const startButton = screen.getByRole("button", { name: "Bắt đầu" });
    fireEvent.click(startButton);

    // Step 1: Danh tính
    const nameInput = screen.getByLabelText("Họ và tên") as HTMLInputElement;
    expect(nameInput.value).toBe("Tai Tran");

    // Clear the input completely
    fireEvent.change(nameInput, { target: { value: "" } });
    expect(nameInput.value).toBe("");

    // Type a new name
    fireEvent.change(nameInput, { target: { value: "Nguyễn Văn Mới" } });
    expect(nameInput.value).toBe("Nguyễn Văn Mới");

    // Click "Tiếp tục" to advance to Step 2
    const nextButton = screen.getByRole("button", { name: "Tiếp tục" });
    fireEvent.click(nextButton);

    // Step 2: Liên hệ
    const phoneInput = screen.getByLabelText("Số điện thoại") as HTMLInputElement;
    expect(phoneInput.value).toBe("0901234567");

    // Clear phone input completely
    fireEvent.change(phoneInput, { target: { value: "" } });
    expect(phoneInput.value).toBe("");

    // Type new phone number
    fireEvent.change(phoneInput, { target: { value: "0987654321" } });
    expect(phoneInput.value).toBe("0987654321");
  });
});
