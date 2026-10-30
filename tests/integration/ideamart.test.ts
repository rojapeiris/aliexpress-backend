import { SELF } from "cloudflare:test";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
	getApplicationId,
	normalizePhone,
	DEFAULT_APP_ID_MOBITEL,
	DEFAULT_APP_ID_OTHER,
} from "../../src/lib/ideamart-client";

describe("Ideamart Client Utilities", () => {
	it("should normalize phone numbers properly", () => {
		expect(normalizePhone("+94712345678")).toBe("94712345678");
		expect(normalizePhone("071-234 5678")).toBe("0712345678");
		expect(normalizePhone("0094771234567")).toBe("94771234567");
	});

	it("should route to APP_007258 for Mobitel prefixes (9471, 9470, 071, 070)", () => {
		expect(getApplicationId("0712345678")).toBe(DEFAULT_APP_ID_MOBITEL);
		expect(getApplicationId("0701234567")).toBe(DEFAULT_APP_ID_MOBITEL);
		expect(getApplicationId("94712345678")).toBe(DEFAULT_APP_ID_MOBITEL);
		expect(getApplicationId("94701234567")).toBe(DEFAULT_APP_ID_MOBITEL);
		expect(getApplicationId("+94712345678")).toBe(DEFAULT_APP_ID_MOBITEL);
	});

	it("should route to APP_067413 for all other prefixes (Dialog, Airtel, Hutch)", () => {
		expect(getApplicationId("0771234567")).toBe(DEFAULT_APP_ID_OTHER);
		expect(getApplicationId("0761234567")).toBe(DEFAULT_APP_ID_OTHER);
		expect(getApplicationId("0781234567")).toBe(DEFAULT_APP_ID_OTHER);
		expect(getApplicationId("0741234567")).toBe(DEFAULT_APP_ID_OTHER);
		expect(getApplicationId("0721234567")).toBe(DEFAULT_APP_ID_OTHER);
		expect(getApplicationId("94771234567")).toBe(DEFAULT_APP_ID_OTHER);
	});
});

describe("Ideamart OTP Endpoints", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("POST /auth/ideamart/otp/request", () => {
		it("should successfully request OTP and return referenceNo", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (typeof url === "string" && url.includes("/otp/request")) {
					return new Response(
						JSON.stringify({
							statusCode: "S1000",
							referenceNo: "ref_test_987654321",
							message: "Success",
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				return originalFetch(url);
			});

			const res = await SELF.fetch("http://local.test/auth/ideamart/otp/request", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					phone: "0712345678",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				statusCode: string;
				referenceNo: string;
				applicationId: string;
				phone: string;
			};

			expect(body.success).toBe(true);
			expect(body.statusCode).toBe("S1000");
			expect(body.referenceNo).toBe("ref_test_987654321");
			expect(body.applicationId).toBe(DEFAULT_APP_ID_MOBITEL);

			globalThis.fetch = originalFetch;
		});

		it("should return 400 when Ideamart returns an error code", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (typeof url === "string" && url.includes("/otp/request")) {
					return new Response(
						JSON.stringify({
							statusCode: "E1853",
							message: "Maximum number of OTP requests reached",
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				return originalFetch(url);
			});

			const res = await SELF.fetch("http://local.test/auth/ideamart/otp/request", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					phone: "0771234567",
				}),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as {
				success: boolean;
				statusCode: string;
				message: string;
			};

			expect(body.success).toBe(false);
			expect(body.statusCode).toBe("E1853");
			expect(body.message).toContain("Maximum number of OTP requests reached");

			globalThis.fetch = originalFetch;
		});
	});

	describe("POST /auth/ideamart/otp/verify", () => {
		it("should verify OTP, save subscriberId, and return a session token", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (typeof url === "string" && url.includes("/otp/verify")) {
					return new Response(
						JSON.stringify({
							subscriptionStatus: "INITIAL_CHARGING_PENDING",
							subscriberId: "tel:NjFkNTdhZjU5M2EwYWNkN2E0ZDYwMzAzMDUyNmZiMTQ0ZWU1YzkyNWVhZmQ0NzJmZmQ2ODc3NDNmZGEyMWRkMjptb2JpdGVs",
							statusDetail: "Success",
							version: "1.0",
							statusCode: "S1000",
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				return originalFetch(url);
			});

			const res = await SELF.fetch("http://local.test/auth/ideamart/otp/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					phone: "0771234567",
					otp: "123456",
					referenceNo: "ref_test_987654321",
				}),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				statusCode: string;
				result: {
					token: string;
					phone: string;
					subscriber_id?: string;
					subscription_status?: string;
					expires_at: string;
					session_id: string;
				};
			};

			expect(body.success).toBe(true);
			expect(body.statusCode).toBe("S1000");
			expect(body.result.token).toBeDefined();
			expect(body.result.token.length).toBeGreaterThan(20);
			expect(body.result.phone).toBe("0771234567");
			expect(body.result.subscriber_id).toContain("tel:NjFkNT");
			expect(body.result.subscription_status).toBe("INITIAL_CHARGING_PENDING");

			globalThis.fetch = originalFetch;
		});

		it("should return 400 on invalid OTP PIN", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (typeof url === "string" && url.includes("/otp/verify")) {
					return new Response(
						JSON.stringify({
							statusCode: "E1850",
							message: "Invalid PIN Number.",
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				return originalFetch(url);
			});

			const res = await SELF.fetch("http://local.test/auth/ideamart/otp/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					phone: "0771234567",
					otp: "0000",
					referenceNo: "ref_test_987654321",
				}),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as {
				success: boolean;
				statusCode: string;
				message: string;
			};

			expect(body.success).toBe(false);
			expect(body.statusCode).toBe("E1850");
			expect(body.message).toContain("Invalid PIN");

			globalThis.fetch = originalFetch;
		});
	});

	describe("GET /auth/me", () => {
		it("should return 401 when Authorization header is missing", async () => {
			const res = await SELF.fetch("http://local.test/auth/me");
			expect(res.status).toBe(401);
		});
	});
});

