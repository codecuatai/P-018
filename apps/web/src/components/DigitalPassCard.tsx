"use client";

import { Check, Copy, Download, ExternalLink, MapPin, QrCode, Sparkles } from "lucide-react";
import { useState } from "react";

export type DigitalPassProps = {
  type: "restaurant" | "healthcare";
  title: string;
  referenceCode: string;
  venueName: string;
  address?: string;
  dateTime: string;
  primaryDetailLabel: string;
  primaryDetailValue: string;
  secondaryDetailLabel?: string;
  secondaryDetailValue?: string;
  instructions: string;
  badgeLabel?: string;
  onMapClick?: () => void;
};

/**
 * Generates an authentic SVG QR-like visual code matrix based on string hash
 */
function VisualQrMatrix({ value }: { value: string }) {
  // Deterministic 19x19 pseudo matrix
  const size = 19;
  const cells: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder patterns (top-left, top-right, bottom-left)
  function drawFinder(r: number, c: number) {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (
          i === 0 || i === 6 || j === 0 || j === 6 ||
          (i >= 2 && i <= 4 && j >= 2 && j <= 4)
        ) {
          cells[r + i][c + j] = true;
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing lines
  for (let i = 8; i < size - 8; i++) {
    cells[6][i] = i % 2 === 0;
    cells[i][6] = i % 2 === 0;
  }

  // Hash-based internal pattern
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inFinderTL = r < 8 && c < 8;
      const inFinderTR = r < 8 && c >= size - 8;
      const inFinderBL = r >= size - 8 && c < 8;
      if (!inFinderTL && !inFinderTR && !inFinderBL) {
        const seed = Math.sin(hash + r * 13 + c * 37) * 10000;
        cells[r][c] = (seed - Math.floor(seed)) > 0.45;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="digital-pass-qr-svg"
      role="img"
      aria-label={`Mã QR Check-in: ${value}`}
    >
      <rect width={size} height={size} fill="#FFFFFF" />
      {cells.map((row, r) =>
        row.map((cell, c) =>
          cell ? <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#1E293B" /> : null
        )
      )}
    </svg>
  );
}

export function DigitalPassCard({
  type,
  title,
  referenceCode,
  venueName,
  address,
  dateTime,
  primaryDetailLabel,
  primaryDetailValue,
  secondaryDetailLabel,
  secondaryDetailValue,
  instructions,
  badgeLabel = "Xác nhận thành công",
  onMapClick,
}: DigitalPassProps) {
  const [copied, setCopied] = useState(false);

  function copyCode() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(referenceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <article className={`digital-pass-card digital-pass-${type}`} aria-label={title}>
      <header className="digital-pass-header">
        <div className="digital-pass-brand">
          <span className="digital-pass-icon-badge">
            <Sparkles size={16} />
          </span>
          <div>
            <span className="digital-pass-eyebrow">
              {type === "restaurant" ? "THẺ ĐẶT BÀN ĐIỆN TỬ" : "PHIẾU HẸN KHÁM BỆNH ĐIỆN TỬ"}
            </span>
            <h3 className="digital-pass-title">{venueName}</h3>
          </div>
        </div>
        <span className="digital-pass-status-pill">{badgeLabel}</span>
      </header>

      <div className="digital-pass-body">
        <div className="digital-pass-qr-wrapper">
          <div className="digital-pass-qr-box">
            <VisualQrMatrix value={referenceCode} />
          </div>
          <span className="digital-pass-qr-hint">Quét mã tại quầy tiếp đón</span>
        </div>

        <div className="digital-pass-meta">
          <div className="digital-pass-code-row">
            <span className="digital-pass-code-label">MÃ THAM CHIẾU</span>
            <div className="digital-pass-code-badge">
              <strong>{referenceCode}</strong>
              <button
                type="button"
                className="digital-pass-copy-btn"
                onClick={copyCode}
                title="Sao chép mã"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                <span>{copied ? "Đã chép" : "Chép mã"}</span>
              </button>
            </div>
          </div>

          <dl className="digital-pass-facts">
            <div>
              <dt>Thời gian</dt>
              <dd><strong>{dateTime}</strong></dd>
            </div>
            <div>
              <dt>{primaryDetailLabel}</dt>
              <dd><strong>{primaryDetailValue}</strong></dd>
            </div>
            {secondaryDetailLabel && secondaryDetailValue ? (
              <div>
                <dt>{secondaryDetailLabel}</dt>
                <dd><strong>{secondaryDetailValue}</strong></dd>
              </div>
            ) : null}
            {address ? (
              <div className="digital-pass-address-row">
                <dt>Địa điểm</dt>
                <dd className="digital-pass-address-text">
                  <MapPin size={13} className="shrink-0" />
                  <span>{address}</span>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <footer className="digital-pass-footer">
        <p className="digital-pass-notice">{instructions}</p>
        <div className="digital-pass-actions">
          {onMapClick ? (
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={onMapClick}
            >
              <MapPin size={14} /> Chỉ đường
            </button>
          ) : null}
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={copyCode}
          >
            <QrCode size={14} /> {copied ? "Đã lưu mã" : "Lưu thẻ về máy"}
          </button>
        </div>
      </footer>
    </article>
  );
}
