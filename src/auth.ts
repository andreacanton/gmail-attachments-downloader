// OAuth2 authentication module
import { google } from "googleapis";
import type { OAuth2Client, Credentials } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";

interface OAuthCredentials {
  installed: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

// T2.1 - Load OAuth2 credentials from credentials.json
async function loadCredentials(): Promise<OAuthCredentials> {
  const file = Bun.file(CREDENTIALS_PATH);

  if (!(await file.exists())) {
    throw new Error(
      `Missing ${CREDENTIALS_PATH}. Download OAuth 2.0 credentials from Google Cloud Console.`
    );
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as OAuthCredentials;
  } catch (error) {
    throw new Error(
      `Failed to parse ${CREDENTIALS_PATH}. Ensure it contains valid JSON.`
    );
  }
}

// T2.2 - Load cached token from token.json
async function loadCachedToken(): Promise<Credentials | null> {
  const file = Bun.file(TOKEN_PATH);

  if (!(await file.exists())) {
    return null;
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as Credentials;
  } catch {
    return null;
  }
}

// T2.2 - Save token to token.json
async function saveToken(token: Credentials): Promise<void> {
  await Bun.write(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.log(`Token saved to ${TOKEN_PATH}`);
}

// T2.3 - Run OAuth2 authorization flow
async function runAuthFlow(oAuth2Client: OAuth2Client): Promise<Credentials> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("Authorize this app by visiting this URL:");
  console.log(authUrl);
  console.log();

  const code = prompt("Enter the authorization code from that page:");

  if (!code) {
    throw new Error("Authorization code is required.");
  }

  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

// T2.4 - Check if token is expired and refresh if needed
async function refreshTokenIfNeeded(
  oAuth2Client: OAuth2Client,
  token: Credentials
): Promise<Credentials> {
  oAuth2Client.setCredentials(token);

  // Check if token is expired or will expire soon (within 5 minutes)
  const expiryDate = token.expiry_date;
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minutes

  if (expiryDate && expiryDate - now < bufferMs) {
    if (token.refresh_token) {
      console.log("Token expired, refreshing...");
      try {
        const { credentials } = await oAuth2Client.refreshAccessToken();
        // Preserve the refresh_token if the new credentials don't include one
        if (!credentials.refresh_token && token.refresh_token) {
          credentials.refresh_token = token.refresh_token;
        }
        await saveToken(credentials);
        return credentials;
      } catch (error) {
        console.log("Failed to refresh token, re-authorization required.");
        throw error;
      }
    } else {
      throw new Error("Token expired and no refresh token available.");
    }
  }

  return token;
}

// Export internal functions for testing
export { loadCredentials, loadCachedToken, saveToken, refreshTokenIfNeeded };

// T2.5 - Main authorize function
export async function authorize(): Promise<OAuth2Client> {
  const credentials = await loadCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Try to load cached token
  let token = await loadCachedToken();

  if (token) {
    try {
      // Check and refresh if needed
      token = await refreshTokenIfNeeded(oAuth2Client, token);
      oAuth2Client.setCredentials(token);
      return oAuth2Client;
    } catch {
      // Token refresh failed, need to re-authorize
      console.log("Cached token invalid, starting new authorization flow...");
    }
  }

  // No valid token, run auth flow
  token = await runAuthFlow(oAuth2Client);
  await saveToken(token);
  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}
