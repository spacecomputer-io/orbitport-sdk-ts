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

  it('updates a configured access token without a network request', async () => {
    const sdk = new OrbitportSDK({ config: { accessToken: 'old-token' } });
    sdk.updateConfig({ accessToken: 'new-token' });
    await expect(sdk.auth.getValidToken()).resolves.toBe('new-token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('applies authentication and API URL updates to the KMS service', async () => {
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

    expect((fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://new.example.com/api/v1/rpc',
    );
  });
});
