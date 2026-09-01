import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";

const mockUpdateProfile = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockAutocompleteAddress = jest.fn();
const mockResolveAddress = jest.fn();
const mockCreateSavedAddress = jest.fn();

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
  autocompleteAddress: (...args: unknown[]) => mockAutocompleteAddress(...args),
  createSavedAddress: (...args: unknown[]) => mockCreateSavedAddress(...args),
  errorText: (reason: unknown) => (reason instanceof Error ? reason.message : String(reason)),
  resolveAddress: (...args: unknown[]) => mockResolveAddress(...args),
}));

jest.mock("./xone-map", () => ({
  XOneMap: () => <div data-testid="xone-map" />,
}));

import { OnboardingPage } from "./onboarding-page";

describe("OnboardingPage input behavior & navigation", () => {
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

  it("validates phone number in real-time, displays error message, and disables the next button for invalid phone", () => {
    render(<OnboardingPage />);

    // Advance to Step 2
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

    const phoneInput = screen.getByLabelText("Số điện thoại") as HTMLInputElement;
    const nextButton = screen.getByRole("button", { name: "Tiếp tục" });

    // Invalid phone: too short / invalid format
    fireEvent.change(phoneInput, { target: { value: "12345" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Số điện thoại không hợp lệ");
    expect(nextButton).toBeDisabled();

    // Invalid phone: non-Vietnamese prefix
    fireEvent.change(phoneInput, { target: { value: "0123456789" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Số điện thoại không hợp lệ");
    expect(nextButton).toBeDisabled();

    // Valid Vietnamese phone (09...)
    fireEvent.change(phoneInput, { target: { value: "0912345678" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(nextButton).toBeEnabled();

    // Valid Vietnamese phone with international prefix (+84...)
    fireEvent.change(phoneInput, { target: { value: "+84912345678" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(nextButton).toBeEnabled();
  });

  it("allows navigating back to previous steps using the back button", () => {
    render(<OnboardingPage />);

    // Step 0: No back button on initial welcome step
    expect(screen.queryByRole("button", { name: /Quay lại/i })).toBeNull();

    // Advance to Step 1
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
    expect(screen.getByLabelText("Họ và tên")).toBeInTheDocument();

    // Back button should now be present
    const backBtn = screen.getByRole("button", { name: /Quay lại/i });
    expect(backBtn).toBeInTheDocument();

    // Advance to Step 2
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(screen.getByLabelText("Số điện thoại")).toBeInTheDocument();

    // Click back button to return to Step 1
    fireEvent.click(screen.getByRole("button", { name: /Quay lại/i }));
    expect(screen.getByLabelText("Họ và tên")).toBeInTheDocument();
  });

  it("autocompletes address suggestions when typing in step 5 and allows candidate selection with map preview", async () => {
    mockAutocompleteAddress.mockResolvedValueOnce({
      provider: "geoapify",
      query: "51 Tam Khương",
      suggestions: [
        {
          address_text: "51 Phố Tam Khương, Phường Khương Thượng, Quận Đống Đa, Hà Nội",
          latitude: 21.0062,
          longitude: 105.8286,
        },
      ],
    });

    render(<OnboardingPage />);

    // Advance through steps to Step 4 (Địa chỉ)
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" })); // Step 0 -> 1
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" })); // Step 1 -> 2
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" })); // Step 2 -> 3
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục không dùng vị trí" })); // Step 3 -> 4

    const addressInput = screen.getByLabelText("Địa chỉ") as HTMLInputElement;
    expect(addressInput).toBeInTheDocument();

    // Type address to trigger autocomplete
    act(() => {
      fireEvent.change(addressInput, { target: { value: "51 Tam Khương" } });
    });

    // Wait for debounced autocomplete
    await waitFor(() => {
      expect(mockAutocompleteAddress).toHaveBeenCalledWith("51 Tam Khương");
    });

    // Suggestion candidate should appear
    const candidateOption = await screen.findByRole("option", { name: /51 Phố Tam Khương/i });
    expect(candidateOption).toBeInTheDocument();

    // Select candidate
    fireEvent.click(candidateOption);

    // Address input should be filled and map preview rendered
    expect(addressInput.value).toBe("51 Phố Tam Khương, Phường Khương Thượng, Quận Đống Đa, Hà Nội");
    expect(screen.getByTestId("xone-map")).toBeInTheDocument();
  });
});
