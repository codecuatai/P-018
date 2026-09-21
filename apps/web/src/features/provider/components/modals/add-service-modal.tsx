"use client";

import React, { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import type { ProviderServiceItem } from "@/lib/api-client";

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (item: {
    domain: string;
    name: string;
    price: number;
    category: string;
    description: string;
  }) => Promise<void>;
  allowedDomain?: string;
}

export function AddServiceModal({
  isOpen,
  onClose,
  onSubmit,
  allowedDomain,
}: AddServiceModalProps) {
  const [domain, setDomain] = useState<string>(() => {
    if (allowedDomain === "ride" || allowedDomain === "ride_driver") return "ride";
    if (allowedDomain === "healthcare" || allowedDomain === "healthcare_doctor") return "healthcare";
    if (allowedDomain === "pharmacy") return "pharmacy";
    return "food";
  });

  useEffect(() => {
    if (allowedDomain === "ride" || allowedDomain === "ride_driver") {
      setDomain("ride");
    } else if (allowedDomain === "healthcare" || allowedDomain === "healthcare_doctor") {
      setDomain("healthcare");
    } else if (allowedDomain === "pharmacy") {
      setDomain("pharmacy");
    } else {
      setDomain("food");
    }
  }, [allowedDomain]);

  const isAll = !allowedDomain || allowedDomain === "all";
  const showFood = isAll || allowedDomain === "restaurant_merchant" || allowedDomain === "food";
  const showRide = isAll || allowedDomain === "ride_driver" || allowedDomain === "ride";
  const showHealth = isAll || allowedDomain === "healthcare_doctor" || allowedDomain === "healthcare";
  const showPharmacy = isAll || allowedDomain === "pharmacy";
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Vui lòng nhập tên dịch vụ hoặc món ăn.");
      return;
    }
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      setError("Vui lòng nhập đơn giá hợp lệ (> 0).");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        domain,
        name: name.trim(),
        price: numPrice,
        category: category.trim() || "Tiêu chuẩn",
        description: description.trim(),
      });
      setName("");
      setPrice("");
      setCategory("");
      setDescription("");
      onClose();
    } catch (err: any) {
      setError(err?.message || "Không thể thêm dịch vụ. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-service-title"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "540px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #E2E8F0",
            background: "#F8FAFC",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "#EEF2FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#4F46E5",
              }}
            >
              <Plus size={20} />
            </div>
            <div>
              <h2
                id="add-service-title"
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#0F172A",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                Gắn Dịch Vụ / Món Ăn Mới Vào X-One
              </h2>
              <span style={{ fontSize: "12px", color: "#64748B" }}>
                Thêm món ăn, chuyến xe hoặc dịch vụ vào thực đơn kinh doanh
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "8px",
              color: "#64748B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Đóng modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
          {error && (
            <div
              style={{
                marginBottom: "16px",
                padding: "10px 14px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "8px",
                color: "#DC2626",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          )}

          {/* Domain Selector */}
          <div style={{ marginBottom: "18px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "8px",
              }}
            >
              Phân loại dịch vụ đối tác
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {showFood && (
                <button
                  type="button"
                  onClick={() => setDomain("food")}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: domain === "food" ? "2px solid #EA580C" : "1px solid #CBD5E1",
                    background: domain === "food" ? "#FFF7ED" : "#FFFFFF",
                    color: domain === "food" ? "#C2410C" : "#475569",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  🍲 Món ăn
                </button>
              )}
              {showRide && (
                <button
                  type="button"
                  onClick={() => setDomain("ride")}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: domain === "ride" ? "2px solid #4F46E5" : "1px solid #CBD5E1",
                    background: domain === "ride" ? "#EEF2FF" : "#FFFFFF",
                    color: domain === "ride" ? "#4338CA" : "#475569",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  🚗 Chuyến xe
                </button>
              )}
              {showHealth && (
                <button
                  type="button"
                  onClick={() => setDomain("healthcare")}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: domain === "healthcare" ? "2px solid #059669" : "1px solid #CBD5E1",
                    background: domain === "healthcare" ? "#ECFDF5" : "#FFFFFF",
                    color: domain === "healthcare" ? "#047857" : "#475569",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  🩺 Khám bệnh
                </button>
              )}
              {showPharmacy && (
                <button
                  type="button"
                  onClick={() => setDomain("pharmacy")}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: domain === "pharmacy" ? "2px solid #0D9488" : "1px solid #CBD5E1",
                    background: domain === "pharmacy" ? "#CCFBF1" : "#FFFFFF",
                    color: domain === "pharmacy" ? "#0F766E" : "#475569",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  💊 Dược phẩm
                </button>
              )}
            </div>
          </div>

          {/* Item Name */}
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "6px",
              }}
            >
              Tên dịch vụ / Món ăn <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Bún Bò Huế Đặc Biệt, Xe Sedona 7 Chỗ..."
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
                color: "#0F172A",
                outline: "none",
              }}
            />
          </div>

          {/* Price & Category */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: "6px",
                }}
              >
                Đơn giá (VND) <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="number"
                required
                min={1000}
                step={1000}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="VD: 85000"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                  color: "#0F172A",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: "6px",
                }}
              >
                Phân loại danh mục
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="VD: Món chính, Xe cao cấp..."
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                  color: "#0F172A",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "6px",
              }}
            >
              Mô tả chi tiết
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả thành phần, tiện ích phương tiện hoặc khung giờ tiếp nhận..."
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
                color: "#0F172A",
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 18px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                background: "#F1F5F9",
                border: "1px solid #CBD5E1",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                background: "#4F46E5",
                border: "none",
                color: "#FFFFFF",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Đang lưu..." : "Xác nhận gắn dịch vụ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
