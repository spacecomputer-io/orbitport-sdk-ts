import { OrbitportSDK } from '../../src';

global.fetch = jest.fn();

describe('OrbitportSDK public beta surface', () => {
  beforeEach(() => jest.clearAllMocks());
  it('redacts a configured access token', () => {
    const sdk = new OrbitportSDK({
      config: {
        accessToken: 'header.payload.signature',
        apiUrl: 'https://op-dev.spacecomputer.io',
      },
    });

    expect(sdk.getConfig()).toMatchObject({
      accessToken: '[REDACTED]',
      clientId: '[REDACTED]',
      clientSecret: '[REDACTED]',
      apiUrl: 'https://op-dev.spacecomputer.io',
    });
  });

  it('exposes key-store methods through the KMS facade', () => {
    const sdk = new OrbitportSDK({
      config: { accessToken: 'header.payload.signature' },
    });

    expect(sdk.kms.keyStore.put).toBeInstanceOf(Function);
    expect(sdk.kms.keyStore.get).toBeInstanceOf(Function);
    expect(sdk.kms.keyStore.list).toBeInstanceOf(Function);
    expect(sdk.kms.keyStore.delete).toBeInstanceOf(Function);
    expect('encapsulate' in sdk.kms).toBe(false);
    expect('decapsulate' in sdk.kms).toBe(false);
  });

  it('switches between OAuth client credentials and a direct access token', async () => {
    const oauthToToken = new OrbitportSDK({
      config: { clientId: 'client-id', clientSecret: 'client-secret' },
    });
    oauthToToken.updateConfig({ accessToken: 'header.payload.signature' });
    await expect(oauthToToken.auth.getValidToken()).resolves.toBe(
      'header.payload.signature',
    );
    expect(fetch).not.toHaveBeenCalled();

    const tokenToOauth = new OrbitportSDK({
      config: { accessToken: 'header.payload.signature' },
    });
    tokenToOauth.updateConfig({
      clientId: 'new-client-id',
      clientSecret: 'new-client-secret',
      authDomain: 'auth.example.com',
      audience: 'https://api.example.com/api',
    });
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'oauth-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    } as unknown as Response);

    await expect(tokenToOauth.auth.getValidToken()).resolves.toBe('oauth-token');
    expect(fetch).toHaveBeenCalledWith(
      'https://auth.example.com/oauth/token',
      expect.any(Object),
    );
  });

  it('applies authentication and API URL updates to KMS and cTRNG services', async () => {
    const sdk = new OrbitportSDK({
      config: { apiUrl: 'https://old.example.com' },
    });
    sdk.updateConfig({
      accessToken: 'header.payload.signature',
      apiUrl: 'https://new.example.com',
    });

    (fetch as jest.Mock).mockImplementationOnce((_url, init?: RequestInit) => {
      const id = JSON.parse(init?.body as string).id;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ jsonrpc: '2.0', id, result: { Schemes: [] } }),
      } as unknown as Response;
    });
    await sdk.kms.getCapabilities();

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ service: 'trng', src: 'trng', data: '42' }),
      headers: { get: () => null },
    } as unknown as Response);
    await sdk.ctrng.random({ src: 'trng' });

    expect((fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://new.example.com/api/v1/rpc',
    );
    expect((fetch as jest.Mock).mock.calls[1][0]).toBe(
      'https://new.example.com/api/v1/services/trng?src=trng',
    );
  });
});
