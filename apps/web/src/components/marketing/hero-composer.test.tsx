import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockOpenAuth = jest.fn();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ status: "unauthenticated" }),
}));

jest.mock("@/components/marketing/marketing-auth", () => ({
  useMarketingAuth: () => ({ openAuth: mockOpenAuth }),
}));

import { HERO_PROMPTS, HeroComposer } from "@/components/marketing/hero-composer";

describe("HeroComposer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockOpenAuth.mockReset();
    mockReplace.mockReset();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion") ? false : false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("crossfades to the next example prompt without typing it", async () => {
    jest.useRealTimers();
    render(<HeroComposer />);
    expect(screen.getByText(HERO_PROMPTS[0])).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(HERO_PROMPTS[1])).toBeInTheDocument(), { timeout: 4500, interval: 50 });
  });

  it("keeps one static prompt and stops rotation for reduced motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
    });

    render(<HeroComposer />);
    act(() => { jest.advanceTimersByTime(9000); });

    expect(screen.getByText(HERO_PROMPTS[0])).toBeInTheDocument();
    expect(screen.queryByText(HERO_PROMPTS[1])).not.toBeInTheDocument();
  });

  it("hides the visual prompt after the user focuses the composer", () => {
    render(<HeroComposer />);
    fireEvent.focus(screen.getByLabelText("Nhập yêu cầu của bạn"));
    act(() => { jest.advanceTimersByTime(400); });

    expect(screen.queryByText(HERO_PROMPTS[0])).not.toBeInTheDocument();
  });
});
