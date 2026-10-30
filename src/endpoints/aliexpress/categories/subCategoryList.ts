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
 * GET /aliexpress/categories/:parentId/subcategories
 * Retrieve immediate subcategories for a given parent category ID.
 * Uses aliexpress.ds.category.get (same as categoryList) and filters client-side.
 */
export class AliExpressSubCategoryList extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Categories"],
		summary: "Get subcategories for a parent category",
		description:
			"Fetches direct child/subcategories for a specific parent category ID. Uses aliexpress.ds.category.get and filters the full category tree client-side by parent_category_id.",
		request: {
			params: z.object({
				parentId: z.string().describe("Parent category ID (e.g., 509 for Cellphones & Telecommunications)"),
			}),
			query: z.object({
				user_id: z
					.string()
					.optional()
					.describe("Optional seller user_id to use their session token"),
			}),
		},
		responses: {
			"200": {
				description: "Subcategories retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							parent_id: z.number(),
							subcategories: z.array(
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
				description: "Failed to fetch subcategories",
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
		const parentId = parseInt(data.params.parentId, 10);

		if (isNaN(parentId) || parentId < 0) {
			return c.json(
				{
					success: false,
					error: "Invalid parentId parameter. Must be a non-negative number.",
				},
				400
			);
		}

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Retrieve or automatically refresh session token
		const repo = new TokenRepository(c.env.DB);
		const sessionToken = await repo.getValidAccessToken(data.query.user_id, config);

		// Use aliexpress.ds.category.get (same as categoryList) — filter client-side
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
					error: apiResponse.error ?? "Failed to fetch subcategories from AliExpress",
					errorCode: apiResponse.errorCode,
				},
				400
			);
		}

		const rawCategories =
			apiResponse.data.resp_result?.result?.categories?.category || [];

		// Filter client-side: only children whose parent_category_id matches parentId
		const subcategories = rawCategories
			.filter((cat) => cat.parent_category_id === parentId)
			.map((cat) => ({
				id: cat.category_id,
				name: cat.category_name,
				parent_id: cat.parent_category_id,
			}));

		return c.json({
			success: true,
			result: {
				parent_id: parentId,
				subcategories,
				count: subcategories.length,
			},
		});
	}
}

