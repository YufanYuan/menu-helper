import type { AnalyticsEngineDatasetBinding } from '../services/analytics';

export interface Env {
  OPENROUTER_API_KEY: string;
  WECHAT_APP_ID: string;
  WECHAT_APP_SECRET: string;
  OPENROUTER_BASE_URL?: string;
  MENU_ROOM_OBJECT: DurableObjectNamespace;
  USAGE_DATASET?: AnalyticsEngineDatasetBinding;
}
