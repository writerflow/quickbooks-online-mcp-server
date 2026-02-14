import dotenv from "dotenv";
import QuickBooks from "node-quickbooks";
import OAuthClient from "intuit-oauth";
import axios from "axios";
import crypto from "crypto";
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

// Global axios interceptor to capture intuit_tid from all QBO API responses
axios.interceptors.response.use(
  (response) => {
    const intuitTid = response.headers?.['intuit_tid'];
    if (intuitTid) {
      console.error(`[QBO] intuit_tid=${intuitTid} ${response.config?.method?.toUpperCase()} ${response.config?.url}`);
    }
    return response;
  },
  (error) => {
    const intuitTid = error.response?.headers?.['intuit_tid'];
    if (intuitTid) {
      console.error(`[QBO] intuit_tid=${intuitTid} ERROR ${error.response?.status} ${error.config?.method?.toUpperCase()} ${error.config?.url}`);
    }
    return Promise.reject(error);
  }
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
const client_id = process.env.QUICKBOOKS_CLIENT_ID;
const client_secret = process.env.QUICKBOOKS_CLIENT_SECRET;
const refresh_token = process.env.QUICKBOOKS_REFRESH_TOKEN;
const realm_id = process.env.QUICKBOOKS_REALM_ID;
const environment = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';
const redirect_uri = 'http://localhost:8000/callback';

const DISCOVERY_URL = 'https://developer.intuit.com/.well-known/openid_configuration';
const TOKEN_EXPIRY_BUFFER_SECONDS = 60;
const MAX_REFRESH_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// Only throw error if client_id or client_secret is missing
if (!client_id || !client_secret || !redirect_uri) {
  throw Error("Client ID, Client Secret and Redirect URI must be set in environment variables");
}

interface DiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  userinfo_endpoint?: string;
}

class QuickbooksClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private refreshToken?: string;
  private realmId?: string;
  private readonly environment: string;
  private accessToken?: string;
  private accessTokenExpiry?: Date;
  private quickbooksInstance?: QuickBooks;
  private oauthClient: OAuthClient;
  private isAuthenticating: boolean = false;
  private redirectUri: string;
  private discoveryDocument?: DiscoveryDocument;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
    realmId?: string;
    environment: string;
    redirectUri: string;
  }) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.refreshToken = config.refreshToken;
    this.realmId = config.realmId;
    this.environment = config.environment;
    this.redirectUri = config.redirectUri;
    this.oauthClient = new OAuthClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      environment: this.environment,
      redirectUri: this.redirectUri,
    });
  }

  private async fetchDiscoveryDocument(): Promise<void> {
    if (this.discoveryDocument) return;

    try {
      const response = await fetch(DISCOVERY_URL);
      if (!response.ok) {
        throw new Error(`Discovery fetch failed: ${response.status}`);
      }
      const doc = await response.json() as DiscoveryDocument;
      this.discoveryDocument = doc;

      this.oauthClient.setAuthorizeURLs({
        authorize_endpoint: doc.authorization_endpoint,
        token_endpoint: doc.token_endpoint,
        revoke_endpoint: doc.revocation_endpoint,
        userinfo_endpoint: doc.userinfo_endpoint,
      });
    } catch (error) {
      // Fall back to SDK defaults — log but don't fail
      console.error('Failed to fetch discovery document, using SDK defaults:', error);
    }
  }

  private async startOAuthFlow(): Promise<void> {
    if (this.isAuthenticating) {
      return;
    }

    this.isAuthenticating = true;
    const port = 8000;

    await this.fetchDiscoveryDocument();

    const csrfState = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      // Create temporary server for OAuth callback
      const server = http.createServer(async (req, res) => {
        if (req.url?.startsWith('/callback')) {
          try {
            // Validate CSRF state before exchanging code
            const callbackUrl = new URL(req.url, `http://localhost:${port}`);
            const returnedState = callbackUrl.searchParams.get('state');
            if (returnedState !== csrfState) {
              res.writeHead(403, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background-color: #fff0f0;
                  ">
                    <h2 style="color: #d32f2f;">CSRF validation failed</h2>
                    <p>OAuth state mismatch. Please try connecting again.</p>
                  </body>
                </html>
              `);
              setTimeout(() => {
                server.close();
                this.isAuthenticating = false;
                reject(new Error('OAuth CSRF state mismatch'));
              }, 1000);
              return;
            }

            const response = await this.oauthClient.createToken(req.url);
            const tokens = response.token;

            // Save tokens
            this.refreshToken = tokens.refresh_token;
            this.realmId = tokens.realmId;
            this.accessToken = tokens.access_token;
            this.accessTokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
            this.saveTokensToEnv();

            // Send success response
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  font-family: Arial, sans-serif;
                  background-color: #f5f5f5;
                ">
                  <h2 style="color: #2E8B57;">&#10003; Successfully connected to QuickBooks!</h2>
                  <p>You can close this window now.</p>
                </body>
              </html>
            `);

            // Close server after a short delay
            setTimeout(() => {
              server.close();
              this.isAuthenticating = false;
              resolve();
            }, 1000);
          } catch (error) {
            console.error('Error during token creation:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  font-family: Arial, sans-serif;
                  background-color: #fff0f0;
                ">
                  <h2 style="color: #d32f2f;">Error connecting to QuickBooks</h2>
                  <p>Please check the console for more details.</p>
                </body>
              </html>
            `);
            this.isAuthenticating = false;
            reject(error);
          }
        }
      });

      // Start server
      server.listen(port, async () => {

        // Generate authorization URL with CSRF-safe state
        const authUri = this.oauthClient.authorizeUri({
          scope: [OAuthClient.scopes.Accounting as string],
          state: csrfState,
        });

        // Open browser automatically
        await open(authUri);
      });

      // Handle server errors
      server.on('error', (error) => {
        console.error('Server error:', error);
        this.isAuthenticating = false;
        reject(error);
      });
    });
  }

  private saveTokensToEnv(): void {
    const tokenPath = path.join(__dirname, '..', '..', '.env');
    const envContent = fs.readFileSync(tokenPath, 'utf-8');
    const envLines = envContent.split('\n');

    const updateEnvVar = (name: string, value: string) => {
      const index = envLines.findIndex(line => line.startsWith(`${name}=`));
      if (index !== -1) {
        envLines[index] = `${name}=${value}`;
      } else {
        envLines.push(`${name}=${value}`);
      }
    };

    if (this.refreshToken) updateEnvVar('QUICKBOOKS_REFRESH_TOKEN', this.refreshToken);
    if (this.realmId) updateEnvVar('QUICKBOOKS_REALM_ID', this.realmId);

    fs.writeFileSync(tokenPath, envLines.join('\n'));
  }

  private extractErrorCode(error: any): string | undefined {
    // intuit-oauth SDK wraps errors in various shapes
    if (typeof error === 'string') return error;
    if (error?.error) return this.extractErrorCode(error.error);
    if (error?.authResponse?.json?.error) return error.authResponse.json.error;
    if (error?.intuit_tid) return error.error; // SDK error shape
    if (error?.originalMessage) return error.originalMessage;
    return error?.message;
  }

  private clearTokenState(): void {
    this.accessToken = undefined;
    this.accessTokenExpiry = undefined;
    this.refreshToken = undefined;
    this.quickbooksInstance = undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      await this.startOAuthFlow();

      // Verify we have a refresh token after OAuth flow
      if (!this.refreshToken) {
        throw new Error('Failed to obtain refresh token from OAuth flow');
      }
    }

    let lastError: any;

    for (let attempt = 0; attempt < MAX_REFRESH_RETRIES; attempt++) {
      try {
        const authResponse = await this.oauthClient.refreshUsingToken(this.refreshToken!);

        this.accessToken = authResponse.token.access_token;

        // Persist rotated refresh token if returned
        if (authResponse.token.refresh_token) {
          this.refreshToken = authResponse.token.refresh_token;
          this.saveTokensToEnv();
        }

        // Calculate expiry time
        const expiresIn = authResponse.token.expires_in || 3600;
        this.accessTokenExpiry = new Date(Date.now() + expiresIn * 1000);

        return {
          access_token: this.accessToken,
          expires_in: expiresIn,
        };
      } catch (error: any) {
        lastError = error;
        const errorCode = this.extractErrorCode(error);

        // invalid_grant means refresh token is expired/revoked — no point retrying
        if (errorCode === 'invalid_grant') {
          console.error('Refresh token is invalid/expired. Starting new OAuth flow...');
          this.clearTokenState();
          await this.startOAuthFlow();

          if (!this.refreshToken) {
            throw new Error('Failed to obtain refresh token from OAuth flow');
          }

          // After a fresh OAuth flow, tokens are already set — return them
          return {
            access_token: this.accessToken!,
            expires_in: this.accessTokenExpiry
              ? Math.floor((this.accessTokenExpiry.getTime() - Date.now()) / 1000)
              : 3600,
          };
        }

        // For transient errors, retry with exponential backoff
        if (attempt < MAX_REFRESH_RETRIES - 1) {
          const backoff = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          console.error(`Token refresh attempt ${attempt + 1} failed, retrying in ${backoff}ms...`);
          await this.delay(backoff);
        }
      }
    }

    throw new Error(`Failed to refresh Quickbooks token after ${MAX_REFRESH_RETRIES} attempts: ${lastError?.message}`);
  }

  async authenticate() {
    await this.fetchDiscoveryDocument();

    if (!this.refreshToken || !this.realmId) {
      await this.startOAuthFlow();

      // Verify we have both tokens after OAuth flow
      if (!this.refreshToken || !this.realmId) {
        throw new Error('Failed to obtain required tokens from OAuth flow');
      }
    }

    // Refresh token if missing, expired, or within the expiry buffer
    const now = new Date();
    const bufferMs = TOKEN_EXPIRY_BUFFER_SECONDS * 1000;
    if (!this.accessToken || !this.accessTokenExpiry || this.accessTokenExpiry.getTime() - bufferMs <= now.getTime()) {
      const tokenResponse = await this.refreshAccessToken();
      this.accessToken = tokenResponse.access_token;
    }

    // At this point we know all tokens are available
    this.quickbooksInstance = new QuickBooks(
      this.clientId,
      this.clientSecret,
      this.accessToken,
      false, // no token secret for OAuth 2.0
      this.realmId!, // Safe to use ! here as we checked above
      this.environment === 'sandbox', // use the sandbox?
      false, // debug?
      null, // minor version
      '2.0', // oauth version
      this.refreshToken
    );

    return this.quickbooksInstance;
  }

  getQuickbooks() {
    if (!this.quickbooksInstance) {
      throw new Error('Quickbooks not authenticated. Call authenticate() first');
    }
    return this.quickbooksInstance;
  }

  async disconnect(): Promise<void> {
    if (!this.refreshToken) {
      this.clearTokenState();
      return;
    }

    try {
      await this.oauthClient.revoke({ token: this.refreshToken });
    } catch (error) {
      console.error('Error revoking token (clearing local state anyway):', error);
    }

    this.clearTokenState();
  }
}

export const quickbooksClient = new QuickbooksClient({
  clientId: client_id,
  clientSecret: client_secret,
  refreshToken: refresh_token,
  realmId: realm_id,
  environment: environment,
  redirectUri: redirect_uri,
});
