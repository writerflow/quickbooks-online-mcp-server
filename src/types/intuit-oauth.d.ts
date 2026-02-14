declare module 'intuit-oauth' {
  export default class OAuthClient {
    constructor(options: {
      clientId: string;
      clientSecret: string;
      environment: string;
      redirectUri: string;
    });

    static scopes: {
      Accounting: string;
      Payment: string;
      Payroll: string;
      TimeTracking: string;
      Benefits: string;
      Profile: string;
      Email: string;
      Phone: string;
      Address: string;
      OpenId: string;
    };

    authorizeUri(options: {
      scope: string[];
      state: string;
    }): string;

    createToken(url: string): Promise<{
      token: {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        realmId: string;
      }
    }>;

    refreshToken(): Promise<any>;
    refreshUsingToken(refreshToken: string): Promise<{
      token: {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }
    }>;
    revoke(options: { token: string }): Promise<any>;
    isAccessTokenValid(): boolean;
    setAuthorizeURLs(params: {
      authorize_endpoint: string;
      token_endpoint: string;
      revoke_endpoint: string;
      userinfo_endpoint?: string;
    }): void;
  }
}
