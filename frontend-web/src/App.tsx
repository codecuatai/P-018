import { useState } from "react";

type ChatMessage = {
  id: number;
  sender: "user" | "agent";
  text: string;
};

type ReceiptLine = {
  label: string;
  value: string;
};

const chatMessages: ChatMessage[] = [
  {
    id: 1,
    sender: "user",
    text: "Mình cần ra sân bay Nội Bài lúc 18:30, đặt thêm bữa tối nhẹ và kiểm tra giúp chuyến bay vào Đà Nẵng tối nay.",
  },
  {
    id: 2,
    sender: "agent",
    text: "Mình đã ghép nhu cầu của bạn thành một lịch trình liền mạch: xe đến đón lúc 17:05, bữa tối giao trước giờ đi, và vé bay phù hợp khởi hành lúc 20:15.",
  },
  {
    id: 3,
    sender: "user",
    text: "Ưu tiên xe rộng, đồ ăn không cay, chuyến bay có hành lý ký gửi nhé.",
  },
  {
    id: 4,
    sender: "agent",
    text: "Đã cập nhật: xe 7 chỗ, phần cơm gà sốt nấm không cay, vé bay kèm 20kg hành lý. Mình đã chuẩn bị biên lai để bạn xác nhận thanh toán.",
  },
];

const receiptLines: ReceiptLine[] = [
  { label: "Xe đưa đón", value: "7 chỗ, Hoàn Kiếm -> Nội Bài" },
  { label: "Thời gian đón", value: "17:05 hôm nay" },
  { label: "Đồ ăn", value: "Cơm gà sốt nấm, không cay" },
  { label: "Chuyến bay", value: "HAN -> DAD, 20:15 - 21:35" },
  { label: "Hành lý", value: "20kg ký gửi + 7kg xách tay" },
  { label: "Thanh toán", value: "Ví DemoPay" },
];

const serviceCards = [
  {
    title: "Gọi xe",
    meta: "Đón đúng giờ",
    description: "Tự chọn loại xe theo hành lý, nhóm đi cùng và thời điểm cần đến.",
  },
  {
    title: "Đặt đồ ăn",
    meta: "Theo khẩu vị",
    description: "Gợi ý món ăn khớp lịch trình, dị ứng, độ cay và thời gian giao.",
  },
  {
    title: "Đặt chuyến bay",
    meta: "Kèm hành lý",
    description: "So sánh giờ bay, hành lý, tổng chi phí và rủi ro trễ lịch.",
  },
];

export default function App() {
  const [isPaid, setIsPaid] = useState(false);
  const [showModal, setShowModal] = useState(false);

  function handleConfirmPayment() {
    setIsPaid(true);
    setShowModal(true);
  }

  return (
    <main className="page">
      <section className="shell">
        <aside className="sidebar" aria-label="Tổng quan dịch vụ">
          <div className="brandBlock">
            <span className="brandMark">A</span>
            <div>
              <p className="eyebrow">Agent đặt dịch vụ</p>
              <h1>All-in-One Concierge</h1>
            </div>
          </div>

          <div className="serviceStack">
            {serviceCards.map((service) => (
              <article className="serviceCard" key={service.title}>
                <div>
                  <h2>{service.title}</h2>
                  <p>{service.description}</p>
                </div>
                <span>{service.meta}</span>
              </article>
            ))}
          </div>

          <div className="tripSummary">
            <p className="eyebrow">Lịch trình demo</p>
            <strong>Hà Nội đến Đà Nẵng</strong>
            <span>Xe, bữa tối và chuyến bay được gom trong một lần xác nhận.</span>
          </div>
        </aside>

        <section className="conversationPanel" aria-label="Hội thoại đặt dịch vụ">
          <header className="topBar">
            <div>
              <p className="eyebrow">Hội thoại mẫu</p>
              <h2>Agent đang điều phối yêu cầu của bạn</h2>
            </div>
            <span className={isPaid ? "statusBadge paid" : "statusBadge"}>
              {isPaid ? "Đã thanh toán" : "Chờ xác nhận"}
            </span>
          </header>

          <div className="chatList">
            {chatMessages.map((message) => (
              <article className={`message ${message.sender}`} key={message.id}>
                <span>{message.sender === "user" ? "Bạn" : "Agent"}</span>
                <p>{message.text}</p>
              </article>
            ))}

            <article className="receiptMessage">
              <div className="receiptHeader">
                <div>
                  <span>Biên lai tạm tính</span>
                  <h3>Gói dịch vụ liên kết</h3>
                </div>
                <strong>2.145.000đ</strong>
              </div>

              <dl className="receiptRows">
                {receiptLines.map((line) => (
                  <div key={line.label}>
                    <dt>{line.label}</dt>
                    <dd>{line.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="costBreakdown">
                <div>
                  <span>Tạm tính</span>
                  <strong>2.040.000đ</strong>
                </div>
                <div>
                  <span>Phí điều phối</span>
                  <strong>105.000đ</strong>
                </div>
                <div className="totalRow">
                  <span>Tổng thanh toán</span>
                  <strong>2.145.000đ</strong>
                </div>
              </div>

              <button
                className="confirmButton"
                type="button"
                onClick={handleConfirmPayment}
                disabled={isPaid}
              >
                {isPaid ? "Thanh toán đã xác nhận" : "Xác nhận thanh toán"}
              </button>
            </article>
          </div>
        </section>
      </section>

      {showModal && (
        <div className="modalBackdrop" role="presentation">
          <section
            aria-labelledby="payment-success-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <span className="successMark">OK</span>
            <p className="eyebrow">Hoàn tất</p>
            <h2 id="payment-success-title">Xác nhận thanh toán thành công</h2>
            <p>
              Agent đã ghi nhận thanh toán demo và sẽ tiếp tục điều phối xe,
              đồ ăn, chuyến bay trong cùng một lịch trình.
            </p>
            <button type="button" onClick={() => setShowModal(false)}>
              Đóng
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
