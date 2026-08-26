"use client";

import Link from "next/link";
import { Heart, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { browseService, deleteFavorite, errorText, getFoodRestaurant, getRestaurantDetail, listFavorites } from "@/lib/api-client";
import type { FavoriteItem } from "@/types";

const labels = { food: "Đồ ăn", restaurant: "Nhà hàng", healthcare: "Lịch khám" } as const;

type ResourceMeta = { title: string; address?: string };

export default function FavoritesPage() {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [details, setDetails] = useState<Record<string, ResourceMeta>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const favoriteList = (await listFavorites()).items;
      setItems(favoriteList);

      const metaMap: Record<string, ResourceMeta> = {};
      const domains = Array.from(new Set(favoriteList.map((item) => item.domain)));

      await Promise.allSettled(
        domains.map(async (domain) => {
          try {
            const catalog = await browseService(domain);
            for (const rawItem of catalog.items) {
              const id = String(rawItem.id ?? rawItem.restaurant_id ?? rawItem.facility_id ?? rawItem.source_record_id ?? "");
              if (id) {
                const title = String(rawItem.name ?? rawItem.title ?? rawItem.label ?? "");
                const address = String(rawItem.address ?? rawItem.location ?? rawItem.description ?? "");
                if (title && title !== "—") {
                  metaMap[`${domain}:${id}`] = { title, address: address && address !== "—" ? address : undefined };
                }
              }
            }
          } catch {
            // Ignore catalog fetch error
          }
        })
      );

      const unresolved = favoriteList.filter((item) => !metaMap[`${item.domain}:${item.resource_id}`]);
      await Promise.allSettled(
        unresolved.map(async (item) => {
          try {
            let detail: Record<string, unknown> | undefined;
            if (item.domain === "restaurant") detail = await getRestaurantDetail(item.resource_id);
            else if (item.domain === "food") detail = await getFoodRestaurant(item.resource_id);
            if (detail) {
              const title = String(detail.name ?? detail.title ?? "");
              const address = String(detail.address ?? detail.location ?? detail.description ?? "");
              if (title && title !== "—") {
                metaMap[`${item.domain}:${item.resource_id}`] = { title, address: address && address !== "—" ? address : undefined };
              }
            }
          } catch {
            // Fallback to default label
          }
        })
      );

      setDetails(metaMap);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: string): Promise<void> {
    try {
      await deleteFavorite(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <section className="route-shell activity-page" aria-labelledby="favorites-title">
      <header className="section-heading">
        <div>
          <span className="eyebrow">ĐÃ LƯU</span>
          <h1 id="favorites-title">Nơi bạn hay quay lại</h1>
          <p>Danh sách được lưu theo tài khoản để bạn mở lại nhanh.</p>
        </div>
        <button className="icon-button" type="button" onClick={() => void load()} aria-label="Tải lại địa điểm đã lưu">
          <RefreshCw size={18} />
        </button>
      </header>
      {loading ? (
        <p className="inline-note">Đang tải địa điểm đã lưu…</p>
      ) : error ? (
        <div className="error-panel" role="alert">
          <p>{error}</p>
          <button className="button button-secondary" type="button" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <Heart size={24} />
          <h2>Chưa có địa điểm nào</h2>
          <p>Nhấn biểu tượng trái tim ở chi tiết nhà hàng, cơ sở y tế hoặc địa điểm đồ ăn để lưu lại.</p>
          <Link className="button button-primary" href="/app/services">
            Khám phá dịch vụ
          </Link>
        </div>
      ) : (
        <div className="favorite-groups">
          {(["food", "restaurant", "healthcare"] as const).map((domain) => {
            const group = items.filter((item) => item.domain === domain);
            return group.length ? (
              <section key={domain} className="favorite-group" aria-labelledby={`favorite-${domain}`}>
                <div className="history-section-heading">
                  <div>
                    <span className="eyebrow">{labels[domain]}</span>
                    <h2 id={`favorite-${domain}`}>{labels[domain]} đã lưu</h2>
                  </div>
                  <span className="activity-count">{group.length}</span>
                </div>
                <div className="history-list">
                  {group.map((item) => {
                    const meta = details[`${item.domain}:${item.resource_id}`];
                    const title = meta?.title ?? favoriteTitle(domain);
                    const addressText = meta?.address ? `${meta.address} · ` : "";
                    return (
                      <article className="favorite-row" key={item.id}>
                        <Link
                          aria-label={`Mở ${title}`}
                          href={`/app/services/${domain}?resource=${encodeURIComponent(item.resource_id)}`}
                        >
                          <Heart size={17} />
                          <span>
                            <strong>{title}</strong>
                            <small>{addressText}Lưu từ {formatDate(item.created_at)}</small>
                          </span>
                        </Link>
                        <button
                          className="icon-button danger"
                          type="button"
                          aria-label={`Bỏ lưu ${title}`}
                          onClick={() => void remove(item.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(date);
}

function favoriteTitle(domain: FavoriteItem["domain"]): string {
  return domain === "food" ? "Món ăn đã lưu" : domain === "restaurant" ? "Nhà hàng đã lưu" : "Cơ sở y tế đã lưu";
}
