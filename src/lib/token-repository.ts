import { callAuthApi, AliExpressClientConfig } from "./aliexpress-client";

export interface TokenRecord {
	id?: number;
	user_id: string;
	seller_id?: string;
	account?: string;
	user_nick?: string;
	access_token: string;
	refresh_token: string;
	access_token_expires_at: number;
	refresh_token_expires_at: number;
	created_at?: string;
	updated_at?: string;
}

interface RefreshTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: string | number;
	refresh_token_valid_time: string | number;
	user_id?: string;
	seller_id?: string;
	user_nick?: string;
	account?: string;
}

export class TokenRepository {
	constructor(private readonly db: D1Database) {}

	async upsert(token: Omit<TokenRecord, "id" | "created_at" | "updated_at">): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO aliexpress_tokens
					(user_id, seller_id, account, user_nick, access_token, refresh_token,
					 access_token_expires_at, refresh_token_expires_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
				ON CONFLICT(user_id) DO UPDATE SET
					seller_id                  = excluded.seller_id,
					account                    = excluded.account,
					user_nick                  = excluded.user_nick,
					access_token               = excluded.access_token,
					refresh_token              = excluded.refresh_token,
					access_token_expires_at    = excluded.access_token_expires_at,
					refresh_token_expires_at   = excluded.refresh_token_expires_at,
					updated_at                 = CURRENT_TIMESTAMP`
			)
			.bind(
				token.user_id,
				token.seller_id ?? null,
				token.account ?? null,
				token.user_nick ?? null,
				token.access_token,
				token.refresh_token,
				token.access_token_expires_at,
				token.refresh_token_expires_at
			)
			.run();
	}

	async findByUserId(userId: string): Promise<TokenRecord | null> {
		const result = await this.db
			.prepare("SELECT * FROM aliexpress_tokens WHERE user_id = ?")
			.bind(userId)
			.first<TokenRecord>();
		return result ?? null;
	}

	async getLatestToken(): Promise<TokenRecord | null> {
		const result = await this.db
			.prepare("SELECT * FROM aliexpress_tokens ORDER BY updated_at DESC LIMIT 1")
			.first<TokenRecord>();
		return result ?? null;
	}

	async findAll(): Promise<TokenRecord[]> {
		const result = await this.db
			.prepare("SELECT * FROM aliexpress_tokens ORDER BY updated_at DESC")
			.all<TokenRecord>();
		return result.results;
	}

	async delete(userId: string): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM aliexpress_tokens WHERE user_id = ?")
			.bind(userId)
			.run();
		return (result.meta.changes ?? 0) > 0;
	}

	/**
	 * Returns true if the access token is expired (with 60s buffer).
	 */
	isAccessTokenExpired(token: TokenRecord): boolean {
		return Date.now() >= token.access_token_expires_at - 60_000;
	}

	/**
	 * Returns true if the refresh token is expired.
	 */
	isRefreshTokenExpired(token: TokenRecord): boolean {
		return Date.now() >= token.refresh_token_expires_at;
	}

	/**
	 * Automatically retrieves a valid access token:
	 * 1. Checks if stored access token is still active (with 60s buffer).
	 * 2. If expired, automatically uses the refresh_token to call AliExpress OAuth refresh API.
	 * 3. Persists the new token pair in D1.
	 * 4. Returns the active access token seamlessly.
	 */
	async getValidAccessToken(
		userId?: string,
		config?: AliExpressClientConfig
	): Promise<string | undefined> {
		const record = userId ? await this.findByUserId(userId) : await this.getLatestToken();
		if (!record) return undefined;

		// 1. If still valid, return immediately
		if (!this.isAccessTokenExpired(record)) {
			return record.access_token;
		}

		// 2. If refresh_token is also expired, cannot auto-refresh (user must re-authorize)
		if (this.isRefreshTokenExpired(record)) {
			console.warn(`[Token] Both access and refresh tokens expired for user: ${record.user_id}`);
			return undefined;
		}

		// 3. Auto-refresh with AliExpress
		try {
			console.log(`[Token] Access token expired. Auto-refreshing for user: ${record.user_id}...`);
			const apiResult = await callAuthApi<RefreshTokenResponse>(
				config,
				"/auth/token/refresh",
				{ refresh_token: record.refresh_token }
			);

			if (apiResult.success && apiResult.data) {
				const data = apiResult.data;
				const now = Date.now();
				const expiresInSeconds = Number(data.expires_in) || 86400;
				const accessTokenExpiresAt = now + expiresInSeconds * 1000;

				let refreshTokenExpiresAt = Number(data.refresh_token_valid_time) || 0;
				if (refreshTokenExpiresAt > 0 && refreshTokenExpiresAt < 10000000000) {
					refreshTokenExpiresAt *= 1000;
				}
				if (refreshTokenExpiresAt === 0) {
					refreshTokenExpiresAt = now + 30 * 24 * 3600 * 1000;
				}

				const newAccessToken = data.access_token;
				const newRefreshToken = data.refresh_token || record.refresh_token;

				await this.upsert({
					user_id: record.user_id,
					seller_id: record.seller_id ?? data.seller_id,
					account: record.account ?? data.account,
					user_nick: record.user_nick ?? data.user_nick,
					access_token: newAccessToken,
					refresh_token: newRefreshToken,
					access_token_expires_at: accessTokenExpiresAt,
					refresh_token_expires_at: refreshTokenExpiresAt,
				});

				console.log(`[Token] Auto-refresh completed successfully for user: ${record.user_id}`);
				return newAccessToken;
			}
		} catch (err) {
			console.error(`[Token] Auto-refresh failed:`, err);
		}

		return undefined;
	}
}
