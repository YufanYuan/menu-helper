import { createCloudflareAnalyticsWriter, type RequestLocation } from './analytics';
import type { Env } from '../types/env';
import type { RuntimeContext } from '../types/runtime';

interface CloudflareRequestMetadata {
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
  colo?: string;
}

type RequestWithCloudflareMetadata = Request & {
  cf?: CloudflareRequestMetadata;
};

function getCloudflareRequestLocation(request: Request): RequestLocation | undefined {
  const cf = (request as RequestWithCloudflareMetadata).cf;

  if (!cf) {
    return undefined;
  }

  return {
    country: cf.country,
    city: cf.city,
    region: cf.region,
    timezone: cf.timezone,
    colo: cf.colo,
  };
}

export function createRuntimeContext(request: Request, env: Env): RuntimeContext {
  const requestLocation = getCloudflareRequestLocation(request);
  const analyticsWriter = createCloudflareAnalyticsWriter(env.USAGE_DATASET);

  if (requestLocation || analyticsWriter) {
    return {
      platform: 'cloudflare-worker',
      requestLocation,
      analyticsWriter,
    };
  }

  return {
    platform: 'generic',
  };
}
