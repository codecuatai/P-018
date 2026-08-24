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

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50" id="main-content">
      <section className="w-full max-w-lg bg-white rounded-3xl border border-slate-200/60 shadow-xl overflow-hidden flex flex-col" aria-labelledby="onboarding-title">
        <div className="flex bg-slate-50/50 border-b border-slate-100 p-4 overflow-x-auto no-scrollbar scroll-smooth" aria-label={`Bước ${step + 1} trên ${STEPS.length}`}>
          <div className="flex items-center gap-2 min-w-max mx-auto">
            {STEPS.map((item, index) => (
              <div className={`flex items-center gap-2 ${index !== 0 ? 'ml-2' : ''}`} key={item}>
                {index !== 0 && <div className={`w-4 h-[2px] rounded-full ${index <= step ? 'bg-blue-600' : 'bg-slate-200'}`} />}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${index < step ? 'bg-blue-100 text-blue-700' : index === step ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'bg-slate-100 text-slate-400'}`}>
                  {index < step ? <Check size={14} /> : <span>{index + 1}</span>}
                  <span className={index === step ? 'block' : 'hidden sm:block'}>{item}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 md:p-8 flex flex-col gap-6">
          <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">THIẾT LẬP LẦN ĐẦU · 0{step + 1}</span>
          
          {step === 0 && <StepView icon={<ShieldCheck size={28} />} title="X-One sẽ đi cùng nhịp sống của bạn." body="Thiết lập nhanh một lần để các dịch vụ, cuộc trò chuyện và biên nhận luôn thuộc đúng về bạn." />}
          {step === 1 && (
            <StepView icon={<Home size={28} />} title="Mình nên gọi bạn là gì?" body="Tên hiển thị giúp trợ lý và các bước xác nhận nói chuyện rõ ràng hơn.">
              <div className="flex flex-col gap-1.5 w-full mt-4">
                <Label htmlFor="onboarding-name" className="text-xs font-bold text-slate-700">Họ và tên</Label>
                <Input className="bg-slate-50 border-slate-200 rounded-xl h-12 text-base px-4 focus-visible:ring-blue-600/20 focus-visible:border-blue-600" autoComplete="name" id="onboarding-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoFocus placeholder="Ví dụ: Nguyễn Văn A" />
              </div>
            </StepView>
          )}
          {step === 2 && (
            <StepView icon={<LocateFixed size={28} />} title="Thêm số điện thoại để nhận hỗ trợ." body="Số điện thoại dùng cho liên hệ dịch vụ và khôi phục tài khoản; bạn có thể cập nhật sau.">
              <div className="flex flex-col gap-1.5 w-full mt-4">
                <Label htmlFor="onboarding-phone" className="text-xs font-bold text-slate-700">Số điện thoại</Label>
                <Input className="bg-slate-50 border-slate-200 rounded-xl h-12 text-base px-4 focus-visible:ring-blue-600/20 focus-visible:border-blue-600" autoComplete="tel" id="onboarding-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoFocus placeholder="Ví dụ: 0912345678" />
              </div>
            </StepView>
          )}
          {step === 3 && (
            <StepView icon={<LocateFixed size={28} />} title="Cho phép dùng vị trí hiện tại?" body="Vị trí chỉ được dùng để gợi ý địa chỉ và lộ trình trong phiên này. Bạn có thể từ chối và nhập địa chỉ sau.">
              <div className="flex flex-col sm:flex-row w-full gap-3 mt-4">
                <Button type="button" onClick={useCurrentLocation} disabled={locating} className="flex-1 h-12 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 shadow-sm shadow-blue-600/20">
                  {locating ? <LoaderCircle className="animate-spin mr-2" size={18} /> : <LocateFixed className="mr-2" size={18} />} 
                  {locating ? "Đang lấy vị trí…" : "Dùng vị trí hiện tại"}
                </Button>
                <Button variant="secondary" type="button" onClick={() => { setLocationNote("Bạn đã bỏ qua vị trí trình duyệt."); setStep(4); }} className="flex-1 h-12 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 active:scale-95">
                  Tiếp tục không dùng vị trí
                </Button>
              </div>
            </StepView>
          )}
          {step === 4 && (
            <StepView icon={<MapPinned size={28} />} title="Lưu một địa chỉ quen thuộc?" body="Địa chỉ Nhà là tùy chọn, nhưng giúp các bước đặt xe và giao hàng nhanh hơn.">
              <div className="flex flex-col w-full gap-4 mt-4">
                <div className="flex bg-slate-100 p-1 rounded-xl w-full" aria-label="Nhãn địa chỉ">
                  {["Nhà", "Công ty"].map((item) => (
                    <button className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${label === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} key={item} type="button" onClick={() => setLabel(item)}>
                      {item}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5 w-full">
                  <Label htmlFor="onboarding-address" className="text-xs font-bold text-slate-700">Địa chỉ</Label>
                  <div className="relative flex items-center">
                    <Input className="bg-slate-50 border-slate-200 rounded-xl h-12 text-base px-4 pr-12 w-full focus-visible:ring-blue-600/20 focus-visible:border-blue-600" id="onboarding-address" value={addressText} onChange={(event) => setAddressText(event.target.value)} placeholder="Ví dụ: 12 Nguyễn Huệ, Quận 1" />
                    <Button size="icon" variant="ghost" className="absolute right-1 w-10 h-10 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50" type="button" onClick={() => void searchAddress()} disabled={locating || !addressText.trim()}>
                      {locating ? <LoaderCircle className="animate-spin" size={18} /> : <Search size={18} />}
                    </Button>
                  </div>
                </div>
                {candidates.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2" aria-label="Kết quả địa chỉ">
                    {candidates.map((candidate) => (
                      <button className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 text-blue-800 rounded-xl text-left hover:bg-blue-100 hover:border-blue-200 transition-colors" key={`${candidate.address_text}-${candidate.latitude ?? "na"}`} type="button" onClick={() => chooseCandidate(candidate)}>
                        <MapPinned className="shrink-0 text-blue-600" size={18} />
                        <span className="text-sm font-bold leading-tight">{candidate.address_text}</span>
                      </button>
                    ))}
                  </div>
                )}
                {locationNote && <p className="text-xs font-medium text-slate-500">{locationNote}</p>}
              </div>
            </StepView>
          )}
          
          {error && <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-sm font-semibold text-red-600" role="alert">{error}</div>}
          {locationNote && step !== 4 && <p className="text-xs font-medium text-slate-500">{locationNote}</p>}
          
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-slate-100">
            {step === 4 ? (
              <>
                <Button variant="secondary" type="button" onClick={skipAddress} disabled={pending} className="flex-1 sm:flex-none h-12 px-6 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200">
                  Bỏ qua địa chỉ
                </Button>
                <Button type="button" onClick={() => void finish()} disabled={pending} className="flex-1 h-12 px-6 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 shadow-sm shadow-blue-600/20 ml-auto">
                  {pending ? <LoaderCircle className="animate-spin mr-2" size={18} /> : <Check className="mr-2" size={18} />} 
                  {pending ? "Đang lưu…" : "Hoàn tất thiết lập"}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={next} disabled={pending} className="w-full sm:w-auto ml-auto h-12 px-8 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 shadow-sm shadow-blue-600/20">
                {step === 0 ? "Bắt đầu" : "Tiếp tục"} <ArrowRight className="ml-2" size={18} />
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
    <div className="flex flex-col items-center text-center gap-4 py-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm" aria-hidden="true">
        {icon}
      </div>
      <div className="flex flex-col gap-2">
        <h1 id="onboarding-title" className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-sm mx-auto">{body}</p>
      </div>
      {children}
    </div>
  );
}
