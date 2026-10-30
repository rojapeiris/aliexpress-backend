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
	subscriber_id?: string | null;
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

export interface ShippingAddress {
	full_name?: string;
	phone?: string;
	address_line1?: string;
	address_line2?: string;
	city?: string;
	state_province?: string;
	postal_code?: string;
	country?: string;
}

export interface OrderItemRecord {
	id?: string;
	order_id?: string;
	product_id: string;
	product_title: string;
	product_image?: string | null;
	product_detail_url?: string | null;
	sku_id?: string | null;
	sku_properties?: string | null;
	unit_price: number;
	quantity: number;
	total_price: number;
	currency?: string;
	created_at?: string;
}

export interface OrderRecord {
	id: string;
	order_number: string;
	user_phone: string;
	status: string; // 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
	total_amount: number;
	currency: string;
	payment_method?: string | null;
	payment_status: string; // 'pending' | 'completed' | 'failed' | 'refunded'
	payment_reference?: string | null;
	shipping_address: ShippingAddress;
	aliexpress_order_id?: string | null;
	tracking_number?: string | null;
	notes?: string | null;
	created_at: string;
	updated_at: string;
}

export interface OrderWithItemsRecord extends OrderRecord {
	items: OrderItemRecord[];
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
		return Boolean(
			this.baseUrl &&
			this.apiKey &&
			!this.baseUrl.includes("your-project-ref") &&
			!this.apiKey.includes("your-supabase")
		);
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
	 * Upserts a user profile by phone number. If profile is not found, creates a new one using phone.
	 * Also saves/updates the subscriber_id received from Ideamart OTP verification.
	 */
	async ensureProfile(
		phone: string,
		fullName?: string,
		subscriberId?: string
	): Promise<ProfileRecord | null> {
		if (!this.isConfigured()) {
			return {
				id: crypto.randomUUID(),
				phone,
				subscriber_id: subscriberId || null,
				full_name: fullName || null,
			};
		}

		// First check if profile already exists
		const { data: existing } = await this.rest<ProfileRecord[]>("profiles", {
			method: "GET",
			params: {
				phone: `eq.${phone}`,
				select: "*",
				limit: "1",
			},
		});

		if (existing && existing.length > 0) {
			const current = existing[0];
			// If subscriber_id is provided and was missing, update it
			if (subscriberId && current.subscriber_id !== subscriberId) {
				await this.rest("profiles", {
					method: "PATCH",
					params: { phone: `eq.${phone}` },
					body: { subscriber_id: subscriberId },
				});
				current.subscriber_id = subscriberId;
			}
			return current;
		}

		// Profile not found: create a new profile using phone and subscriber_id
		const newProfilePayload = {
			id: crypto.randomUUID(),
			phone,
			subscriber_id: subscriberId || null,
			full_name: fullName || null,
		};

		const { data: created, error } = await this.rest<ProfileRecord[]>("profiles", {
			method: "POST",
			body: newProfilePayload,
		});

		if (error || !created || created.length === 0) {
			console.warn("[Supabase] Failed to persist new profile:", error);
			return newProfilePayload;
		}

		return created[0];
	}

	/**
	 * Creates an app_session record
	 * Fields: id, token_hash, phone, expires_at, created_at
	 * Also ensures profile exists (or creates a new profile with phone and subscriber_id).
	 */
	async createAppSession(params: {
		tokenHash: string;
		phone: string;
		expiresAt: Date;
		fullName?: string;
		subscriberId?: string;
	}): Promise<{ session: AppSessionRecord | null; profile: ProfileRecord | null; error: string | null }> {
		// 1. If profile not found, create a new profile using phone & subscriber_id
		const profile = await this.ensureProfile(params.phone, params.fullName, params.subscriberId);

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
			return { session: null, profile, error };
		}

		const created = data && data.length > 0 ? data[0] : payload;
		return { session: created, profile, error: null };
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
		if (!this.isConfigured()) {
			return {
				id: crypto.randomUUID(),
				phone,
				full_name: null,
				country: "LK",
			};
		}

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

	/**
	 * Authenticates incoming request from Bearer Authorization header
	 */
	async authenticateBearer(
		authHeader?: string
	): Promise<{ session: AppSessionRecord | null; profile: ProfileRecord | null; error: string | null }> {
		const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
		if (!token) {
			return { session: null, profile: null, error: "Missing or invalid Authorization header. Expected 'Bearer <token>'." };
		}

		const tokenHash = await hashToken(token);
		const session = await this.findSessionByTokenHash(tokenHash);

		if (!session) {
			// If Supabase is unconfigured (testing/offline mode), accept mock bearer tokens gracefully
			if (!this.isConfigured() && token.length >= 10) {
				const fallbackPhone = "0771234567";
				return {
					session: {
						id: crypto.randomUUID(),
						token_hash: tokenHash,
						phone: fallbackPhone,
						expires_at: new Date(Date.now() + 86400000).toISOString(),
						created_at: new Date().toISOString(),
					},
					profile: {
						id: crypto.randomUUID(),
						phone: fallbackPhone,
						full_name: "Test User",
						country: "LK",
					},
					error: null,
				};
			}

			return { session: null, profile: null, error: "Session is invalid or has expired. Please authenticate with OTP." };
		}

		const profile = await this.getProfileByPhone(session.phone);
		return { session, profile, error: null };
	}

	/**
	 * Updates user profile by phone
	 */
	async updateProfile(
		phone: string,
		updates: Partial<Omit<ProfileRecord, "id" | "phone" | "created_at">>
	): Promise<{ profile: ProfileRecord | null; error: string | null }> {
		if (!this.isConfigured()) {
			return {
				profile: {
					id: crypto.randomUUID(),
					phone,
					...updates,
					updated_at: new Date().toISOString(),
				},
				error: null,
			};
		}

		const payload: Record<string, unknown> = {
			...updates,
			updated_at: new Date().toISOString(),
		};

		const { data, error } = await this.rest<ProfileRecord[]>("profiles", {
			method: "PATCH",
			params: {
				phone: `eq.${phone}`,
				select: "*",
			},
			body: payload,
		});

		if (error || !data || data.length === 0) {
			return { profile: null, error: error || "Failed to update profile." };
		}

		return { profile: data[0], error: null };
	}

	/**
	 * Places a new order and inserts order line items
	 */
	async createOrder(params: {
		userPhone: string;
		items: Omit<OrderItemRecord, "id" | "order_id" | "created_at">[];
		shippingAddress: ShippingAddress;
		paymentMethod?: string;
		notes?: string;
		currency?: string;
	}): Promise<{ order: OrderWithItemsRecord | null; error: string | null }> {
		const orderId = crypto.randomUUID();
		const now = new Date().toISOString();
		const currency = params.currency || "LKR";

		// Compute total amount
		const computedTotal = params.items.reduce((sum, item) => {
			const itemTotal = Number(item.total_price) || Number(item.unit_price) * Number(item.quantity);
			return sum + itemTotal;
		}, 0);

		// Generate clean unique order number: ORD-YYYYMMDD-XXXX
		const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
		const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
		const orderNumber = `ORD-${datePart}-${randPart}`;

		const orderPayload: OrderRecord = {
			id: orderId,
			order_number: orderNumber,
			user_phone: params.userPhone,
			status: "pending",
			total_amount: Math.round(computedTotal * 100) / 100,
			currency,
			payment_method: params.paymentMethod || "cod",
			payment_status: "pending",
			payment_reference: null,
			shipping_address: params.shippingAddress,
			aliexpress_order_id: null,
			tracking_number: null,
			notes: params.notes || null,
			created_at: now,
			updated_at: now,
		};

		const itemsPayload: OrderItemRecord[] = params.items.map((item) => ({
			id: crypto.randomUUID(),
			order_id: orderId,
			product_id: String(item.product_id),
			product_title: item.product_title,
			product_image: item.product_image || null,
			product_detail_url: item.product_detail_url || null,
			sku_id: item.sku_id || null,
			sku_properties: item.sku_properties || null,
			unit_price: Number(item.unit_price),
			quantity: Number(item.quantity) || 1,
			total_price: Number(item.total_price) || Number(item.unit_price) * (Number(item.quantity) || 1),
			currency: item.currency || currency,
			created_at: now,
		}));

		if (!this.isConfigured()) {
			return {
				order: {
					...orderPayload,
					items: itemsPayload,
				},
				error: null,
			};
		}

		// 1. Insert order
		const { data: createdOrder, error: orderError } = await this.rest<OrderRecord[]>("orders", {
			method: "POST",
			body: orderPayload,
		});

		if (orderError || !createdOrder || createdOrder.length === 0) {
			return { order: null, error: orderError || "Failed to create order record." };
		}

		// 2. Insert order items
		const { data: createdItems, error: itemsError } = await this.rest<OrderItemRecord[]>("order_items", {
			method: "POST",
			body: itemsPayload,
		});

		if (itemsError) {
			console.warn("[Supabase] Failed to insert order items:", itemsError);
		}

		const resolvedOrder = createdOrder[0];
		const resolvedItems = createdItems && createdItems.length > 0 ? createdItems : itemsPayload;

		return {
			order: {
				...resolvedOrder,
				items: resolvedItems,
			},
			error: null,
		};
	}

	/**
	 * Retrieves customer orders with line items
	 */
	async getOrdersByPhone(
		phone: string,
		options: { pageNo?: number; pageSize?: number; status?: string } = {}
	): Promise<{ orders: OrderWithItemsRecord[]; total: number; error: string | null }> {
		if (!this.isConfigured()) {
			return { orders: [], total: 0, error: null };
		}

		const pageNo = Math.max(1, options.pageNo || 1);
		const pageSize = Math.min(50, Math.max(1, options.pageSize || 20));
		const offset = (pageNo - 1) * pageSize;

		const params: Record<string, string> = {
			user_phone: `eq.${phone}`,
			order: "created_at.desc",
			limit: String(pageSize),
			offset: String(offset),
			select: "*",
		};

		if (options.status) {
			params.status = `eq.${options.status}`;
		}

		const { data: orders, error: ordersError } = await this.rest<OrderRecord[]>("orders", {
			method: "GET",
			params,
		});

		if (ordersError || !orders) {
			return { orders: [], total: 0, error: ordersError || "Failed to fetch orders." };
		}

		if (orders.length === 0) {
			return { orders: [], total: 0, error: null };
		}

		// Fetch items for these orders
		const orderIds = orders.map((o) => o.id);
		const inClause = `(${orderIds.join(",")})`;
		const { data: items } = await this.rest<OrderItemRecord[]>("order_items", {
			method: "GET",
			params: {
				order_id: `in.${inClause}`,
				select: "*",
			},
		});

		const itemsByOrderId = new Map<string, OrderItemRecord[]>();
		for (const item of items || []) {
			const arr = itemsByOrderId.get(item.order_id!) || [];
			arr.push(item);
			itemsByOrderId.set(item.order_id!, arr);
		}

		const ordersWithItems: OrderWithItemsRecord[] = orders.map((o) => ({
			...o,
			items: itemsByOrderId.get(o.id) || [],
		}));

		return { orders: ordersWithItems, total: orders.length, error: null };
	}

	/**
	 * Retrieves single order details by ID or order_number
	 */
	async getOrderByIdOrNumber(
		phone: string,
		orderIdOrNumber: string
	): Promise<{ order: OrderWithItemsRecord | null; error: string | null }> {
		if (!this.isConfigured()) {
			return { order: null, error: "Supabase not configured." };
		}

		// Try by ID or order_number
		const filter = orderIdOrNumber.includes("-")
			? `user_phone=eq.${phone}&order_number=eq.${orderIdOrNumber}`
			: `user_phone=eq.${phone}&id=eq.${orderIdOrNumber}`;

		const params = Object.fromEntries(new URLSearchParams(filter));
		params.select = "*";
		params.limit = "1";

		const { data: orders, error: orderError } = await this.rest<OrderRecord[]>("orders", {
			method: "GET",
			params,
		});

		if (orderError || !orders || orders.length === 0) {
			return { order: null, error: orderError || "Order not found." };
		}

		const order = orders[0];
		const { data: items } = await this.rest<OrderItemRecord[]>("order_items", {
			method: "GET",
			params: {
				order_id: `eq.${order.id}`,
				select: "*",
			},
		});

		return {
			order: {
				...order,
				items: items || [],
			},
			error: null,
		};
	}
}

