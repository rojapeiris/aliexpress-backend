/**
 * AliExpress Token Repository
 * Manages token persistence in Cloudflare D1.
 */

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
}
