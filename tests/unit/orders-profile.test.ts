import { describe, expect, it } from "vitest";
import app from "../../src/index";
import { AppEnv } from "../../src/types";

const mockEnv: AppEnv = {
	DB: {} as any,
	ALIEXPRESS_APP_KEY: "556446",
	ALIEXPRESS_APP_SECRET: "HusiSvXXSceP9mAcOl1317tqPlAPByG7",
	IDEAMART_REQUEST_URL: "https://appzone.lk/api/otp/request",
	IDEAMART_VERIFY_URL: "https://appzone.lk/api/otp/verify",
	IDEAMART_APP_CODE: "op",
	IDEAMART_APP_007258: "APP_007258",
	IDEAMART_APP_067413: "APP_067413",
};

const MOCK_AUTH = "Bearer mock_valid_bearer_token_1234567890abcdef";

describe("Customer Profile Endpoints (/profile)", () => {
	it("GET /profile should return 401 when Authorization header is missing", async () => {
		const res = await app.request("/profile", { method: "GET" }, mockEnv);
		expect(res.status).toBe(401);
		const body = (await res.json()) as { success: boolean; error: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain("Authorization header");
	});

	it("GET /profile should return user profile when authenticated", async () => {
		const res = await app.request(
			"/profile",
			{
				method: "GET",
				headers: { Authorization: MOCK_AUTH },
			},
			mockEnv
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: { profile: { id: string; phone: string; country: string } };
		};
		expect(body.success).toBe(true);
		expect(body.result.profile).toBeDefined();
		expect(body.result.profile.phone).toBe("0771234567");
	});

	it("PATCH /profile should update profile fields", async () => {
		const res = await app.request(
			"/profile",
			{
				method: "PATCH",
				headers: {
					Authorization: MOCK_AUTH,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					full_name: "Kasun Jayasuriya",
					email: "kasun@example.com",
					address_line1: "123 Galle Road",
					city: "Colombo",
					country: "LK",
				}),
			},
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			message: string;
			result: { profile: { full_name: string; city: string; email: string } };
		};
		expect(body.success).toBe(true);
		expect(body.result.profile.full_name).toBe("Kasun Jayasuriya");
		expect(body.result.profile.city).toBe("Colombo");
		expect(body.result.profile.email).toBe("kasun@example.com");
	});

	it("PUT /profile should update profile fields", async () => {
		const res = await app.request(
			"/profile",
			{
				method: "PUT",
				headers: {
					Authorization: MOCK_AUTH,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					city: "Kandy",
				}),
			},
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: { profile: { city: string } };
		};
		expect(body.success).toBe(true);
		expect(body.result.profile.city).toBe("Kandy");
	});

	it("DELETE /profile should succeed with valid token", async () => {
		const res = await app.request(
			"/profile",
			{
				method: "DELETE",
				headers: { Authorization: MOCK_AUTH },
			},
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { success: boolean; message: string };
		expect(body.success).toBe(true);
		expect(body.message).toContain("deleted successfully");
	});
});

describe("Customer Orders Endpoints (/orders)", () => {
	it("GET /orders should return 401 when unauthenticated", async () => {
		const res = await app.request("/orders", { method: "GET" }, mockEnv);
		expect(res.status).toBe(401);
	});

	it("POST /orders should place a new order successfully", async () => {
		const res = await app.request(
			"/orders",
			{
				method: "POST",
				headers: {
					Authorization: MOCK_AUTH,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					items: [
						{
							product_id: "1005006234567890",
							product_title: "Wireless Bluetooth Earbuds",
							unit_price: 2700,
							quantity: 2,
							currency: "LKR",
						},
					],
					shipping_address: {
						full_name: "Kasun Jayasuriya",
						address_line1: "123 Galle Road",
						city: "Colombo",
						country: "LK",
					},
					payment_method: "cod",
					notes: "Handle with care",
				}),
			},
			mockEnv
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			success: boolean;
			message: string;
			result: {
				order: {
					id: string;
					order_number: string;
					status: string;
					total_amount: number;
					currency: string;
					shipping_address: { city: string; full_name: string };
					items: Array<{ product_id: string; total_price: number }>;
				};
			};
		};

		expect(body.success).toBe(true);
		expect(body.result.order.order_number).toMatch(/^ORD-/);
		expect(body.result.order.status).toBe("pending");
		expect(body.result.order.total_amount).toBe(5400);
		expect(body.result.order.currency).toBe("LKR");
		expect(body.result.order.shipping_address.city).toBe("Colombo");
		expect(body.result.order.shipping_address.full_name).toBe("Kasun Jayasuriya");
		expect(body.result.order.items.length).toBe(1);
	});

	it("GET /orders should return order list when authenticated", async () => {
		const res = await app.request(
			"/orders",
			{
				method: "GET",
				headers: { Authorization: MOCK_AUTH },
			},
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: { orders: unknown[]; total: number; page_no: number; page_size: number };
		};
		expect(body.success).toBe(true);
		expect(Array.isArray(body.result.orders)).toBe(true);
		expect(body.result.page_no).toBe(1);
		expect(body.result.page_size).toBe(20);
	});

	it("GET /orders with pagination and status query should filter properly", async () => {
		const res = await app.request(
			"/orders?page_no=2&page_size=10&status=pending",
			{
				method: "GET",
				headers: { Authorization: MOCK_AUTH },
			},
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: { orders: unknown[]; total: number; page_no: number; page_size: number };
		};
		expect(body.success).toBe(true);
		expect(body.result.page_no).toBe(2);
		expect(body.result.page_size).toBe(10);
	});

	it("POST /orders should return 400 when items array is empty or missing", async () => {
		const res = await app.request(
			"/orders",
			{
				method: "POST",
				headers: {
					Authorization: MOCK_AUTH,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					items: [],
					shipping_address: {
						address_line1: "123 Galle Road",
						city: "Colombo",
					},
				}),
			},
			mockEnv
		);

		expect(res.status).toBe(400);
	});

	it("PATCH /profile should reject invalid email format", async () => {
		const res = await app.request(
			"/profile",
			{
				method: "PATCH",
				headers: {
					Authorization: MOCK_AUTH,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: "not-an-email",
				}),
			},
			mockEnv
		);

		expect(res.status).toBe(400);
	});

	it("GET /orders/stats should return 401 when unauthenticated", async () => {
		const res = await app.request("/orders/stats", { method: "GET" }, mockEnv);
		expect(res.status).toBe(401);
	});

	it("GET /orders/:orderId should return 401 when unauthenticated", async () => {
		const res = await app.request("/orders/ORD-20261030-MOCK", { method: "GET" }, mockEnv);
		expect(res.status).toBe(401);
	});

	it("POST /orders/:orderId/cancel should return 401 when unauthenticated", async () => {
		const res = await app.request(
			"/orders/ORD-20261030-MOCK/cancel",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reason: "test" }),
			},
			mockEnv
		);
		expect(res.status).toBe(401);
	});

	it("GET /orders/stats should return breakdown of order statuses", async () => {
		const res = await app.request(
			"/orders/stats",
			{
				method: "GET",
				headers: { Authorization: MOCK_AUTH },
			},
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: {
				stats: {
					total: number;
					pending: number;
					paid: number;
					processing: number;
					shipped: number;
					delivered: number;
					cancelled: number;
				};
			};
		};

		expect(body.success).toBe(true);
		expect(typeof body.result.stats.total).toBe("number");
		expect(typeof body.result.stats.pending).toBe("number");
	});

	it("GET /orders/:orderId should return single order detail", async () => {
		const res = await app.request(
			"/orders/ORD-20261030-MOCK",
			{
				method: "GET",
				headers: { Authorization: MOCK_AUTH },
			},
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: {
				order: {
					id: string;
					order_number: string;
					items: Array<{ product_id: string }>;
				};
			};
		};

		expect(body.success).toBe(true);
		expect(body.result.order.order_number).toBe("ORD-20261030-MOCK");
		expect(body.result.order.items.length).toBeGreaterThan(0);
	});

	it("POST /orders/:orderId/cancel should cancel order", async () => {
		const res = await app.request(
			"/orders/ORD-20261030-MOCK/cancel",
			{
				method: "POST",
				headers: {
					Authorization: MOCK_AUTH,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					reason: "Ordered by mistake",
				}),
			},
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			message: string;
			result: {
				order: {
					status: string;
					notes: string;
				};
			};
		};

		expect(body.success).toBe(true);
		expect(body.message).toContain("cancelled successfully");
		expect(body.result.order.status).toBe("cancelled");
		expect(body.result.order.notes).toContain("Ordered by mistake");
	});
});
