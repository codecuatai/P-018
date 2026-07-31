import { FormEvent, useState } from "react";
import { API_BASE_URL, sendChatMessage, type ChatResponse } from "./api";

export default function App() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError("");
    try {
      setResult(await sendChatMessage(trimmed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="workspace">
        <header className="header">
          <div>
            <p className="eyebrow">Team P-018</p>
            <h1>AI Agent Web</h1>
          </div>
          <span className="apiBadge">API: {API_BASE_URL}</span>
        </header>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Nhap cau hoi cho agent..."
            rows={6}
          />
          <button type="submit" disabled={isLoading || !message.trim()}>
            {isLoading ? "Dang xu ly" : "Gui"}
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        <section className="response" aria-live="polite">
          <h2>Phan hoi</h2>
          <p>{result?.response ?? "Chua co phan hoi."}</p>
          {result?.analysis && (
            <>
              <h3>Analysis</h3>
              <p>{result.analysis}</p>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
