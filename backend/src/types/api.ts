export interface ChatContentPart {
  type: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[] | Record<string, unknown>;
}

export interface ChatCompletionRequest {
  wechat_code: string;
  client_request_id?: string;
  model?: string;
  models?: string[];
  messages: ChatMessage[];
  session_id?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
  provider?: Record<string, unknown>;
  structured_outputs?: boolean;
}

export type ApiErrorCode =
  | 'INVALID_ARGUMENT'
  | 'WECHAT_AUTH_FAILED'
  | 'OPENROUTER_UPSTREAM_FAILED'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  success: false;
  request_id: string;
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export interface ApiSuccessBody {
  success: true;
  request_id: string;
  data: unknown;
}
