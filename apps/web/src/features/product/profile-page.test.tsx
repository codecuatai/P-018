import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockListSavedAddresses = jest.fn();
const mockDeleteSavedAddress = jest.fn();
const mockUpdateProfile = jest.fn();

const address = {
  id: "address-1",
  label: "Nhà",
  address_text: "12 Đường Mẫu, Hà Nội",
  city: "Hà Nội",
  latitude: 21.0285,
  longitude: 105.8542,
  is_default: true,
  provider: "test",
  source: "geocoded",
};

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("?section=addresses"),
}));

jest.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      email: "an@example.test",
      full_name: "Người dùng thử",
      language: "vi",
      phone: "",
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
    },
    updateProfile: mockUpdateProfile,
  }),
}));

jest.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    status = 500;
  },
  autocompleteAddress: jest.fn(),
  createSavedAddress: jest.fn(),
  deleteSavedAddress: (...args: unknown[]) => mockDeleteSavedAddress(...args),
  errorText: (reason: unknown) => reason instanceof Error ? reason.message : String(reason),
  listSavedAddresses: (...args: unknown[]) => mockListSavedAddresses(...args),
  resolveAddress: jest.fn(),
  reverseGeocodeAddress: jest.fn(),
  setSavedAddressDefault: jest.fn(),
  updateProfile: mockUpdateProfile,
  updateSavedAddress: jest.fn(),
}));

jest.mock("./xone-map", () => ({
  XOneMap: () => <div data-testid="xone-map" />,
}));

jest.mock("./patient-page", () => ({
  PatientPage: () => <div />,
}));

jest.mock("./settings-page", () => ({
  SettingsPage: () => <div />,
}));

import { ProfilePage } from "./profile-page";

describe("ProfilePage saved addresses", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListSavedAddresses.mockResolvedValue({ items: [address] });
    mockDeleteSavedAddress.mockResolvedValue(undefined);
    mockUpdateProfile.mockResolvedValue(undefined);
  });

  it("loads addresses once when the address section is mounted", async () => {
    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Địa chỉ đã lưu" })).toBeInTheDocument());

    expect(mockListSavedAddresses).toHaveBeenCalledTimes(1);
  });

  it("keeps the profile address picker in sync after a child mutation", async () => {
    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Xóa Nhà" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Chọn hoặc nhập địa chỉ giao hàng..." }));
    expect(screen.getByRole("option", { name: /Nhà/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xóa Nhà" }));

    await waitFor(() => expect(screen.queryByRole("option", { name: /Nhà/ })).not.toBeInTheDocument());
    expect(mockListSavedAddresses).toHaveBeenCalledTimes(1);
  });
});
