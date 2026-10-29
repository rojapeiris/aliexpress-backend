import { SELF } from "cloudflare:test";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateSign, getAliexpressTimestamp } from "../../src/lib/aliexpress-client";

describe("AliExpress Client Utilities", () => {
	it("should generate a valid uppercase HMAC-SHA256 signature", async () => {
		const params = {
			app_key: "556446",
			timestamp: "2026-10-29 19:00:00",
			code: "test_auth_code_123",
		};
		const apiPath = "/auth/token/create";
		const appSecret = "HusiSvXXSceP9mAcOl1317tqPlAPByG7";

		const sign = await generateSign(params, apiPath, appSecret);

		expect(sign).toBeDefined();
		expect(typeof sign).toBe("string");
		expect(sign.length).toBe(64); // SHA-256 produces 64 hex characters
		expect(sign).toBe(sign.toUpperCase());
	});

	it("should produce consistent GMT+8 timestamp", () => {
		const ts = getAliexpressTimestamp();
		expect(ts).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});
});

describe("AliExpress API Endpoints", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("GET /aliexpress/auth/authorize", () => {
		it("should return the OAuth authorization URL with correct credentials", async () => {
			const redirectUri = "https://my-dropshipping-store.com/oauth/callback";
			const res = await SELF.fetch(
				`http://local.test/aliexpress/auth/authorize?redirect_uri=${encodeURIComponent(
					redirectUri
				)}`
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				result: { authorization_url: string; client_id: string };
			};

			expect(body.success).toBe(true);
			expect(body.result.client_id).toBe("556446");
			expect(body.result.authorization_url).toContain("https://api-sg.aliexpress.com/oauth/authorize");
			expect(body.result.authorization_url).toContain("client_id=556446");
			expect(body.result.authorization_url).toContain("response_type=code");
		});
	});

	describe("GET /aliexpress/auth/tokens", () => {
		it("should return token list array", async () => {
			const res = await SELF.fetch("http://local.test/aliexpress/auth/tokens");
			expect(res.status).toBe(200);
			const body = (await res.json()) as { success: boolean; result: unknown[] };
			expect(body.success).toBe(true);
			expect(Array.isArray(body.result)).toBe(true);
		});
	});

	describe("GET /aliexpress/categories with mock upstream", () => {
		it("should handle categories endpoint request", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (typeof url === "string" && url.includes("/sync")) {
					return new Response(
						JSON.stringify({
							aliexpress_category_redefining_getchildrenpostcategorybyid_response: {
								result: {
									success: true,
									aeop_post_category_list: {
										aeop_post_category_dto: [
											{
												id: 509,
												isleaf: false,
												level: 1,
												names: JSON.stringify({ en: "Phones & Telecommunications" }),
											},
											{
												id: 1509,
												isleaf: false,
												level: 1,
												names: JSON.stringify({ en: "Consumer Electronics" }),
											},
										],
									},
								},
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				return originalFetch(url);
			});

			const res = await SELF.fetch("http://local.test/aliexpress/categories?parent_id=0");
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				result: {
					parent_id: number;
					categories: Array<{ id: number; name: string; is_leaf: boolean }>;
					count: number;
				};
			};

			expect(body.success).toBe(true);
			expect(body.result.categories.length).toBe(2);
			expect(body.result.categories[0].name).toBe("Phones & Telecommunications");

			globalThis.fetch = originalFetch;
		});
	});

	describe("GET /aliexpress/products with mock upstream", () => {
		it("should return dropshipping product list", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (typeof url === "string" && url.includes("/sync")) {
					return new Response(
						JSON.stringify({
							aliexpress_ds_recommend_feed_get_response: {
								result: {
									total_record_count: 1,
									current_record_count: 1,
									current_page_no: 1,
									total_page_no: 1,
									products: {
										traffic_product_d_t_o: [
											{
												product_id: 1005006001234567,
												product_title: "Wireless Bluetooth Earbuds Noise Cancelling",
												product_main_image_url: "https://ae01.alicdn.com/kf/earbuds.jpg",
												target_sale_price: "15.99",
												target_original_price: "29.99",
												target_sale_price_currency: "USD",
												discount: "47%",
												evaluate_rate: "4.8",
												lastest_volume: 520,
											},
										],
									},
								},
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				return originalFetch(url);
			});

			const res = await SELF.fetch(
				"http://local.test/aliexpress/products?feed_name=DS+bestseller&country=US&target_currency=USD"
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				result: {
					products: Array<{ product_id: string; title: string; sale_price: string }>;
				};
			};

			expect(body.success).toBe(true);
			expect(body.result.products.length).toBe(1);
			expect(body.result.products[0].product_id).toBe("1005006001234567");
			expect(body.result.products[0].sale_price).toBe("15.99");

			globalThis.fetch = originalFetch;
		});
	});

	describe("GET /aliexpress/products/search with mock upstream", () => {
		it("should search products by product name / keyword", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (typeof url === "string" && url.includes("/sync")) {
					return new Response(
						JSON.stringify({
							aliexpress_ds_text_search_response: {
								resp_result: {
									resp_code: 200,
									resp_msg: "successful",
									result: {
										current_page_no: 1,
										total_page_count: 5,
										total_record_count: 100,
										products: [
											{
												product_id: 1005009988776655,
												product_title: "Smart Fitness Watch Waterproof IP68",
												product_detail_url: "https://www.aliexpress.com/item/1005009988776655.html",
												product_main_image_url: "https://ae01.alicdn.com/kf/watch.jpg",
												target_sale_price: "24.50",
												original_price: "49.00",
												target_sale_price_currency: "USD",
												discount: "50%",
												evaluation_rate: "4.9",
												volume: 1200,
											},
										],
									},
								},
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				return originalFetch(url);
			});

			const res = await SELF.fetch(
				"http://local.test/aliexpress/products/search?q=smart+watch&country=US&target_currency=USD"
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				result: {
					query: string;
					products: Array<{ product_id: string; title: string; sale_price: string }>;
				};
			};

			expect(body.success).toBe(true);
			expect(body.result.query).toBe("smart watch");
			expect(body.result.products.length).toBe(1);
			expect(body.result.products[0].title).toBe("Smart Fitness Watch Waterproof IP68");
			expect(body.result.products[0].sale_price).toBe("24.50");

			globalThis.fetch = originalFetch;
		});
	});

	describe("GET /aliexpress/categories/:categoryId/products with mock upstream", () => {
		it("should return products specifically filtered by category ID", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				if (typeof url === "string" && url.includes("/sync")) {
					return new Response(
						JSON.stringify({
							aliexpress_ds_recommend_feed_get_response: {
								result: {
									total_record_count: 2,
									current_record_count: 2,
									current_page_no: 1,
									total_page_no: 1,
									products: {
										traffic_product_d_t_o: [
											{
												product_id: 1005001122334455,
												product_title: "Silicone Phone Case for iPhone 15",
												product_main_image_url: "https://ae01.alicdn.com/kf/case.jpg",
												target_sale_price: "3.99",
												target_original_price: "7.99",
												target_sale_price_currency: "USD",
												discount: "50%",
												evaluate_rate: "4.7",
											},
										],
									},
								},
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } }
					);
				}
				return originalFetch(url);
			});

			const res = await SELF.fetch(
				"http://local.test/aliexpress/categories/200003482/products?country=US&target_currency=USD"
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				success: boolean;
				result: {
					category_id: string;
					products: Array<{ product_id: string; title: string; sale_price: string }>;
				};
			};

			expect(body.success).toBe(true);
			expect(body.result.category_id).toBe("200003482");
			expect(body.result.products.length).toBe(1);
			expect(body.result.products[0].title).toBe("Silicone Phone Case for iPhone 15");

			globalThis.fetch = originalFetch;
		});
	});
});
