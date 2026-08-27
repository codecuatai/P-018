"use client";

import { HeartPulse, Pencil, Plus, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { createHealthcarePatient, errorText, listHealthcarePatients, setDefaultHealthcarePatient, unlinkHealthcarePatient, updateHealthcarePatient } from "@/lib/api-client";
import type { HealthcarePatient } from "@/types";

const emptyForm = { name: "", phone: "", relationship: "self" as HealthcarePatient["relationship"] };

export function PatientPage() {
  const [items, setItems] = useState<HealthcarePatient[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems((await listHealthcarePatients()).items); }
    catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const existingSelf = items.find((item) => item.relationship === "self");
  const isEditingSelfViaCreate = editingId === null && form.relationship === "self" && Boolean(existingSelf);

  function validatePhone(value: string): string | undefined {
    const normalized = normalizePhone(value);
    if (!normalized) return "Vui lòng nhập số điện thoại.";
    if (!/^(?:0|\+84)(?:3|5|7|8|9)\d{8}$/.test(normalized)) {
      return "Số điện thoại không hợp lệ. Vui lòng nhập số di động Việt Nam (10 số, bắt đầu bằng 03, 05, 07, 08, 09 hoặc +84).";
    }
    return undefined;
  }

  function startEdit(patient: HealthcarePatient): void {
    setEditingId(patient.id); setForm({ name: patient.name, phone: patient.phone, relationship: patient.relationship }); setError(""); setFeedback("");
  }

  function cancelEdit(): void { setEditingId(null); setForm(emptyForm); }

  async function create(): Promise<void> {
    const phoneError = validatePhone(form.phone);
    if (!form.name.trim() || phoneError || saving) { setError(phoneError ?? "Vui lòng nhập họ tên."); return; }
    setSaving(true); setError(""); setFeedback("");
    try {
      const targetSelf = form.relationship === "self" ? items.find((item) => item.relationship === "self") : undefined;
      if (targetSelf) {
        const updated = await updateHealthcarePatient(targetSelf.id, {
          name: form.name.trim(),
          phone: normalizePhone(form.phone),
          relationship: "self",
        });
        setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
        setForm(emptyForm);
        setFeedback("Đã cập nhật thông tin hồ sơ bản thân.");
      } else {
        const patient = await createHealthcarePatient({ name: form.name.trim(), phone: normalizePhone(form.phone), relationship: form.relationship });
        setItems((current) => [...current.filter((item) => item.id !== patient.id), patient]);
        setForm(emptyForm);
        setFeedback("Hồ sơ đã được liên kết với tài khoản.");
      }
    } catch (reason) { setError(errorText(reason)); }
    finally { setSaving(false); }
  }

  async function saveEdit(patient: HealthcarePatient): Promise<void> {
    const phoneError = validatePhone(form.phone);
    if (!form.name.trim() || phoneError || saving) { setError(phoneError ?? "Vui lòng nhập họ tên."); return; }
    setSaving(true); setError(""); setFeedback("");
    try {
      const updated = await updateHealthcarePatient(patient.id, { name: form.name.trim(), phone: normalizePhone(form.phone), relationship: form.relationship });
      setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); cancelEdit(); setFeedback("Đã cập nhật hồ sơ người bệnh.");
    } catch (reason) { setError(errorText(reason)); }
    finally { setSaving(false); }
  }

  async function makeDefault(patient: HealthcarePatient): Promise<void> {
    if (busyId !== null) return;
    setBusyId(patient.id); setError(""); setFeedback("");
    try { const updated = await setDefaultHealthcarePatient(patient.id); setItems((current) => current.map((item) => ({ ...item, is_default: item.id === updated.id }))); setFeedback("Đã chọn người bệnh mặc định."); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusyId(null); }
  }

  async function unlink(patient: HealthcarePatient): Promise<void> {
    if (busyId !== null || !window.confirm(`Gỡ liên kết hồ sơ “${patient.name}”? Lịch khám đã tạo vẫn được giữ nguyên.`)) return;
    setBusyId(patient.id); setError(""); setFeedback("");
    try { await unlinkHealthcarePatient(patient.id); setItems((current) => current.filter((item) => item.id !== patient.id)); setFeedback("Đã gỡ liên kết hồ sơ. Lịch khám cũ vẫn được giữ nguyên."); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusyId(null); }
  }

  return <section className="route-shell patient-page" aria-labelledby="patients-title">
    <header className="section-heading"><div><span className="eyebrow">HEALTHCARE</span><h1 id="patients-title">Hồ sơ người bệnh</h1><p>Thông tin hồ sơ được dùng để đặt lịch và chỉ hiển thị với bạn.</p></div><button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại hồ sơ"><RefreshCw size={18} /></button></header>
    <div className="patient-form"><div className="patient-form-heading"><HeartPulse size={20} /><div><strong>{editingId !== null ? "Chỉnh sửa hồ sơ" : isEditingSelfViaCreate ? "Cập nhật hồ sơ bản thân" : "Thêm người bệnh"}</strong><span>{editingId !== null || isEditingSelfViaCreate ? "Cập nhật thông tin dùng khi đặt lịch khám." : "Có thể đặt lịch cho chính mình hoặc người thân."}</span></div></div><div className="form-grid"><label><span>Họ và tên</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label><label><span>Số điện thoại</span><input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" inputMode="tel" required /></label><label><span>Quan hệ</span><select value={form.relationship} onChange={(event) => { const nextRel = event.target.value as HealthcarePatient["relationship"]; if (nextRel === "self" && existingSelf && editingId === null && (!form.name.trim() || form.name === existingSelf.name)) { setForm({ name: existingSelf.name, phone: existingSelf.phone, relationship: "self" }); } else { setForm((current) => ({ ...current, relationship: nextRel })); } }}><option value="self">Bản thân</option><option value="child">Con</option><option value="parent">Cha/mẹ</option><option value="dependent">Người phụ thuộc</option></select></label></div><div className="patient-form-actions"><button className="button button-primary" type="button" onClick={() => { const patient = items.find((item) => item.id === editingId); if (patient) void saveEdit(patient); else void create(); }} disabled={saving || !form.name.trim() || !form.phone.trim()}><Plus size={16} />{saving ? "Đang lưu…" : editingId !== null ? "Lưu thay đổi" : isEditingSelfViaCreate ? "Cập nhật hồ sơ bản thân" : "Liên kết hồ sơ"}</button>{editingId !== null ? <button className="button button-secondary" type="button" onClick={cancelEdit} disabled={saving}><X size={16} />Hủy</button> : null}</div></div>
    {feedback ? <p className="success-note" role="status">{feedback}</p> : null}{error ? <div className="error-panel" role="alert"><p>{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Thử lại</button></div> : null}
    {loading ? <p className="inline-note">Đang tải hồ sơ…</p> : items.length === 0 ? <div className="empty-state"><UserRound size={24} /><h2>Chưa có hồ sơ liên kết</h2><p>Thêm bản thân hoặc người thân cho luồng Healthcare.</p></div> : <div className="patient-list">{items.map((patient) => <article className="patient-row" key={patient.id}>{editingId === patient.id ? <p className="inline-note">Đang chỉnh sửa hồ sơ này ở biểu mẫu phía trên.</p> : <><div><div className="patient-name"><strong>{patient.name}</strong>{patient.is_default ? <span className="status-badge">Mặc định</span> : null}</div><p>{patient.phone} · {relationshipLabel(patient.relationship)}</p></div><div className="patient-actions">{!patient.is_default ? <button className="text-button" type="button" onClick={() => void makeDefault(patient)} disabled={busyId !== null}>Chọn mặc định</button> : null}<button className="icon-button" type="button" onClick={() => startEdit(patient)} disabled={busyId !== null} aria-label={`Sửa hồ sơ ${patient.name}`}><Pencil size={16} /></button><button className="icon-button danger" type="button" onClick={() => void unlink(patient)} disabled={busyId !== null} aria-label={`Gỡ liên kết hồ sơ ${patient.name}`}><Trash2 size={16} /></button></div></>}</article>)}</div>}
  </section>;
}

function normalizePhone(value: string): string { return value.trim().replace(/[\s().-]/g, ""); }
function relationshipLabel(value: HealthcarePatient["relationship"]): string { return { self: "Bản thân", child: "Con", parent: "Cha/mẹ", dependent: "Người phụ thuộc" }[value]; }
