"use client";

import { HeartPulse, Plus, RefreshCw, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { createHealthcarePatient, errorText, listHealthcarePatients, setDefaultHealthcarePatient } from "@/lib/api-client";
import type { HealthcarePatient } from "@/types";

export function PatientPage() {
  const [items, setItems] = useState<HealthcarePatient[]>([]);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [relationship, setRelationship] = useState<HealthcarePatient["relationship"]>("self");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [feedback, setFeedback] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setItems((await listHealthcarePatients()).items); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function create(): Promise<void> { if (!name.trim() || !phone.trim() || saving) return; setSaving(true); setError(""); try { const patient = await createHealthcarePatient({ name: name.trim(), phone: phone.trim(), relationship }); setItems((current) => [...current.filter((item) => item.id !== patient.id), patient]); setName(""); setPhone(""); setFeedback("Hồ sơ đã được liên kết với tài khoản."); } catch (reason) { setError(errorText(reason)); } finally { setSaving(false); } }
  async function makeDefault(patient: HealthcarePatient): Promise<void> { try { const updated = await setDefaultHealthcarePatient(patient.id); setItems((current) => current.map((item) => ({ ...item, is_default: item.id === updated.id }))); setFeedback("Đã chọn người bệnh mặc định."); } catch (reason) { setError(errorText(reason)); } }
  return (
    <section className="w-full flex flex-col gap-6" aria-labelledby="patients-title">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold text-blue-600 tracking-widest uppercase">HEALTHCARE</span>
            <h1 id="patients-title" className="text-2xl font-bold text-slate-900 tracking-tight">Hồ sơ người bệnh</h1>
          </div>
          <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 active:scale-95 transition-all shadow-sm" type="button" onClick={() => void load()} aria-label="Tải lại hồ sơ">
            <RefreshCw size={18} />
          </button>
        </div>
        <p className="text-sm font-medium text-slate-500">Thông tin hồ sơ được dùng để đặt lịch và chỉ hiển thị với bạn.</p>
      </header>

      <div className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-sm flex flex-col gap-6">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <HeartPulse size={20} />
          </div>
          <div className="flex flex-col gap-1">
            <strong className="text-lg font-bold text-slate-900 leading-tight">Thêm người bệnh</strong>
            <span className="text-xs font-medium text-slate-500">Có thể đặt lịch cho chính mình hoặc người thân.</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-700">Họ và tên</span>
            <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Nguyễn Văn B" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-700">Số điện thoại</span>
            <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all placeholder:text-slate-400" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0901234567" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-700">Quan hệ</span>
            <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all text-slate-700 appearance-none" value={relationship} onChange={(event) => setRelationship(event.target.value as HealthcarePatient["relationship"])}>
              <option value="self">Bản thân</option>
              <option value="child">Con</option>
              <option value="parent">Cha/mẹ</option>
              <option value="dependent">Người phụ thuộc</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2" type="button" onClick={() => void create()} disabled={saving || !name.trim() || !phone.trim()}>
            <Plus size={16} />
            {saving ? "Đang lưu…" : "Liên kết hồ sơ"}
          </button>
        </div>
      </div>

      {feedback ? <p className="text-sm font-semibold text-emerald-600 bg-emerald-50 p-4 rounded-xl border border-emerald-100" role="status">{feedback}</p> : null}
      
      {error ? (
        <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="alert">
          <span className="text-sm font-semibold text-red-600">{error}</span>
          <button className="px-4 py-2 bg-white border border-red-200 text-red-700 text-xs font-bold rounded-lg hover:bg-red-50 active:scale-95 transition-all shadow-sm" type="button" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 mt-2">
        {loading ? (
          <p className="text-sm font-medium text-slate-500 animate-pulse">Đang tải hồ sơ…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4 text-slate-400 bg-slate-50/50 border border-slate-100 border-dashed rounded-3xl">
            <UserRound size={40} strokeWidth={1.5} />
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-700">Chưa có hồ sơ liên kết</h2>
              <p className="text-sm font-medium mt-1">Thêm bản thân hoặc người thân cho luồng Healthcare.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((patient) => (
              <article className="flex items-center justify-between gap-4 p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:shadow-md transition-shadow" key={patient.id}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <strong className="text-base font-bold text-slate-900">{patient.name}</strong>
                    {patient.is_default ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-md">Mặc định</span> : null}
                  </div>
                  <p className="text-sm font-medium text-slate-600">{patient.phone}</p>
                </div>
                {!patient.is_default ? (
                  <button className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors" type="button" onClick={() => void makeDefault(patient)}>
                    Chọn mặc định
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
