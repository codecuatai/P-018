"use client";

import { useState } from "react";
import { Loader2, Star } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorText, submitFeedback } from "@/lib/api-client";
import type { FeedbackResourceType, ProductOpsDomain } from "@/types";

const QUICK_TAGS: Record<ProductOpsDomain, string[]> = {
  ride: ["Tài xế thân thiện", "Lái xe an toàn", "Xe sạch sẽ", "Đúng giờ"],
  food: ["Giao nhanh", "Đồ ăn ngon", "Đúng đơn", "Giao hàng cẩn thận"],
  restaurant: ["Phục vụ tốt", "Không gian đẹp", "Đúng giờ", "Đồ ăn ngon"],
  healthcare: ["Bác sĩ tận tâm", "Tư vấn rõ ràng", "Đúng giờ", "Cơ sở sạch sẽ"],
};

function domainFromResourceType(resourceType: FeedbackResourceType): ProductOpsDomain {
  if (resourceType === "ride_booking") return "ride";
  if (resourceType === "food_order") return "food";
  if (resourceType === "restaurant_reservation") return "restaurant";
  return "healthcare";
}

export function ReviewPrompt({
  bookingId,
  serviceType,
  serviceName,
  resourceType,
  open,
  onClose,
  onSubmitted,
}: {
  bookingId: string;
  serviceType: ProductOpsDomain;
  serviceName: string;
  resourceType: FeedbackResourceType;
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const tags = QUICK_TAGS[serviceType] ?? [];
  const activeStar = hovered || rating;

  function toggleTag(tag: string): void {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function handleClose(next: boolean): void {
    if (!next) onClose();
  }

  async function submit(): Promise<void> {
    if (rating === 0 || pending) return;
    setPending(true);
    setError("");
    try {
      const tagText = selectedTags.length > 0 ? `[${selectedTags.join(", ")}] ` : "";
      await submitFeedback({
        domain: serviceType,
        resource_type: resourceType,
        resource_id: bookingId,
        rating,
        comment: `${tagText}${comment.trim()}`.trim() || undefined,
      });
      setDone(true);
      onSubmitted?.();
      window.setTimeout(() => {
        setDone(false);
        onClose();
      }, 2000);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="review-dialog-content">
        {done ? (
          <div className="empty-state" role="status">
            <DialogTitle>Cảm ơn bạn đã đánh giá!</DialogTitle>
            <DialogDescription>Phản hồi của bạn giúp chúng tôi phục vụ tốt hơn.</DialogDescription>
          </div>
        ) : (
          <>
            <div>
              <DialogTitle>Đánh giá {serviceName}</DialogTitle>
              <DialogDescription>Bạn thấy trải nghiệm lần này thế nào?</DialogDescription>
            </div>

            <div
              className="review-stars"
              role="radiogroup"
              aria-label="Chấm điểm từ 1 đến 5 sao"
              onMouseLeave={() => setHovered(0)}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} sao`}
                  className={`review-star-btn ${value <= activeStar ? "is-active" : ""} ${value <= hovered ? "is-hovered" : ""}`}
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHovered(value)}
                  onFocus={() => setHovered(value)}
                >
                  <Star size={30} fill={value <= activeStar ? "currentColor" : "none"} />
                </button>
              ))}
            </div>

            {tags.length > 0 ? (
              <div className="review-tags" aria-label="Nhận xét nhanh">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={selectedTags.includes(tag)}
                    className={`review-tag-chip ${selectedTags.includes(tag) ? "is-selected" : ""}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}

            <div>
              <label htmlFor="review-comment" className="pref-toggle-info">
                <strong>Nhận xét thêm (không bắt buộc)</strong>
              </label>
              <textarea
                id="review-comment"
                className="review-textarea"
                value={comment}
                maxLength={500}
                rows={3}
                placeholder="Chia sẻ thêm về trải nghiệm của bạn…"
                onChange={(event) => setComment(event.target.value)}
              />
              <small className="inline-note">{comment.length}/500 ký tự</small>
            </div>

            {error ? (
              <div className="error-panel" role="alert">
                <p>{error}</p>
              </div>
            ) : null}

            <div className="referral-actions">
              <button className="button button-secondary" type="button" onClick={onClose} disabled={pending}>
                Bỏ qua
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={() => void submit()}
                disabled={rating === 0 || pending}
              >
                {pending ? (
                  <>
                    <Loader2 size={15} /> Đang gửi…
                  </>
                ) : (
                  "Gửi đánh giá"
                )}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { domainFromResourceType };
