import { actionActivity, buildActivityFromResponse, genericActivityEntries, genericProgressStep, parseProgressEvent } from "./progress-filter";
import type { AssistantAction, AssistantResponse } from "../types";

describe("parseProgressEvent", () => {
  it("accepts a schema-validated progress event", () => {
    const event = parseProgressEvent({ step_id: "ride-1", label: "Đang đặt chuyến xe", service: "ride", status: "running", message: "Đang tìm tài xế" });
    expect(event).toEqual({ stepId: "ride-1", service: "ride", label: "Đang đặt chuyến xe", status: "running", message: "Đang tìm tài xế" });
  });

  it("rejects events carrying chain-of-thought, raw prompts, or secrets", () => {
    expect(parseProgressEvent({ step_id: "s1", label: "X", chain_of_thought: "..." })).toBeNull();
    expect(parseProgressEvent({ step_id: "s1", label: "X", reasoning: "..." })).toBeNull();
    expect(parseProgressEvent({ step_id: "s1", label: "X", system_prompt: "hidden" })).toBeNull();
    expect(parseProgressEvent({ step_id: "s1", label: "X", api_key: "sk-1234567890" })).toBeNull();
    expect(parseProgressEvent({ step_id: "s1", label: "X", tokens: 12 })).toBeNull();
    expect(parseProgressEvent({ step_id: "s1", label: "X", raw_provider_data: {} })).toBeNull();
    expect(parseProgressEvent({ step_id: "s1", label: "X", phone: "0900000000" })).toBeNull();
  });

  it("rejects unknown keys, non-objects, and missing required fields", () => {
    expect(parseProgressEvent({ step_id: "s1", label: "X", extra: "nope" })).toBeNull();
    expect(parseProgressEvent("not an object")).toBeNull();
    expect(parseProgressEvent(null)).toBeNull();
    expect(parseProgressEvent([{ step_id: "s1", label: "X" }])).toBeNull();
    expect(parseProgressEvent({ label: "X" })).toBeNull();
    expect(parseProgressEvent({ step_id: "s1" })).toBeNull();
  });

  it("strips control characters and credential-like values from accepted text", () => {
    const event = parseProgressEvent({ step_id: "s1\u0000", label: "X", message: "Bearer sk-abcdefghijklmnop injected" });
    expect(event).not.toBeNull();
    expect(event!.stepId).toBe("s1");
    expect(event!.message).toBeUndefined();
  });

  it("falls back to safe defaults for unknown service or status", () => {
    const event = parseProgressEvent({ step_id: "s1", label: "X", service: "unknown", status: "weird" });
    expect(event).toEqual({ stepId: "s1", service: "general", label: "X", status: "running" });
  });
});

describe("buildActivityFromResponse", () => {
  const partialSuccess: AssistantResponse = {
    conversation_id: "c1",
    message: "",
    actions: [{ id: "ride-retry", kind: "ride_service", label: "Đặt chuyến xe" }],
    completed: [{ kind: "reservation", title: "Đặt bàn tại Nhà hàng X", status: "CONFIRMED" }],
    items: [{ kind: "task_error", title: "Không thể đặt chuyến xe", note: "Chưa có tài xế.", error_code: "RIDE_NO_DRIVER", retryable: true, action_id: "ride-retry" }],
    workflow_status: "PARTIAL_SUCCESS",
  };

  it("marks completed branches and failed branches separately", () => {
    const entries = buildActivityFromResponse(partialSuccess);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ service: "restaurant", step: "Đặt bàn tại Nhà hàng X", status: "completed" });
    expect(entries[1]).toMatchObject({ service: "ride", step: "Không thể đặt chuyến xe", status: "error", detail: "Chưa có tài xế." });
  });

  it("upgrades an existing completed row to running for the current step", () => {
    const entries = buildActivityFromResponse(partialSuccess, { service: "restaurant", step: "Đang xác nhận đặt bàn" });
    expect(entries.find((entry) => entry.service === "restaurant")).toMatchObject({ step: "Đang xác nhận đặt bàn", status: "running" });
  });

  it("keeps the failed attempt visible and appends a retrying row", () => {
    const entries = buildActivityFromResponse(partialSuccess, { service: "ride", step: "Đang đặt lại chuyến xe", retrying: true });
    expect(entries.filter((entry) => entry.service === "ride").map((entry) => entry.status).sort()).toEqual(["error", "retrying"]);
  });
});

describe("actionActivity", () => {
  it("maps actions to services and Vietnamese step labels", () => {
    const confirm: AssistantAction = { id: "a1", kind: "restaurant_confirm", label: "Xác nhận đặt bàn" };
    const ride: AssistantAction = { id: "a2", kind: "ride_service", label: "Đặt xe" };
    expect(actionActivity(confirm)).toEqual({ service: "restaurant", step: "Đang xác nhận đặt bàn" });
    expect(actionActivity(ride)).toEqual({ service: "ride", step: "Đang đặt chuyến xe" });
  });
});

describe("generic progress steps", () => {
  it("selects the current high-level stage from elapsed time", () => {
    expect(genericProgressStep(0).id).toBe("understanding");
    expect(genericProgressStep(1600).id).toBe("fetching");
    expect(genericProgressStep(4100).id).toBe("evaluating");
    expect(genericProgressStep(9000).id).toBe("preparing");
  });

  it("builds four indeterminate entries with exactly one running step", () => {
    const entries = genericActivityEntries(5000);
    expect(entries).toHaveLength(4);
    expect(entries.filter((entry) => entry.status === "running")).toHaveLength(1);
    expect(entries.every((entry) => entry.service === "general")).toBe(true);
    expect(entries.find((entry) => entry.step === "Đang đánh giá phương án")?.status).toBe("running");
  });
});
