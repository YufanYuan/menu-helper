import type { OpenRouterUsage } from './openrouter';

export interface RequestLocation {
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
  colo?: string;
}

export interface AnalyticsEngineDatasetBinding {
  writeDataPoint(dataPoint: {
    blobs: string[];
    doubles: number[];
    indexes: string[];
  }): void;
}

export interface AnalyticsEventInput {
  eventType: string;
  openid: string;
  model: string;
  stream: boolean;
  statusCode: number;
  latencyMs: number;
  usage: OpenRouterUsage;
  location?: RequestLocation;
  createdAt: string;
  requestId: string;
}

export interface AnalyticsWriter {
  writeUsageEvent(event: AnalyticsEventInput): void;
}

function toBlobValue(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : 'unknown';
}

function writeCloudflareUsageEvent(
  dataset: AnalyticsEngineDatasetBinding,
  event: AnalyticsEventInput,
): void {
  const country = toBlobValue(event.location?.country);
  const city = toBlobValue(event.location?.city);
  const region = toBlobValue(event.location?.region);
  const timezone = toBlobValue(event.location?.timezone);
  const colo = toBlobValue(event.location?.colo);

  dataset.writeDataPoint({
    blobs: [
      event.eventType,
      event.openid,
      event.model,
      country,
      city,
      region,
      timezone,
      colo,
      event.createdAt,
      event.requestId,
    ],
    doubles: [
      event.usage.prompt_tokens,
      event.usage.completion_tokens,
      event.usage.reasoning_tokens,
      event.usage.total_tokens,
      event.usage.cost_usd_estimate,
      event.statusCode,
      event.latencyMs,
      event.stream ? 1 : 0,
    ],
    indexes: [event.requestId],
  });
}

export function createCloudflareAnalyticsWriter(
  dataset?: AnalyticsEngineDatasetBinding,
): AnalyticsWriter | undefined {
  if (!dataset) {
    return undefined;
  }

  return {
    writeUsageEvent(event) {
      writeCloudflareUsageEvent(dataset, event);
    },
  };
}

export function writeUsageEvent(writer: AnalyticsWriter | undefined, event: AnalyticsEventInput): void {
  writer?.writeUsageEvent(event);
}
