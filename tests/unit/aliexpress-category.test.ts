import { describe, expect, it, vi, beforeEach } from "vitest";
import app from "../../src/index";
import { AppEnv } from "../../src/types";

const createStmtMock = () => ({
	bind: () => createStmtMock(),
	first: async () => null,
	all: async () => ({ results: [] }),
	run: async () => ({ success: true }),
});

const mockEnv: AppEnv = {
	DB: {
		prepare: () => createStmtMock(),
	} as any,
	ALIEXPRESS_APP_KEY: "556446",
	ALIEXPRESS_APP_SECRET: "HusiSvXXSceP9mAcOl1317tqPlAPByG7",
	IDEAMART_REQUEST_URL: "https://appzone.lk/api/otp/request",
	IDEAMART_VERIFY_URL: "https://appzone.lk/api/otp/verify",
	IDEAMART_APP_CODE: "op",
	IDEAMART_APP_007258: "APP_007258",
	IDEAMART_APP_067413: "APP_067413",
};

describe("AliExpress Products by Category and Subcategory", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("GET /aliexpress/products/by-category should return 400 if neither category_id nor subcategory_id is provided", async () => {
		const res = await app.request("/aliexpress/products/by-category", { method: "GET" }, mockEnv);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { success: boolean; error: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain("At least one of 'category_id' or 'subcategory_id' must be provided");
	});

	it("GET /aliexpress/products/by-category should return products when category_id is provided", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (typeof url === "string" && url.includes("/sync")) {
				return new Response(
					JSON.stringify({
						aliexpress_ds_text_search_response: {
							resp_result: {
								resp_code: 200,
								result: {
									current_page_no: 1,
									total_page_count: 5,
									total_record_count: 100,
									products: [
										{
											product_id: 1005001234567,
											product_title: "Magnetic USB-C Charging Cable",
											product_main_image_url: "https://ae01.alicdn.com/kf/cable.jpg",
											target_sale_price: "4.99",
											original_price: "9.99",
											target_sale_price_currency: "USD",
											discount: "50%",
											evaluation_rate: "4.8",
											first_level_category_id: 509,
											second_level_category_id: 200002167,
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

		const res = await app.request(
			"/aliexpress/products/by-category?category_id=509&page_no=1&page_size=10",
			{ method: "GET" },
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: {
				category_id: string;
				current_page: number;
				page_size: number;
				products: Array<{ product_id: string; title: string; category_id: number }>;
			};
		};

		expect(body.success).toBe(true);
		expect(body.result.category_id).toBe("509");
		expect(body.result.current_page).toBe(1);
		expect(body.result.products.length).toBe(1);
		expect(body.result.products[0].product_id).toBe("1005001234567");
		expect(body.result.products[0].title).toBe("Magnetic USB-C Charging Cable");
	});

	it("GET /aliexpress/products/by-category should return products when both category_id and subcategory_id are provided", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (typeof url === "string" && url.includes("/sync")) {
				return new Response(
					JSON.stringify({
						aliexpress_ds_text_search_response: {
							resp_result: {
								resp_code: 200,
								result: {
									current_page_no: 1,
									total_page_count: 2,
									total_record_count: 25,
									products: [
										{
											product_id: 1005009876543,
											product_title: "Fast Braided USB Cable",
											product_main_image_url: "https://ae01.alicdn.com/kf/braided.jpg",
											target_sale_price: "3.50",
											target_sale_price_currency: "USD",
											first_level_category_id: 509,
											second_level_category_id: 200002167,
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

		const res = await app.request(
			"/aliexpress/products/by-category?category_id=509&subcategory_id=200002167",
			{ method: "GET" },
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: {
				category_id: string;
				subcategory_id: string;
				products: Array<{ product_id: string; subcategory_id: number }>;
			};
		};

		expect(body.success).toBe(true);
		expect(body.result.category_id).toBe("509");
		expect(body.result.subcategory_id).toBe("200002167");
		expect(body.result.products[0].subcategory_id).toBe(200002167);
	});

	it("GET /aliexpress/categories/:parentId/subcategories/:subcategoryId/products should return products for subcategory", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (typeof url === "string" && url.includes("/sync")) {
				return new Response(
					JSON.stringify({
						aliexpress_ds_text_search_response: {
							resp_result: {
								resp_code: 200,
								result: {
									current_page_no: 1,
									total_page_count: 3,
									total_record_count: 50,
									products: [
										{
											product_id: "1005007777777",
											product_title: "Heavy Duty Phone Case",
											product_main_image_url: "https://ae01.alicdn.com/kf/case.jpg",
											target_sale_price: "6.99",
											first_level_category_id: 509,
											second_level_category_id: 380230,
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

		const res = await app.request(
			"/aliexpress/categories/509/subcategories/380230/products?page_no=1&page_size=20",
			{ method: "GET" },
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: {
				category_id: string;
				subcategory_id: string;
				products: Array<{ product_id: string; title: string }>;
			};
		};

		expect(body.success).toBe(true);
		expect(body.result.category_id).toBe("509");
		expect(body.result.subcategory_id).toBe("380230");
		expect(body.result.products.length).toBe(1);
		expect(body.result.products[0].title).toBe("Heavy Duty Phone Case");
	});

	it("GET /aliexpress/categories/:categoryId/products with subcategory_id query param should filter by subcategory", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			if (typeof url === "string" && url.includes("/sync")) {
				return new Response(
					JSON.stringify({
						aliexpress_ds_text_search_response: {
							resp_result: {
								resp_code: 200,
								result: {
									current_page_no: 1,
									total_page_count: 1,
									total_record_count: 10,
									products: [
										{
											product_id: "1005008888888",
											product_title: "Tempered Glass Screen Protector",
											target_sale_price: "1.99",
											first_level_category_id: 509,
											second_level_category_id: 380231,
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

		const res = await app.request(
			"/aliexpress/categories/509/products?subcategory_id=380231",
			{ method: "GET" },
			mockEnv
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			success: boolean;
			result: {
				category_id: string;
				subcategory_id?: string;
				products: Array<{ product_id: string; title: string }>;
			};
		};

		expect(body.success).toBe(true);
		expect(body.result.category_id).toBe("509");
		expect(body.result.subcategory_id).toBe("380231");
		expect(body.result.products[0].title).toBe("Tempered Glass Screen Protector");
	});
});
