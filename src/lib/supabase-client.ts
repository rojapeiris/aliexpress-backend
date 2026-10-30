/**
 * Supabase Client & Database Services for Cloudflare Workers
 * Uses native fetch and Web Crypto API. Zero heavy external dependencies.
 */

export interface SupabaseConfig {
	url?: string;
	key?: string;
}

export interface AppSessionRecord {
	id: string;
	token_hash: string;
	phone: string;
	expires_at: string;
	created_at: string;
}

export interface ProfileRecord {
	id: string;
	phone: string;
	full_name?: string | null;
	email?: string | null;
	avatar_url?: string | null;
	address_line1?: string | null;
	address_line2?: string | null;
	city?: string | null;
	state_province?: string | null;
	postal_code?: string | null;
	country?: string;
	created_at?: string;
	updated_at?: string;
}

/**
 * Computes uppercase SHA-256 hash of a string using Web Crypto API
 */
export async function hashToken(rawToken: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(rawToken);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Generates a cryptographically secure random session token
 */
export function generateSessionToken(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Lightweight Supabase PostgREST Client
 */
export class SupabaseClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;

	constructor(config: SupabaseConfig) {
		this.baseUrl = (config.url || "").replace(/\/+$/, "");
		this.apiKey = config.key || "";
	}

	public isConfigured(): boolean {
		return Boolean(this.baseUrl && this.apiKey);
	}

	private getHeaders(): Record<string, string> {
		return {
			apikey: this.apiKey,
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
			Accept: "application/json",
			Prefer: "return=representation",
		};
	}

	/**
	 * Generic query runner against Supabase PostgREST endpoint
	 */
	async rest<T = unknown>(
		table: string,
		options: {
			method?: "GET" | "POST" | "PATCH" | "DELETE";
			params?: Record<string, string>;
			body?: unknown;
			headers?: Record<string, string>;
		} = {}
	): Promise<{ data: T | null; error: string | null; status: number }> {
		if (!this.isConfigured()) {
			return {
				data: null,
				error: "Supabase credentials (SUPABASE_URL and SUPABASE_KEY) are not configured.",
				status: 500,
			};
		}

		const method = options.method || "GET";
		let url = `${this.baseUrl}/rest/v1/${table}`;

		if (options.params && Object.keys(options.params).length > 0) {
			const query = new URLSearchParams(options.params);
			url += `?${query.toString()}`;
		}

		try {
			const response = await fetch(url, {
				method,
				headers: {
					...this.getHeaders(),
					...(options.headers || {}),
				},
				body: options.body ? JSON.stringify(options.body) : undefined,
			});

			const status = response.status;
			const text = await response.text();
			let data: T | null = null;

			try {
				data = text ? (JSON.parse(text) as T) : null;
			} catch {
				data = null;
			}

			if (!response.ok) {
				const errMsg =
					(data as { message?: string })?.message ||
					`Supabase error HTTP ${status}: ${text.substring(0, 200)}`;
				return { data: null, error: errMsg, status };
			}

			return { data, error: null, status };
		} catch (err) {
			return {
				data: null,
				error: err instanceof Error ? err.message : "Unknown Supabase network error",
				status: 500,
			};
		}
	}

	/**
	 * Upserts a user profile by phone number
	 */
	async ensureProfile(phone: string, fullName?: string): Promise<ProfileRecord | null> {
		// First check if profile exists
		const { data: existing } = await this.rest<ProfileRecord[]>("profiles", {
			method: "GET",
			params: {
				phone: `eq.${phone}`,
				select: "*",
				limit: "1",
			},
		});

		if (existing && existing.length > 0) {
			return existing[0];
		}

		// Insert new profile
		const { data: created, error } = await this.rest<ProfileRecord[]>("profiles", {
			method: "POST",
			body: {
				phone,
				full_name: fullName || null,
			},
		});

		if (error || !created || created.length === 0) {
			console.warn("[Supabase] Failed to create profile:", error);
			return null;
		}

		return created[0];
	}

	/**
	 * Creates an app_session record
	 * Fields: id, token_hash, phone, expires_at, created_at
	 */
	async createAppSession(params: {
		tokenHash: string;
		phone: string;
		expiresAt: Date;
	}): Promise<{ session: AppSessionRecord | null; error: string | null }> {
		// 1. Ensure profile exists so foreign key is satisfied
		await this.ensureProfile(params.phone);

		const sessionId = crypto.randomUUID();
		const now = new Date().toISOString();
		const expiresAtIso = params.expiresAt.toISOString();

		const payload = {
			id: sessionId,
			token_hash: params.tokenHash,
			phone: params.phone,
			expires_at: expiresAtIso,
			created_at: now,
		};

		const { data, error } = await this.rest<AppSessionRecord[]>("app_sessions", {
			method: "POST",
			body: payload,
		});

		if (error) {
			return { session: null, error };
		}

		const created = data && data.length > 0 ? data[0] : payload;
		return { session: created, error: null };
	}

	/**
	 * Retrieves an active session by token hash
	 */
	async findSessionByTokenHash(tokenHash: string): Promise<AppSessionRecord | null> {
		const nowIso = new Date().toISOString();
		const { data, error } = await this.rest<AppSessionRecord[]>("app_sessions", {
			method: "GET",
			params: {
				token_hash: `eq.${tokenHash}`,
				expires_at: `gt.${nowIso}`,
				select: "*",
				limit: "1",
			},
		});

		if (error || !data || data.length === 0) {
			return null;
		}

		return data[0];
	}

	/**
	 * Deletes a session by token hash (logout)
	 */
	async deleteSession(tokenHash: string): Promise<boolean> {
		const { error } = await this.rest("app_sessions", {
			method: "DELETE",
			params: {
				token_hash: `eq.${tokenHash}`,
			},
		});

		return !error;
	}

	/**
	 * Get full profile by phone
	 */
	async getProfileByPhone(phone: string): Promise<ProfileRecord | null> {
		const { data } = await this.rest<ProfileRecord[]>("profiles", {
			method: "GET",
			params: {
				phone: `eq.${phone}`,
				select: "*",
				limit: "1",
			},
		});

		if (!data || data.length === 0) return null;
		return data[0];
	}
}

