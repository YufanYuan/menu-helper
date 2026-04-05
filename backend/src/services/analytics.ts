import type { OpenRouterUsage } from './openrouter';

export interface AnalyticsEventInput {
  eventType: string;
  openid: string;
  model: string;
  stream: boolean;
  statusCode: number;
  latencyMs: number;
  usage: OpenRouterUsage;
  cf: Request['cf'] | undefined;
  createdAt: string;
  requestId: string;
}

function toBlobValue(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : 'unknown';
}

export function writeUsageEvent(dataset: AnalyticsEngineDataset, event: AnalyticsEventInput): void {
  const country = toBlobValue(event.cf?.country);
  const city = toBlobValue(event.cf?.city);
  const region = toBlobValue(event.cf?.region);
  const timezone = toBlobValue(event.cf?.timezone);
  const colo = toBlobValue(event.cf?.colo);

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
