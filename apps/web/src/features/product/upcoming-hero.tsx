"use client";

import Link from "next/link";
import { CalendarDays, Clock, ExternalLink, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

import { errorText, getActiveHistory } from "@/lib/api-client";
import { formatDateTime } from "@/lib/presentation";
import type { HistoryItem } from "@/types";

interface UpcomingHeroProps {
  refreshKey?: number;
}

export function UpcomingHero({ refreshKey }: UpcomingHeroProps) {
  const [upcoming, setUpcoming] = useState<HistoryItem | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getActiveHistory()
      .then((result) => {
        if (!active) return;
        const items = result.items ?? [];
        const sorted = [...items].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setUpcoming(sorted[0] ?? null);
        setCount(items.length);
      })
      .catch(() => {
        if (active) {
          setUpcoming(null);
          setCount(0);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (loading || dismissed || !upcoming) return null;

  const serviceKey = upcoming.type.split("_")[0];
  const summary = heroSummary(upcoming);

  return (
    <motion.section
      className={`upcoming-hero-card upcoming-service-${serviceKey} upcoming-service-${upcoming.type}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      aria-labelledby="upcoming-hero-title"
    >
      <div className="upcoming-hero-main">
        <span className="eyebrow">
          {count > 1 ? `Sắp tới · Còn ${count - 1} lịch nữa` : "Sắp tới"}
        </span>
        <h2 id="upcoming-hero-title" className="upcoming-hero-title">
          {summary.emoji} {summary.title}
        </h2>
        <div className="upcoming-hero-meta">
          <span className="upcoming-meta-item">
            <Clock size={14} />
            <span>{formatDateTime(upcoming.timestamp)}</span>
          </span>
          {summary.location && (
            <span className="upcoming-meta-item">
              <MapPin size={14} />
              <span className="meta-truncate">{summary.location}</span>
            </span>
          )}
        </div>
        <UpcomingCountdown targetTime={upcoming.timestamp} />
      </div>
      <div className="upcoming-hero-actions">
        <Link className="button button-primary button-sm" href="/app/bookings">
          <CalendarDays size={14} /> Xem lịch hẹn
        </Link>
        <Link
          className="button button-secondary button-sm"
          href={`/app/history/${upcoming.type}/${encodeURIComponent(upcoming.id)}`}
        >
          Chi tiết <ExternalLink size={13} />
        </Link>
        <button
          className="button button-ghost button-sm"
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Ẩn thẻ lịch hẹn"
        >
          Ẩn
        </button>
      </div>
    </motion.section>
  );
}

function UpcomingCountdown({ targetTime }: { targetTime: string }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(targetTime).getTime();
  const diff = Number.isFinite(target) ? target - now : 0;

  if (diff <= 0) return <p className="upcoming-countdown-pill is-due">Đang diễn ra</p>;

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const urgent = hours === 0 && minutes < 60;

  return (
    <p className={`upcoming-countdown-pill${urgent ? " is-urgent" : ""}`}>
      Còn {hours > 0 ? `${hours} giờ ` : ""}
      {minutes} phút nữa
    </p>
  );
}

function heroSummary(item: HistoryItem): { emoji: string; title: string; location?: string } {
  const resource = item.resource as Record<string, unknown>;
  if (item.type === "ride_booking") {
    const snap = pickObject(resource, ["quote", "snapshot"]) ?? resource;
    const pickup = textOf(snap, ["pickup_address", "pickup"]) ?? textOf(resource, ["pickup_address", "pickup"]);
    const dropoff = textOf(snap, ["dropoff_address", "dropoff"]) ?? textOf(resource, ["dropoff_address", "dropoff"]);
    // Prefer the human-readable detail ("VinUni → Hồ Gươm · ...") over raw
    // snapshot fields, which may be empty or placeholder ("Điểm đón/Điểm đến").
    const detailRoute = routeFromDetail(item.detail);
    const finalPickup = isPlaceholderAddress(pickup) ? undefined : pickup;
    const finalDropoff = isPlaceholderAddress(dropoff) ? undefined : dropoff;
    const displayPickup = detailRoute?.from ?? finalPickup;
    const displayDropoff = detailRoute?.to ?? finalDropoff;
    if (displayPickup && displayDropoff) {
      return {
        emoji: "🚗",
        title: `${displayPickup} → ${displayDropoff}`,
        location: displayPickup,
      };
    }
    if (displayDropoff) {
      return {
        emoji: "🚗",
        title: `Chuyến xe đi ${displayDropoff}`,
        location: displayDropoff,
      };
    }
    if (displayPickup) {
      return {
        emoji: "🚗",
        title: `Chuyến xe đón tại ${displayPickup}`,
        location: displayPickup,
      };
    }
    const fallbackTitle = item.title && !/chuyến xe|booking|ride/i.test(item.title)
      ? item.title
      : "Chuyến xe sắp tới";
    return {
      emoji: "🚗",
      title: fallbackTitle,
      location: undefined,
    };
  }
  if (item.type === "food_order") {
    const name = nested(resource, "restaurant") ?? textOf(resource, ["restaurant_name"]) ?? "Đơn đồ ăn";
    return { emoji: "🍲", title: name };
  }
  if (item.type === "restaurant_reservation") {
    const name = nested(resource, "restaurant") ?? textOf(resource, ["name"]) ?? "Đặt bàn nhà hàng";
    return { emoji: "🍽️", title: name };
  }
  const facility = nested(resource, "facility") ?? textOf(resource, ["facility_name"]) ?? "Lịch khám";
  return { emoji: "🩺", title: facility };
}

function pickObject(record: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function textOf(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function nested(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const inner = value as Record<string, unknown>;
    const name = inner.name ?? inner.title;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function isPlaceholderAddress(val?: string): boolean {
  if (!val) return true;
  const s = val.trim().toLowerCase();
  return s === "điểm đón" || s === "điểm đến" || s === "điểm đón khách" || s === "điểm trả khách";
}

function routeFromDetail(detail?: string): { from: string; to: string } | null {
  if (!detail) return null;
  const routeChunk = detail.split("·")[0]?.trim();
  if (!routeChunk) return null;
  const parts = routeChunk.split(/\s*(?:→|->)\s*/);
  if (parts.length >= 2 && parts[0]?.trim() && parts[1]?.trim()) {
    return { from: parts[0].trim(), to: parts[1].trim() };
  }
  return null;
}

