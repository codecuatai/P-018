"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { resolveAddress } from "@/lib/api-client";
import { XOneMap, type XOnePoint } from "@/features/product/xone-map";
import type { AssistantOption } from "@/types";

type DetailKind = "food" | "restaurant" | "healthcare";

export function ServiceDetailDialog({ open, onOpenChange, kind, option }: { open: boolean; onOpenChange: (open: boolean) => void; kind: DetailKind; option: AssistantOption | null }) {
  const [resolvedPoint, setResolvedPoint] = useState<XOnePoint>();
  const [resolving, setResolving] = useState(false);

  const nestedRestaurant = isRecord(option?.restaurant) ? option?.restaurant : undefined;
  const nestedFacility = isRecord(option?.facility) ? option?.facility : undefined;
  const address = stringValue(nestedFacility?.address) || stringValue(nestedRestaurant?.address) || stringValue(option?.address) || stringValue(option?.location);
  const directPoint = pointFrom(nestedFacility ?? nestedRestaurant ?? option);

  useEffect(() => {
    setResolvedPoint(directPoint);
  }, [directPoint?.latitude, directPoint?.longitude, open]);

  useEffect(() => {
    if (!open || directPoint || !address) return;
    let active = true;
    setResolving(true);
    void resolveAddress(address).then((result) => {
      if (!active) return;
      const candidate = result.candidates.find((item) => item.latitude !== null && item.longitude !== null);
      if (candidate && typeof candidate.latitude === "number" && typeof candidate.longitude === "number") setResolvedPoint({ latitude: candidate.latitude, longitude: candidate.longitude });
    }).catch(() => undefined).finally(() => { if (active) setResolving(false); });
    return () => { active = false; };
  }, [address, directPoint?.latitude, directPoint?.longitude, open]);

  if (!option) return null;
  const title = stringValue(option.name) || stringValue(option.doctor) || stringValue(option.title) || "Chi tiết lựa chọn";
  const restaurantName = stringValue(nestedRestaurant?.name) || (typeof option.restaurant === "string" ? option.restaurant : undefined);
  const facilityName = stringValue(nestedFacility?.name);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="service-detail-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>Thông tin được lấy từ dịch vụ đang xử lý.</DialogDescription>
      <div className="service-detail-dialog-body">
        <dl className="detail-list">
          {kind === "food" ? <>
            <Detail label="Mô tả" value={stringValue(option.description) || "Đang cập nhật"} />
            <Detail label="Giá" value={option.price !== undefined ? formatMoney(option.price) : "Đang cập nhật"} />
            <Detail label="Quán" value={restaurantName || "Đang cập nhật"} />
            <Detail label="Địa chỉ quán" value={address || "Đang cập nhật"} />
            {option.rating !== undefined ? <Detail label="Đánh giá" value={`${option.rating} ★`} /> : null}
          </> : kind === "restaurant" ? <>
            <Detail label="Địa chỉ" value={address || "Đang cập nhật"} />
            <Detail label="Ẩm thực" value={stringValue(option.cuisine) || "Đang cập nhật"} />
            {option.rating !== undefined ? <Detail label="Đánh giá" value={`${option.rating} ★`} /> : null}
          </> : <>
            <Detail label="Cơ sở" value={facilityName || "Đang cập nhật"} />
            <Detail label="Địa chỉ" value={address || "Đang cập nhật"} />
            <Detail label="Chuyên khoa" value={stringValue(option.department) || "Đang cập nhật"} />
            <Detail label="Bác sĩ" value={stringValue(option.doctor) || "Đang cập nhật"} />
            <Detail label="Ngày giờ" value={dateText(option.start_time)} />
            {option.price !== undefined ? <Detail label="Giá" value={formatMoney(option.price)} /> : null}
          </>}
        </dl>
        {resolvedPoint ? <XOneMap destination={resolvedPoint} label={`Vị trí ${title}`} /> : resolving ? <p className="inline-note">Đang xác định vị trí thật…</p> : <p className="inline-note">Chưa có tọa độ hợp lệ cho địa chỉ này.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function pointFrom(value: unknown): XOnePoint | undefined {
  if (!isRecord(value)) return undefined;
  const latitude = value.latitude;
  const longitude = value.longitude;
  return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateText(value: unknown): string {
  const raw = stringValue(value);
  if (!raw) return "Đang cập nhật";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatMoney(value: number, currency = "VND"): string {
  try { return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); } catch { return `${value.toLocaleString("vi-VN")} ${currency}`; }
}
