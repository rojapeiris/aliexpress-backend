import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RawDsCategoryItem {
	category_id: number;
	category_name: string;
	parent_category_id?: number;
}

interface RawDsCategoryResponse {
	resp_result?: {
		result?: {
			total_result_count?: number;
			categories?: {
				category?: RawDsCategoryItem[];
			};
		};
	};
}

/**
 * GET /aliexpress/categories
 * Retrieve root categories or child categories by parent_id.
 *
 * Method: aliexpress.ds.category.get
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressCategoryList extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Categories"],
		summary: "Get categories (root or by parent_id)",
		description:
			"Retrieves categories from AliExpress Dropshipping Center. Pass parent_id=0 (or omit it) to get top-level (root) categories. Pass a valid category ID to get its child subcategories.",
		request: {
			query: z.object({
				parent_id: z
					.string()
					.optional()
					.default("0")
					.describe("Parent category ID. Use 0 for top-level/root categories."),
				user_id: z
					.string()
					.optional()
					.describe("Optional seller user_id to use their session token"),
			}),
		},
		responses: {
			"200": {
				description: "List of categories retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							parent_id: z.number(),
							categories: z.array(
								z.object({
									id: z.number(),
									name: z.string(),
									parent_id: z.number().optional(),
								})
							),
							count: z.number(),
						}),
					})
				),
			},
			"400": {
				description: "Failed to fetch categories",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						errorCode: z.string().optional(),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const parentId = parseInt(data.query.parent_id || "0", 10) || 0;

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		let sessionToken: string | undefined;
		const repo = new TokenRepository(c.env.DB);
		if (data.query.user_id) {
			const record = await repo.findByUserId(data.query.user_id);
			if (record && !repo.isAccessTokenExpired(record)) {
				sessionToken = record.access_token;
			}
		} else {
			const latest = await repo.getLatestToken();
			if (latest && !repo.isAccessTokenExpired(latest)) {
				sessionToken = latest.access_token;
			}
		}

		// Call aliexpress.ds.category.get
		const apiResponse = await callAliExpressApi<RawDsCategoryResponse>(
			config,
			"aliexpress.ds.category.get",
			{ app_signature: "true" },
			sessionToken
		);

		if (!apiResponse.success || !apiResponse.data) {
			return c.json(
				{
					success: false,
					error: apiResponse.error ?? "Failed to fetch categories from AliExpress",
					errorCode: apiResponse.errorCode,
				},
				400
			);
		}

		const rawCategories =
			apiResponse.data.resp_result?.result?.categories?.category || [];

		// Filter according to parent_id
		const filtered = rawCategories
			.filter((cat) => {
				if (parentId === 0) {
					return !cat.parent_category_id;
				}
				return cat.parent_category_id === parentId;
			})
			.map((cat) => ({
				id: cat.category_id,
				name: cat.category_name,
				parent_id: cat.parent_category_id,
			}));

		return c.json({
			success: true,
			result: {
				parent_id: parentId,
				categories: filtered,
				count: filtered.length,
			},
		});
	}
}
