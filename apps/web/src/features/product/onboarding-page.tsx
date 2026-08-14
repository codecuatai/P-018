"use client";

import { ArrowRight, Check, Home, LoaderCircle, LocateFixed, MapPinned, Search, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSavedAddress, errorText, resolveAddress } from "@/lib/api-client";
import { useAuth } from "@/providers/auth-provider";
import type { GeocodeCandidate } from "@/types";

type Coordinates = { latitude: number; longitude: number };

function normalizeCoordinates(value: Coordinates): Coordinates {
  return { latitude: Number(value.latitude.toFixed(6)), longitude: Number(value.longitude.toFixed(6)) };
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

  useEffect(() => {
    if (!fullName && user?.full_name) setFullName(user.full_name);
    if (!phone && user?.phone) setPhone(user.phone);
  }, [fullName, phone, user?.full_name, user?.phone]);

  function next(): void {
    setError("");
    if (step === 1 && fullName.trim().length < 2) {
      setError("Hãy nhập tên để X-One biết cách gọi bạn.");
      return;
    }
    if (step === 2 && !/^\+?[0-9\s().-]{8,}$/.test(phone.trim())) {
      setError("Số điện thoại chưa đúng định dạng.");
      return;
    }
    if (step < STEPS.length - 1) setStep((current) => current + 1);
    else void finish();
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
    setAddressText(candidate.address_text);
    if (candidate.latitude !== null && candidate.longitude !== null) setCoordinates(normalizeCoordinates({ latitude: candidate.latitude, longitude: candidate.longitude }));
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
      await updateProfile({ full_name: fullName.trim(), phone: phone.trim(), onboarding_completed: true });
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

  return <main className="onboarding-page" id="main-content">
    <section className="onboarding-card" aria-labelledby="onboarding-title">
      <div className="onboarding-progress" aria-label={`Bước ${step + 1} trên ${STEPS.length}`}>
        {STEPS.map((item, index) => <span className={index <= step ? "is-active" : ""} key={item}><span className="onboarding-dot">{index < step ? <Check size={12} /> : index + 1}</span><span>{item}</span></span>)}
      </div>
      <div className="onboarding-content">
        <span className="eyebrow">THIẾT LẬP LẦN ĐẦU · 0{step + 1}</span>
        {step === 0 && <StepView icon={<ShieldCheck size={24} />} title="X-One sẽ đi cùng nhịp sống của bạn." body="Thiết lập nhanh một lần để các dịch vụ, cuộc trò chuyện và biên nhận luôn thuộc đúng về bạn." />}
        {step === 1 && <StepView icon={<Home size={24} />} title="Mình nên gọi bạn là gì?" body="Tên hiển thị giúp trợ lý và các bước xác nhận nói chuyện rõ ràng hơn."><div className="form-field"><Label htmlFor="onboarding-name">Họ và tên</Label><Input autoComplete="name" id="onboarding-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoFocus /></div></StepView>}
        {step === 2 && <StepView icon={<LocateFixed size={24} />} title="Thêm số điện thoại để nhận hỗ trợ." body="Số điện thoại dùng cho liên hệ dịch vụ và khôi phục tài khoản; bạn có thể cập nhật sau."><div className="form-field"><Label htmlFor="onboarding-phone">Số điện thoại</Label><Input autoComplete="tel" id="onboarding-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoFocus /></div></StepView>}
        {step === 3 && <StepView icon={<LocateFixed size={24} />} title="Cho phép dùng vị trí hiện tại?" body="Vị trí chỉ được dùng để gợi ý địa chỉ và lộ trình trong phiên này. Bạn có thể từ chối và nhập địa chỉ sau."><div className="onboarding-choice"><Button type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? <LoaderCircle className="spinner" size={17} /> : <LocateFixed size={17} />} {locating ? "Đang lấy vị trí…" : "Dùng vị trí hiện tại"}</Button><Button className="button-secondary" type="button" onClick={() => { setLocationNote("Bạn đã bỏ qua vị trí trình duyệt."); setStep(4); }}>Tiếp tục không dùng vị trí <ArrowRight size={17} /></Button></div></StepView>}
        {step === 4 && <StepView icon={<MapPinned size={24} />} title="Lưu một địa chỉ quen thuộc?" body="Địa chỉ Nhà là tùy chọn, nhưng giúp các bước đặt xe và giao hàng nhanh hơn."><div className="onboarding-address-form"><div className="segmented-control" aria-label="Nhãn địa chỉ">{["Nhà", "Công ty"].map((item) => <button className={label === item ? "is-active" : ""} key={item} type="button" onClick={() => setLabel(item)}>{item}</button>)}</div><div className="form-field"><Label htmlFor="onboarding-address">Địa chỉ</Label><div className="input-with-action"><Input id="onboarding-address" value={addressText} onChange={(event) => setAddressText(event.target.value)} placeholder="Ví dụ: 12 Nguyễn Huệ, Quận 1" /><Button aria-label="Tìm địa chỉ" className="button-icon" type="button" onClick={() => void searchAddress()} disabled={locating || !addressText.trim()}>{locating ? <LoaderCircle className="spinner" size={17} /> : <Search size={17} />}</Button></div></div>{candidates.length > 0 && <div className="candidate-list" aria-label="Kết quả địa chỉ">{candidates.map((candidate) => <button className="candidate-option" key={`${candidate.address_text}-${candidate.latitude ?? "na"}`} type="button" onClick={() => chooseCandidate(candidate)}><MapPinned size={16} /><span>{candidate.address_text}</span></button>)}</div>}{locationNote && <p className="field-hint">{locationNote}</p>}<p className="field-hint">Bạn có thể bỏ qua và thêm địa chỉ trong mục Địa chỉ sau.</p></div></StepView>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {locationNote && step !== 4 && <p className="field-hint">{locationNote}</p>}
        <div className="onboarding-actions">{step === 4 ? <><Button className="button-secondary" type="button" onClick={skipAddress} disabled={pending}>Bỏ qua địa chỉ</Button><Button type="button" onClick={() => void finish()} disabled={pending}>{pending ? <LoaderCircle className="spinner" size={17} /> : <Check size={17} />} {pending ? "Đang lưu…" : "Hoàn tất thiết lập"}</Button></> : <Button type="button" onClick={next} disabled={pending}>{step === 0 ? "Bắt đầu" : "Tiếp tục"} <ArrowRight size={17} /></Button>}</div>
      </div>
    </section>
  </main>;
}

function StepView({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return <div className="onboarding-step"><div className="onboarding-icon" aria-hidden="true">{icon}</div><h1 id="onboarding-title">{title}</h1><p className="onboarding-body">{body}</p>{children}</div>;
}
