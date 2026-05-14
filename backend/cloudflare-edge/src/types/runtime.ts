import type { AnalyticsWriter, RequestLocation } from '../services/analytics';

export interface RuntimeContext {
  platform: string;
  requestLocation?: RequestLocation;
  analyticsWriter?: AnalyticsWriter;
}
