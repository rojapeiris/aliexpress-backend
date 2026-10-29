import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";
import { parseCategoryDto } from "./categoryList";

interface RawCategoryDto {
	id: number;
	isleaf: boolean;
	level: number;
	names?: string | Record<string, string>;
}

interface RawCategoryResponse {
	result?: {
		aeop_post_category_list?: {
			aeop_post_category_dto?: RawCategoryDto[];
		};
		success?: boolean;
		error_message?: string;
	};
}

/**
 * GET /aliexpress/categories/:parentId/subcategories
 * Retrieve immediate subcategories for a given parent category ID.
 */
export class AliExpressSubCategoryList extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Categories"],
		summary: "Get subcategories for a parent category",
		description:
			"Fetches direct child/subcategories for a specific parent category ID using the AliExpress Open Platform category hierarchy API.",
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
									names: z.record(z.string()),
									is_leaf: z.boolean(),
									level: z.number(),
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

		const apiResponse = await callAliExpressApi<RawCategoryResponse>(
			config,
			"aliexpress.category.redefining.getchildrenpostcategorybyid",
			{ param0: parentId },
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

		const categoryList =
			apiResponse.data.result?.aeop_post_category_list?.aeop_post_category_dto || [];

		const formatted = categoryList.map(parseCategoryDto);

		return c.json({
			success: true,
			result: {
				parent_id: parentId,
				subcategories: formatted,
				count: formatted.length,
			},
		});
	}
}

