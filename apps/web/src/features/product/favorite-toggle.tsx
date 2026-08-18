"use client";

import { Heart, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { createFavorite, deleteFavorite, errorText, listFavorites } from "@/lib/api-client";
import type { FavoriteDomain } from "@/types";

export function FavoriteToggle({ domain, resourceId }: { domain: FavoriteDomain; resourceId: string }) {
  const [favoriteId, setFavoriteId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void listFavorites().then((result) => { if (active) setFavoriteId(result.items.find((item) => item.domain === domain && item.resource_id === resourceId)?.id); }).catch(() => undefined); return () => { active = false; }; }, [domain, resourceId]);
  async function toggle(): Promise<void> { if (pending || !resourceId || resourceId === "—") return; setPending(true); setError(""); try { if (favoriteId) { await deleteFavorite(favoriteId); setFavoriteId(undefined); } else { setFavoriteId((await createFavorite(domain, resourceId)).id); } } catch (reason) { setError(errorText(reason)); } finally { setPending(false); } }
  return <span className="favorite-control">{error ? <small role="status">{error}</small> : null}<button className={`icon-button ${favoriteId ? "is-favorite" : ""}`} type="button" onClick={() => void toggle()} disabled={pending} aria-label={favoriteId ? "Bỏ khỏi địa điểm đã lưu" : "Lưu địa điểm yêu thích"} aria-pressed={Boolean(favoriteId)}>{pending ? <Loader2 className="spinner" size={17} /> : <Heart size={17} fill={favoriteId ? "currentColor" : "none"} />}</button></span>;
}
