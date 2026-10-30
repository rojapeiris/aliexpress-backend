/**
 * Supabase Client & Database Services for Cloudflare Workers
 * Uses native fetch and Web Crypto API. Zero heavy external dependencies.
 */
import type { AppContext } from "../types";

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
	 * Retrieves an active session by token hash directly from custom 'app_sessions' table.
	 * Checks expiration in code to avoid database timestamp formatting issues.
	 */
	async findSessionByTokenHash(tokenHash: string): Promise<AppSessionRecord | null> {
		if (!this.isConfigured()) return null;

		const { data, error } = await this.rest<AppSessionRecord[]>("app_sessions", {
			method: "GET",
			params: {
				token_hash: `eq.${tokenHash}`,
				select: "*",
				limit: "1",
			},
		});

		if (error || !data || data.length === 0) {
			return null;
		}

		const session = data[0];

		// Check expiration timestamp
		if (session.expires_at) {
			const expiresMs = new Date(session.expires_at).getTime();
			if (!isNaN(expiresMs) && expiresMs <= Date.now()) {
				return null; // Expired
			}
		}

		return session;
	}

	/**
	 * Finds an active session from 'app_sessions' table.
	 * Tries both the computed SHA-256 hash of the token AND the token string directly,
	 * ensuring sessions work whether the hash or token was saved in token_hash column.
	 */
	async findSessionByToken(token: string): Promise<AppSessionRecord | null> {
		if (!this.isConfigured() || !token) return null;

		// 1. Try matching SHA-256 hash
		const tokenHash = await hashToken(token);
		let session = await this.findSessionByTokenHash(tokenHash);
		if (session) return session;

		// 2. Fallback: Try matching raw token in token_hash
		if (token !== tokenHash) {
			session = await this.findSessionByTokenHash(token);
			if (session) return session;
		}

		return null;
	}

	/**
	 * Deletes a session by token or token hash (logout)
	 */
	async deleteSession(tokenOrHash: string): Promise<boolean> {
		if (!this.isConfigured() || !tokenOrHash) return true;

		const tokenHash = await hashToken(tokenOrHash);

		// Delete by computed hash
		const { error: err1 } = await this.rest("app_sessions", {
			method: "DELETE",
			params: {
				token_hash: `eq.${tokenHash}`,
			},
		});

		// Also try deleting by raw string if different
		if (tokenOrHash !== tokenHash) {
			await this.rest("app_sessions", {
				method: "DELETE",
				params: {
					token_hash: `eq.${tokenOrHash}`,
				},
			});
		}

		return !err1;
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
	 * Resolves user profile and session from the token sent in headers.
	 * 
	 * NOTE: This is NOT Supabase's built-in Auth (GoTrue/JWT).
	 * This verifies the custom session token created during Ideamart OTP verification
	 * against the 'app_sessions' table and joins to 'profiles'.
	 */
	async getUserFromToken(
		authHeaderOrToken?: string
	): Promise<{ session: AppSessionRecord | null; profile: ProfileRecord | null; error: string | null }> {
		const token = (authHeaderOrToken || "").replace(/^Bearer\s+/i, "").trim();
		if (!token) {
			return {
				session: null,
				profile: null,
				error: "Missing or invalid Authorization header. Expected 'Bearer <token>'.",
			};
		}

		// 1. Look up session in custom app_sessions table
		const session = await this.findSessionByToken(token);

		if (!session) {
			// If Supabase is unconfigured (testing/offline mode), accept mock bearer tokens gracefully
			if (!this.isConfigured() && token.length >= 10) {
				const fallbackPhone = "0771234567";
				return {
					session: {
						id: crypto.randomUUID(),
						token_hash: await hashToken(token),
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

			return {
				session: null,
				profile: null,
				error: "Session is invalid or has expired. Please authenticate with OTP.",
			};
		}

		// 2. Retrieve user profile by phone
		let profile = await this.getProfileByPhone(session.phone);
		if (!profile) {
			// Auto-ensure profile exists so valid session is never rejected
			profile = await this.ensureProfile(session.phone);
		}

		return { session, profile, error: null };
	}

	/**
	 * Authenticates incoming request from Bearer Authorization header
	 * Alias to getUserFromToken for backward compatibility
	 */
	async authenticateBearer(
		authHeader?: string
	): Promise<{ session: AppSessionRecord | null; profile: ProfileRecord | null; error: string | null }> {
		return this.getUserFromToken(authHeader);
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
	 * Deletes user profile and all active sessions
	 */
	async deleteProfile(phone: string): Promise<{ success: boolean; error: string | null }> {
		if (!this.isConfigured()) {
			return { success: true, error: null };
		}

		// Delete sessions first
		await this.rest("app_sessions", {
			method: "DELETE",
			params: { phone: `eq.${phone}` },
		});

		// Delete profile
		const { error } = await this.rest("profiles", {
			method: "DELETE",
			params: { phone: `eq.${phone}` },
		});

		if (error) {
			return { success: false, error };
		}

		return { success: true, error: null };
	}

	/**
	 * Retrieves single order details by ID or order_number
	 */
	async getOrderByIdOrNumber(
		phone: string,
		orderIdOrNumber: string
	): Promise<{ order: OrderWithItemsRecord | null; error: string | null }> {
		if (!this.isConfigured()) {
			const isOrderNum = orderIdOrNumber.startsWith("ORD-");
			return {
				order: {
					id: isOrderNum ? crypto.randomUUID() : orderIdOrNumber,
					order_number: isOrderNum ? orderIdOrNumber : "ORD-20261030-MOCK",
					user_phone: phone,
					status: "pending",
					total_amount: 5400,
					currency: "LKR",
					payment_method: "cod",
					payment_status: "pending",
					payment_reference: null,
					shipping_address: {
						full_name: "Mock Customer",
						phone,
						address_line1: "123 Galle Road",
						city: "Colombo",
						country: "LK",
					},
					aliexpress_order_id: null,
					tracking_number: null,
					notes: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					items: [
						{
							id: crypto.randomUUID(),
							order_id: isOrderNum ? crypto.randomUUID() : orderIdOrNumber,
							product_id: "1005006234567890",
							product_title: "Wireless Bluetooth Earbuds",
							product_image: "https://ae01.alicdn.com/kf/test.jpg",
							unit_price: 2700,
							quantity: 2,
							total_price: 5400,
							currency: "LKR",
						},
					],
				},
				error: null,
			};
		}

		// Match by order_number if it starts with ORD-, otherwise by id (UUID)
		const isOrderNumber = orderIdOrNumber.startsWith("ORD-");
		const params: Record<string, string> = {
			user_phone: `eq.${phone}`,
			select: "*",
			limit: "1",
		};

		if (isOrderNumber) {
			params.order_number = `eq.${orderIdOrNumber}`;
		} else {
			params.id = `eq.${orderIdOrNumber}`;
		}

		let { data: orders, error: orderError } = await this.rest<OrderRecord[]>("orders", {
			method: "GET",
			params,
		});

		// Fallback: If not found by primary key assumption, try the alternate field
		if ((!orders || orders.length === 0) && !orderError) {
			const alternateParams: Record<string, string> = {
				user_phone: `eq.${phone}`,
				select: "*",
				limit: "1",
			};
			if (isOrderNumber) {
				alternateParams.id = `eq.${orderIdOrNumber}`;
			} else {
				alternateParams.order_number = `eq.${orderIdOrNumber}`;
			}

			const altRes = await this.rest<OrderRecord[]>("orders", {
				method: "GET",
				params: alternateParams,
			});
			orders = altRes.data;
			orderError = altRes.error;
		}

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

	/**
	 * Cancels an order if it belongs to the user and is in a cancellable state (pending or paid)
	 */
	async cancelOrder(
		phone: string,
		orderIdOrNumber: string,
		reason?: string
	): Promise<{ order: OrderWithItemsRecord | null; error: string | null }> {
		const { order: existing, error: fetchError } = await this.getOrderByIdOrNumber(phone, orderIdOrNumber);

		if (fetchError || !existing) {
			return { order: null, error: fetchError || "Order not found." };
		}

		if (existing.status === "cancelled") {
			return { order: existing, error: "Order is already cancelled." };
		}

		if (existing.status === "shipped" || existing.status === "delivered") {
			return {
				order: null,
				error: `Order cannot be cancelled because it has already been ${existing.status}.`,
			};
		}

		const nowIso = new Date().toISOString();
		const cancellationNote = reason ? `Cancellation reason: ${reason}` : "Cancelled by user";
		const updatedNotes = existing.notes ? `${existing.notes} | ${cancellationNote}` : cancellationNote;

		if (!this.isConfigured()) {
			return {
				order: {
					...existing,
					status: "cancelled",
					notes: updatedNotes,
					updated_at: nowIso,
				},
				error: null,
			};
		}

		const { data: updatedOrders, error: updateError } = await this.rest<OrderRecord[]>("orders", {
			method: "PATCH",
			params: {
				id: `eq.${existing.id}`,
				user_phone: `eq.${phone}`,
				select: "*",
			},
			body: {
				status: "cancelled",
				notes: updatedNotes,
				updated_at: nowIso,
			},
		});

		if (updateError || !updatedOrders || updatedOrders.length === 0) {
			return { order: null, error: updateError || "Failed to update order status." };
		}

		return {
			order: {
				...updatedOrders[0],
				items: existing.items,
			},
			error: null,
		};
	}

	/**
	 * Retrieves order count statistics breakdown by status for a customer
	 */
	async getOrderStats(
		phone: string
	): Promise<{
		stats: {
			total: number;
			pending: number;
			paid: number;
			processing: number;
			shipped: number;
			delivered: number;
			cancelled: number;
		};
		error: string | null;
	}> {
		const defaultStats = {
			total: 0,
			pending: 0,
			paid: 0,
			processing: 0,
			shipped: 0,
			delivered: 0,
			cancelled: 0,
		};

		if (!this.isConfigured()) {
			return { stats: defaultStats, error: null };
		}

		const { data, error } = await this.rest<Array<{ status: string }>>("orders", {
			method: "GET",
			params: {
				user_phone: `eq.${phone}`,
				select: "status",
			},
		});

		if (error || !data) {
			return { stats: defaultStats, error: error || "Failed to retrieve order stats." };
		}

		const stats = { ...defaultStats, total: data.length };
		for (const row of data) {
			const s = row.status?.toLowerCase();
			if (s in stats && s !== "total") {
				(stats as Record<string, number>)[s]++;
			}
		}

		return { stats, error: null };
	}
}

/**
 * Helper to get active user profile and session directly from Hono/Chanfana request context.
 * Queries custom 'app_sessions' table (Ideamart OTP session), NOT Supabase Auth.
 */
export async function getUserFromSession(
	c: AppContext
): Promise<{
	session: AppSessionRecord | null;
	profile: ProfileRecord | null;
	error: string | null;
	supabase: SupabaseClient;
}> {
	const authHeader = c.req.header("Authorization") || c.req.header("x-session-token");
	const supabase = new SupabaseClient({
		url: c.env.SUPABASE_URL,
		key: c.env.SUPABASE_SERVICE_ROLE_KEY || c.env.SUPABASE_KEY,
	});
	const auth = await supabase.getUserFromToken(authHeader);
	return {
		session: auth.session,
		profile: auth.profile,
		error: auth.error,
		supabase,
	};
}

