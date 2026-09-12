"use client";

import { ArrowLeft, ArrowRight, Check, Home, LoaderCircle, LocateFixed, MapPinned, Search, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { autocompleteAddress, createSavedAddress, errorText, resolveAddress } from "@/lib/api-client";
import { useAuth } from "@/providers/auth-provider";
import type { GeocodeCandidate } from "@/types";
import { XOneMap } from "./xone-map";

type Coordinates = { latitude: number; longitude: number };

function normalizeCoordinates(value: Coordinates): Coordinates {
  return { latitude: Number(value.latitude.toFixed(6)), longitude: Number(value.longitude.toFixed(6)) };
}

function normalizePhone(value: string): string {
  return value.trim().replace(/[\s().-]/g, "");
}

function isValidVietnamesePhone(value: string): boolean {
  return /^(?:0|\+84)(?:3|5|7|8|9)\d{8}$/.test(value);
}

const STEPS = ["Chào mừng", "Danh tính", "Liên hệ", "Vị trí", "Địa chỉ"];

export function OnboardingPage() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [label, setLabel] = useState("Nhà");
  const [addressText, setAddressText] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [provider, setProvider] = useState<string>();
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [locationNote, setLocationNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  const initializedUserKeyRef = useRef<string | null>(null);
  const autocompleteSequence = useRef(0);
  const skipAutocompleteQuery = useRef("");

  useEffect(() => {
    if (!user) return;
    const userKey = user.sub || user.id || user.email;
    if (initializedUserKeyRef.current === userKey) return;
    initializedUserKeyRef.current = userKey;
    if (user.full_name) setFullName(user.full_name);
    if (user.phone) setPhone(user.phone);
  }, [user]);

  useEffect(() => {
    const query = addressText.trim();
    const sequence = ++autocompleteSequence.current;
    if (query.length < 3 || query === skipAutocompleteQuery.current) {
      skipAutocompleteQuery.current = "";
      if (query.length < 3) setCandidates([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void autocompleteAddress(query)
        .then((result) => {
          if (sequence !== autocompleteSequence.current) return;
          setProvider(result.provider);
          setCandidates(result.suggestions.slice(0, 5));
        })
        .catch(() => {
          if (sequence === autocompleteSequence.current) setCandidates([]);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [addressText]);

  const normalizedPhone = normalizePhone(phone);
  const isPhoneValid = isValidVietnamesePhone(normalizedPhone);
  const phoneHasValue = phone.trim().length > 0;
  const phoneValidationError =
    phoneHasValue && !isPhoneValid
      ? "Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam (10 số, bắt đầu bằng 03, 05, 07, 08, 09 hoặc +84)."
      : "";

  function next(): void {
    setError("");
    if (step === 1 && fullName.trim().length < 2) {
      setError("Hãy nhập tên để X-One biết cách gọi bạn.");
      return;
    }
    if (step === 2) {
      const normalized = normalizePhone(phone);
      if (!normalized || !isValidVietnamesePhone(normalized)) {
        setError("Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam (10 số, bắt đầu bằng 03, 05, 07, 08, 09 hoặc +84).");
        return;
      }
    }
    if (step < STEPS.length - 1) setStep((current) => current + 1);
    else void finish();
  }

  function prev(): void {
    setError("");
    if (step > 0) setStep((current) => current - 1);
  }

  function useCurrentLocation(): void {
    setError("");
    if (!navigator.geolocation) {
      setLocationNote("Trình duyệt này chưa hỗ trợ vị trí hiện tại.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates(normalizeCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }));
        setProvider("browser-geolocation");
        setLocationNote("Đã nhận vị trí. Bạn có thể dùng nó để gợi ý địa chỉ Nhà.");
        setStep(4);
        setLocating(false);
      },
      () => {
        setLocationNote("Không thể nhận vị trí. Bạn vẫn có thể tiếp tục bằng cách nhập địa chỉ thủ công.");
        setLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    );
  }

  async function searchAddress(): Promise<void> {
    if (!addressText.trim() || locating) return;
    setError("");
    setLocating(true);
    try {
      const result = await resolveAddress(addressText.trim());
      setCandidates(result.candidates);
      setProvider(result.provider);
      setLocationNote(result.status === "RESOLVED" ? "Chọn kết quả đúng để lưu snapshot tọa độ." : "Chưa có tọa độ chắc chắn; bạn vẫn có thể lưu thủ công.");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLocating(false);
    }
  }

  function chooseCandidate(candidate: GeocodeCandidate): void {
    skipAutocompleteQuery.current = candidate.address_text;
    setAddressText(candidate.address_text);
    if (candidate.latitude !== null && candidate.longitude !== null) {
      setCoordinates(normalizeCoordinates({ latitude: candidate.latitude, longitude: candidate.longitude }));
    }
    setCandidates([]);
    setLocationNote("Đã chọn địa chỉ. Tọa độ này sẽ được lưu cùng snapshot địa chỉ của bạn.");
  }

  async function finish(skipAddress = false): Promise<void> {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      if (!skipAddress && !addressSaved && (addressText.trim() || coordinates)) {
        await createSavedAddress({
          label: label.trim() || "Nhà",
          address_text: addressText.trim() || "Vị trí hiện tại",
          ...(coordinates ?? {}),
          ...(provider ? { provider } : {}),
          source: coordinates ? "geocoded" : "manual",
          is_default: true,
        });
        setAddressSaved(true);
      }
      await updateProfile({ full_name: fullName.trim(), phone: normalizePhone(phone), onboarding_completed: true });
      router.replace("/app");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }

  function skipAddress(): void {
    setAddressText("");
    setCoordinates(undefined);
    setCandidates([]);
    void finish(true);
  }

  return (
    <main className="onboarding-page" id="main-content">
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <div
          className="onboarding-progress-track"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label={`Tiến trình thiết lập: ${step + 1} trên ${STEPS.length}`}
        >
          <div className="onboarding-progress-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="onboarding-progress" aria-label={`Bước ${step + 1} trên ${STEPS.length}`}>
          {STEPS.map((item, index) => (
            <span className={index <= step ? "is-active" : ""} key={item}>
              <span className="onboarding-dot">{index < step ? <Check size={12} /> : index + 1}</span>
              <span>{item}</span>
            </span>
          ))}
        </div>
        <div className="onboarding-content">
          <span className="eyebrow">Thiết lập tài khoản X-One</span>
          {step === 0 && (
            <StepView
              icon={<ShieldCheck size={24} />}
              title="X-One sẽ đi cùng nhịp sống của bạn."
              body="Thiết lập nhanh một lần để các dịch vụ, cuộc trò chuyện và biên nhận luôn thuộc đúng về bạn."
            />
          )}
          {step === 1 && (
            <StepView
              icon={<Home size={24} />}
              title="Mình nên gọi bạn là gì?"
              body="Tên hiển thị giúp trợ lý và các bước xác nhận nói chuyện rõ ràng hơn."
            >
              <div className="form-field">
                <Label htmlFor="onboarding-name">Họ và tên</Label>
                <Input
                  autoComplete="name"
                  id="onboarding-name"
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value);
                    setError("");
                  }}
                  autoFocus
                />
              </div>
            </StepView>
          )}
          {step === 2 && (
            <StepView
              icon={<LocateFixed size={24} />}
              title="Thêm số điện thoại để nhận hỗ trợ."
              body="Số điện thoại dùng cho liên hệ dịch vụ và khôi phục tài khoản; bạn có thể cập nhật sau."
            >
              <div className="form-field">
                <Label htmlFor="onboarding-phone">Số điện thoại</Label>
                <Input
                  autoComplete="tel"
                  id="onboarding-phone"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setError("");
                  }}
                  placeholder="Ví dụ: 0901234567 hoặc +84901234567"
                  aria-invalid={Boolean(phoneValidationError)}
                  autoFocus
                />
                {phoneValidationError && (
                  <p className="form-error" role="alert" style={{ marginTop: "6px" }}>
                    {phoneValidationError}
                  </p>
                )}
              </div>
            </StepView>
          )}
          {step === 3 && (
            <StepView
              icon={<LocateFixed size={24} />}
              title="Cho phép dùng vị trí hiện tại?"
              body="Vị trí chỉ được dùng để gợi ý địa chỉ và lộ trình trong phiên này. Bạn có thể từ chối và nhập địa chỉ sau."
            >
              <div className="onboarding-choice">
                <Button type="button" onClick={useCurrentLocation} disabled={locating}>
                  {locating ? <LoaderCircle className="spinner" size={17} /> : <LocateFixed size={17} />}{" "}
                  {locating ? "Đang lấy vị trí…" : "Dùng vị trí hiện tại"}
                </Button>
                <Button
                  className="button-secondary"
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setLocationNote("Bạn đã bỏ qua vị trí trình duyệt.");
                    setStep(4);
                  }}
                >
                  Tiếp tục không dùng vị trí <ArrowRight size={17} />
                </Button>
              </div>
            </StepView>
          )}
          {step === 4 && (
            <StepView
              icon={<MapPinned size={24} />}
              title="Lưu một địa chỉ quen thuộc?"
              body="Địa chỉ Nhà là tùy chọn, nhưng giúp các bước đặt xe và giao hàng nhanh hơn."
            >
              <div className="onboarding-address-form">
                <div className="segmented-control" aria-label="Nhãn địa chỉ">
                  {["Nhà", "Công ty"].map((item) => (
                    <button
                      className={label === item ? "is-active" : ""}
                      key={item}
                      type="button"
                      onClick={() => setLabel(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="form-field">
                  <Label htmlFor="onboarding-address">Địa chỉ</Label>
                  <div className="input-with-action">
                    <Input
                      id="onboarding-address"
                      value={addressText}
                      onChange={(event) => {
                        setAddressText(event.target.value);
                        setError("");
                      }}
                      placeholder="Ví dụ: 12 Nguyễn Huệ, Quận 1 hoặc 51 Tam Khương"
                      autoComplete="street-address"
                      aria-autocomplete="list"
                      aria-controls="onboarding-address-suggestions"
                    />
                    <Button
                      aria-label="Tìm địa chỉ"
                      className="button-icon"
                      type="button"
                      onClick={() => void searchAddress()}
                      disabled={locating || !addressText.trim()}
                    >
                      {locating ? <LoaderCircle className="spinner" size={17} /> : <Search size={17} />}
                    </Button>
                  </div>
                </div>
                {candidates.length > 0 && (
                  <div id="onboarding-address-suggestions" className="candidate-list" role="listbox" aria-label="Kết quả địa chỉ">
                    {candidates.map((candidate, index) => (
                      <button
                        className="candidate-option"
                        role="option"
                        key={`${candidate.address_text}-${candidate.latitude ?? index}`}
                        type="button"
                        onClick={() => chooseCandidate(candidate)}
                      >
                        <MapPinned size={16} />
                        <div>
                          <strong>{candidate.address_text}</strong>
                          {candidate.latitude !== null && candidate.longitude !== null && (
                            <small style={{ display: "block", color: "var(--color-muted)", fontSize: "var(--text-micro)" }}>
                              {candidate.latitude.toFixed(5)}, {candidate.longitude.toFixed(5)}
                            </small>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {coordinates && (
                  <div style={{ marginTop: "12px" }}>
                    <XOneMap destination={coordinates} label="Vị trí địa chỉ đã chọn" />
                  </div>
                )}
                {locationNote && <p className="field-hint">{locationNote}</p>}
                <p className="field-hint">Bạn có thể bỏ qua và thêm địa chỉ trong mục Địa chỉ sau.</p>
              </div>
            </StepView>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {locationNote && step !== 4 && <p className="field-hint">{locationNote}</p>}
          <div className="onboarding-actions">
            {step > 0 && (
              <Button
                className="button-secondary"
                variant="secondary"
                type="button"
                onClick={prev}
                disabled={pending || locating}
              >
                <ArrowLeft size={17} /> Quay lại
              </Button>
            )}
            {step === 4 ? (
              <>
                <Button
                  className="button-secondary"
                  variant="secondary"
                  type="button"
                  onClick={skipAddress}
                  disabled={pending || locating}
                >
                  Bỏ qua địa chỉ
                </Button>
                <Button type="button" onClick={() => void finish()} disabled={pending || locating}>
                  {pending ? <LoaderCircle className="spinner" size={17} /> : <Check size={17} />}{" "}
                  {pending ? "Đang lưu…" : "Hoàn tất thiết lập"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={next}
                disabled={
                  pending ||
                  locating ||
                  (step === 1 && fullName.trim().length < 2) ||
                  (step === 2 && (!phoneHasValue || !isPhoneValid))
                }
              >
                {step === 0 ? "Bắt đầu" : "Tiếp tục"} <ArrowRight size={17} />
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function StepView({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-icon" aria-hidden="true">
        {icon}
      </div>
      <h1 id="onboarding-title">{title}</h1>
      <p className="onboarding-body">{body}</p>
      {children}
    </div>
  );
}
