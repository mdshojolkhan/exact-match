/**
 * Browser-side client for the V1 API. It only speaks HTTP to our own routes —
 * no model credentials ever exist on this side of the boundary.
 */
import type {
  ApiError,
  AssistantStatus,
  ChatRequest,
  ChatResponse,
  PublicTool,
  ToolExecutionResponse,
} from "./types";

export class V1ApiError extends Error {
  readonly code: ApiError["code"];
  readonly status: number;

  constructor(status: number, payload: Partial<ApiError>) {
    super(payload.error ?? "V1 could not complete that request.");
    this.name = "V1ApiError";
    this.status = status;
    this.code = payload.code ?? "internal_error";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => ({}))) as Partial<
    ApiError & T
  >;
  if (!response.ok) {
    throw new V1ApiError(response.status, payload);
  }
  return payload as T;
}

export function sendChatMessage(input: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchAssistantStatus(): Promise<AssistantStatus> {
  return request<AssistantStatus>("/api/v1/status");
}

export function fetchTools(): Promise<PublicTool[]> {
  return fetch("/api/v1/tools").then(
    (response) => response.json() as Promise<PublicTool[]>,
  );
}

export function executeTool(input: {
  toolId: string;
  approved: boolean;
  input?: Record<string, unknown>;
}): Promise<ToolExecutionResponse> {
  return request<ToolExecutionResponse>("/api/v1/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
