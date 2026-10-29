import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAuthApi, AliExpressClientConfig, ALIEXPRESS_AUTH_URL } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface CreateTokenApiResponse {
	access_token: string;
	refresh_token: string;
	expires_in: string | number;
	refresh_token_valid_time: string | number;
	account?: string;
	seller_id?: string;
	user_id: string;
	user_nick?: string;
	sp?: string;
}

/**
 * GET /aliexpress/auth/callback
 * Direct browser callback handler for AliExpress OAuth redirect.
 * Automatically exchanges the returned `code` query parameter for an access_token,
 * saves it to D1, and displays a friendly HTML success confirmation.
 */
export class AliExpressAuthCallback extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Token Management"],
		summary: "OAuth redirect callback handler",
		description:
			"Receives the redirect from AliExpress with the authorization ?code=... query parameter, automatically exchanges it for an access token, stores it in the D1 database, and returns a confirmation.",
		request: {
			query: z.object({
				code: z.string().describe("The temporary authorization code from AliExpress"),
				state: z.string().optional().describe("Optional state parameter passed during authorize"),
			}),
		},
		responses: {
			"200": {
				description: "Token created and stored successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							message: z.string(),
							user_id: z.string(),
							user_nick: z.string().optional(),
							access_token: z.string(),
							refresh_token: z.string(),
							access_token_expires_at: z.number(),
						}),
					})
				),
			},
			"400": {
				description: "Failed to exchange authorization code",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const code = data.query.code;
		const appKey = c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY;
		const appSecret = c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET;

		const config: AliExpressClientConfig = {
			appKey,
			appSecret,
		};

		// Exchange code for token via POST
		const apiResult = await callAuthApi<CreateTokenApiResponse>(
			config,
			"/auth/token/create",
			{ code }
		);

		if (!apiResult.success || !apiResult.data) {
			const errorMsg = apiResult.error ?? "Failed to retrieve access token from AliExpress";
			const errorCode = apiResult.errorCode ?? "";
			const currentUrl = new URL(c.req.url);
			const retryAuthUrl = `${ALIEXPRESS_AUTH_URL}?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(
				`${currentUrl.origin}/aliexpress/auth/callback`
			)}&client_id=${appKey}`;

			const acceptsHtml = c.req.header("Accept")?.includes("text/html") ?? true;

			if (acceptsHtml) {
				return c.html(
					`<!DOCTYPE html>
					<html>
					<head>
						<title>AliExpress Authorization</title>
						<meta name="viewport" content="width=device-width, initial-scale=1">
						<style>
							body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #fdf2f2; color: #991b1b; max-width: 600px; margin: 0 auto; }
							.card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #fecaca; }
							.badge { display: inline-block; padding: 4px 12px; background: #fee2e2; color: #991b1b; border-radius: 9999px; font-weight: 600; font-size: 14px; margin-bottom: 12px; }
							h2 { margin-top: 0; color: #7f1d1d; }
							p { color: #475569; line-height: 1.5; }
							.err-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; font-family: monospace; color: #b91c1c; word-break: break-all; }
							.btn { display: inline-block; background: #e11d48; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 12px; }
						</style>
					</head>
					<body>
						<div class="card">
							<span class="badge">Authorization Status</span>
							<h2>AliExpress Response Details</h2>
							<p>AliExpress returned the following message when exchanging the authorization code:</p>
							<div class="err-box">${errorMsg} ${errorCode ? `(Code: ${errorCode})` : ""}</div>
							<p><small>Note: AliExpress authorization codes expire within ~3 minutes and can only be exchanged once. If expired, please authorize again:</small></p>
							<a href="${retryAuthUrl}" class="btn">Retry Authorization</a>
						</div>
					</body>
					</html>`,
					400
				);
			}

			return c.json({ success: false, error: errorMsg, errorCode }, 400);
		}

		const tokenData = apiResult.data;
		const now = Date.now();
		const expiresInSeconds = Number(tokenData.expires_in) || 86400;
		const accessTokenExpiresAt = now + expiresInSeconds * 1000;

		let refreshTokenExpiresAt = Number(tokenData.refresh_token_valid_time) || 0;
		if (refreshTokenExpiresAt > 0 && refreshTokenExpiresAt < 10000000000) {
			refreshTokenExpiresAt *= 1000;
		}
		if (refreshTokenExpiresAt === 0) {
			refreshTokenExpiresAt = now + 30 * 24 * 3600 * 1000;
		}

		const userId = data.query.state || String(tokenData.user_id || tokenData.seller_id || "default_seller");

		// Persist to D1
		const repo = new TokenRepository(c.env.DB);
		await repo.upsert({
			user_id: userId,
			seller_id: tokenData.seller_id ? String(tokenData.seller_id) : undefined,
			account: tokenData.account,
			user_nick: tokenData.user_nick,
			access_token: tokenData.access_token,
			refresh_token: tokenData.refresh_token,
			access_token_expires_at: accessTokenExpiresAt,
			refresh_token_expires_at: refreshTokenExpiresAt,
		});

		const acceptsHtml = c.req.header("Accept")?.includes("text/html") ?? true;
		if (acceptsHtml) {
			return c.html(
				`<!DOCTYPE html>
				<html>
				<head>
					<title>AliExpress Authorization Successful</title>
					<meta name="viewport" content="width=device-width, initial-scale=1">
					<style>
						body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #f8fafc; color: #1e293b; max-width: 600px; margin: 0 auto; }
						.card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid #e2e8f0; }
						.badge { display: inline-block; padding: 4px 12px; background: #dcfce7; color: #166534; border-radius: 9999px; font-weight: 600; font-size: 14px; margin-bottom: 12px; }
						h2 { margin-top: 0; color: #0f172a; }
						.field { margin: 12px 0; word-break: break-all; }
						.field strong { display: block; font-size: 12px; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
						.field span { font-family: monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; display: inline-block; }
					</style>
				</head>
				<body>
					<div class="card">
						<span class="badge">✓ Connected Successfully</span>
						<h2>AliExpress Token Saved</h2>
						<p>Your AliExpress account has been authorized and the token is stored in your Cloudflare D1 database.</p>
						<div class="field"><strong>User / Seller ID:</strong> <span>${userId}</span></div>
						${tokenData.user_nick ? `<div class="field"><strong>Nick / Store:</strong> <span>${tokenData.user_nick}</span></div>` : ""}
						<div class="field"><strong>Access Token:</strong> <span>${tokenData.access_token.substring(0, 10)}...${tokenData.access_token.slice(-6)}</span></div>
						<div class="field"><strong>Expires In:</strong> <span>${Math.round(expiresInSeconds / 3600)} hours</span></div>
					</div>
				</body>
				</html>`,
				200
			);
		}

		return c.json({
			success: true,
			result: {
				message: "Token retrieved and saved successfully to D1 database",
				user_id: userId,
				user_nick: tokenData.user_nick,
				access_token: tokenData.access_token,
				refresh_token: tokenData.refresh_token,
				access_token_expires_at: accessTokenExpiresAt,
			},
		});
	}
}
