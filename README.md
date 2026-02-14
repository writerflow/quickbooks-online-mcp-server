# QuickBooks Online MCP Server

A Model Context Protocol (MCP) server for QuickBooks Online integration. Provides CRUD tools for all major QBO entities via the MCP tool interface.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory (see `.env.example`):
```env
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_ENVIRONMENT=sandbox
QUICKBOOKS_REDIRECT_URI=http://localhost:8000/callback
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QUICKBOOKS_CLIENT_ID` | Yes | — | OAuth client ID from Intuit Developer Portal |
| `QUICKBOOKS_CLIENT_SECRET` | Yes | — | OAuth client secret |
| `QUICKBOOKS_ENVIRONMENT` | No | `sandbox` | `sandbox` or `production` |
| `QUICKBOOKS_REDIRECT_URI` | No | `http://localhost:8000/callback` | OAuth redirect URI (must match Intuit app config) |
| `QUICKBOOKS_REFRESH_TOKEN` | No | — | Saved automatically after OAuth flow |
| `QUICKBOOKS_REALM_ID` | No | — | Saved automatically after OAuth flow |

3. Get your Client ID and Client Secret:
   - Go to the [Intuit Developer Portal](https://developer.intuit.com/)
   - Create a new app or select an existing one
   - Get the Client ID and Client Secret from the app's keys section
   - Add your redirect URI to the app's Redirect URIs list

## Authentication

### Option 1: Standalone Auth (recommended for first-time setup)

```bash
npm run auth
```

This runs an interactive OAuth flow that opens your browser, authenticates with QuickBooks, and saves tokens to `.env`.

### Option 2: Automatic via MCP

If no refresh token is present when the server starts and a tool is called, it will automatically launch the OAuth flow. Tokens are saved to `.env` on success.

### Option 3: Manual Environment Variables

If you already have a refresh token and realm ID, add them to `.env`:
```env
QUICKBOOKS_REFRESH_TOKEN=your_refresh_token
QUICKBOOKS_REALM_ID=your_realm_id
```

### Token Lifecycle

- Access tokens expire after ~1 hour. The server refreshes automatically with a 60-second buffer.
- Refresh tokens are rotated on each refresh and persisted to `.env`.
- If a refresh token is expired or revoked, the server falls back to the full OAuth flow.
- Failed refreshes retry up to 3 times with exponential backoff.
- OAuth endpoints are fetched from Intuit's discovery document (`/.well-known/openid_configuration`).

## Available Tools

CRUD operations for the following QBO entities:

| Entity | Create | Read/Get | Update | Delete | Search |
|--------|--------|----------|--------|--------|--------|
| Account | Yes | — | Yes | — | Yes |
| Bill | Yes | Yes | Yes | Yes | Yes |
| Bill Payment | Yes | Yes | Yes | Yes | Yes |
| Customer | Yes | Yes | Yes | Yes | Yes |
| Employee | Yes | Yes | Yes | — | Yes |
| Estimate | Yes | Yes | Yes | Yes | Yes |
| Invoice | Yes | Yes | Yes | — | Yes |
| Item | Yes | Yes | Yes | — | Yes |
| Journal Entry | Yes | Yes | Yes | Yes | Yes |
| Purchase | Yes | Yes | Yes | Yes | Yes |
| Vendor | Yes | Yes | Yes | Yes | Yes |

Additional tools:
- **`disconnect_quickbooks`** — Revokes the current access token and clears local token state. A new OAuth flow will be required on next API call.

## Error Handling

- All errors include `intuit_tid` when available (for Intuit support troubleshooting)
- Token refresh failures fall back to full OAuth re-authentication
- CSRF state validation on OAuth callbacks (rejects mismatched state with 403)

If you see "QuickBooks not connected":
1. Check that `.env` contains `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET`
2. Run `npm run auth` to re-authenticate
