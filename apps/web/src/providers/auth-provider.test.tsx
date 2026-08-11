import { render, screen, waitFor } from "@testing-library/react";

const mockRefreshAccessToken = jest.fn();
const mockGetCurrentUser = jest.fn();

jest.mock("@/lib/api-client", () => ({
  clearAuthSession: jest.fn(),
  configureApiClient: jest.fn(),
  getCurrentUser: mockGetCurrentUser,
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
  it("restores the authenticated user from the opaque refresh cookie", async () => {
    mockRefreshAccessToken.mockResolvedValueOnce("access-token");
    mockGetCurrentUser.mockResolvedValueOnce({ sub: "usr-1", email: "an@example.test", role: "customer" });

    render(<AuthProvider><StatusProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("authenticated:an@example.test")).toBeInTheDocument());
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("does not expose a protected route as authenticated when refresh fails", async () => {
    mockRefreshAccessToken.mockResolvedValueOnce(null);

    render(<AuthProvider><StatusProbe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText("unauthenticated:none")).toBeInTheDocument());
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });
});
