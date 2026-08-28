import { render, screen, waitFor } from "@testing-library/react";

const mockRefreshAccessToken = jest.fn();
const mockGetCurrentUser = jest.fn();
const mockGetAccessToken = jest.fn(() => null);
const mockPathname = jest.fn(() => "/app");

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

jest.mock("@/lib/api-client", () => ({
  clearAuthSession: jest.fn(),
  configureApiClient: jest.fn(),
  getAccessToken: mockGetAccessToken,
  getCurrentUser: mockGetCurrentUser,
  isRetryableError: (error: unknown) => Boolean(error && typeof error === "object" && "retryable" in error && (error as { retryable?: unknown }).retryable === true),
  login: jest.fn(),
  logout: jest.fn(),
  refreshAccessToken: mockRefreshAccessToken,
  register: jest.fn(),
}));

import { AuthProvider, useAuth } from "@/providers/auth-provider";

function StatusProbe() {
  const { status, user } = useAuth();
  return <output>{`${status}:${user?.email ?? "none"}`}</output>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue("/app");
    mockGetAccessToken.mockReturnValue(null);
  });

  it("restores the authenticated user from the opaque refresh cookie", async () => {
    mockRefreshAccessToken.mockResolvedValueOnce({ outcome: "authenticated", token: "access-token" });
    mockGetCurrentUser.mockResolvedValueOnce({ sub: "usr-1", email: "an@example.test", role: "customer" });

    render(<AuthProvider><StatusProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("authenticated:an@example.test")).toBeInTheDocument());
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("does not expose a protected route as authenticated when refresh fails", async () => {
    mockRefreshAccessToken.mockResolvedValueOnce({ outcome: "invalid", token: null });

    render(<AuthProvider><StatusProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("unauthenticated:none")).toBeInTheDocument());
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });

  it("does not refresh while the public landing page is open", async () => {
    mockPathname.mockReturnValue("/");

    render(<AuthProvider><StatusProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("unauthenticated:none")).toBeInTheDocument());
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it("retries a transient refresh before exposing the recoverable state", async () => {
    mockRefreshAccessToken
      .mockResolvedValueOnce({ outcome: "transient", token: null })
      .mockResolvedValueOnce({ outcome: "authenticated", token: "access-token" });
    mockGetCurrentUser.mockResolvedValueOnce({ sub: "usr-1", email: "an@example.test", role: "customer" });

    render(<AuthProvider><StatusProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("authenticated:an@example.test")).toBeInTheDocument());
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it("keeps the recoverable state after bounded transient restore retries", async () => {
    mockRefreshAccessToken.mockResolvedValue({ outcome: "transient", token: null });

    render(<AuthProvider><StatusProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("recoverable:none")).toBeInTheDocument(), { timeout: 2500 });
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(4);
  });
});
