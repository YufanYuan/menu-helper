interface Code2SessionResponse {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

export async function resolveWeChatOpenId(params: {
  code: string;
  appId: string;
  appSecret: string;
}): Promise<string> {
  const { code, appId, appSecret } = params;
  const query = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: code,
    grant_type: 'authorization_code',
  });

  const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`);

  if (!response.ok) {
    throw new Error(`WeChat code2Session failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Code2SessionResponse;

  if (payload.errcode || !payload.openid) {
    throw new Error(payload.errmsg ?? `WeChat code2Session error ${payload.errcode ?? 'unknown'}`);
  }

  return payload.openid;
}
