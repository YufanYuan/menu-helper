import type { Env } from './types/env';
import { handleRequest } from './app';
import { createRuntimeContext } from './services/runtime';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, createRuntimeContext(request, env));
  },
};
