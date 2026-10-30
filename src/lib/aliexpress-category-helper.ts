import { AliExpressClientConfig, callAliExpressApi } from "./aliexpress-client";

export interface CategoryMeta {
	name: string;
	feedName: string;
	fallbackKeywords: string;
}

/**
 * Standard AliExpress Dropshipping Root Categories Metadata.
 * feedName values are verified against the live aliexpress.ds.recommend.feed.list response.
 * See: aliexpress.ds.recommend.feed.list → result.feeds[].name
 */
export const CATEGORY_MAP: Record<string, CategoryMeta> = {
	// ── Electronics ───────────────────────────────────────────────────────────
	"509": {
		name: "Cellphones & Telecommunications",
		feedName: "AEB_ PhoneAccessories_EG",                  // 7,980 products
		fallbackKeywords: "Phone",
	},
	"1509": {
		name: "Consumer Electronics",
		feedName: "DS_ConsumerElectronics_bestsellers",         // 16,560 products
		fallbackKeywords: "Electronics",
	},
	"44": {
		name: "Consumer Electronics (alt)",
		feedName: "DS_ConsumerElectronics_bestsellers",         // 16,560 products
		fallbackKeywords: "Electronics",
	},
	"523": {
		name: "Electronic Components",
		feedName: "DS_ElectronicComponents_bestsellers",        // 2,340 products
		fallbackKeywords: "Electronic Component",
	},
	"7": {
		name: "Computer & Office",
		feedName: "AEB_ ComputerAccessories_EG",               // 7,861 products
		fallbackKeywords: "Computer",
	},

	// ── Home & Garden ─────────────────────────────────────────────────────────
	"15": {
		name: "Home & Garden",
		feedName: "DS_Home&Kitchen_bestsellers",                // 8,610 products
		fallbackKeywords: "Home",
	},
	"1420": {
		name: "Tools & Home Improvement",
		feedName: "AEB_Fetch_Garden&Tool&Pet&AutoParts_TopSellers_20241210", // 59,626 products
		fallbackKeywords: "Tools",
	},
	"36": {
		name: "Home Appliances",
		feedName: "DS_Home&Kitchen_bestsellers",                // 8,610 products
		fallbackKeywords: "Appliance",
	},
	"109": {
		name: "Lights & Lighting",
		feedName: "AEB_US_Lighting_TopSellers",                 // 16,890 products
		fallbackKeywords: "Lighting",
	},
	"503": {
		name: "Furniture",
		feedName: "AEB_US_Furniture_TopSellers",                // 10,800 products
		fallbackKeywords: "Furniture",
	},
	"2": {
		name: "Garden Supplies",
		feedName: "AEB_Fetch_Garden&Tool&Pet&AutoParts_TopSellers_20241210", // 59,626 products
		fallbackKeywords: "Garden",
	},

	// ── Sports & Outdoor ──────────────────────────────────────────────────────
	"18": {
		name: "Sports & Entertainment",
		feedName: "DS_Sports&Outdoors_bestsellers",             // 23,820 products
		fallbackKeywords: "Sports",
	},
	"200001075": {
		name: "Outdoor & Sporting Goods",
		feedName: "DS_Sports&Outdoors_bestsellers",             // 23,820 products
		fallbackKeywords: "Outdoor",
	},

	// ── Automobiles & Motorcycles ─────────────────────────────────────────────
	"34": {
		name: "Automobiles & Motorcycles",
		feedName: "DS_Automobile&Accessories_bestsellers",      // 13,901 products
		fallbackKeywords: "Car Accessories",
	},
	"400014020": {
		name: "Auto Parts",
		feedName: "AEB_Fetch_Garden&Tool&Pet&AutoParts_TopSellers_20241210", // 59,626 products
		fallbackKeywords: "Auto Parts",
	},

	// ── Beauty & Health ───────────────────────────────────────────────────────
	"66": {
		name: "Beauty & Health",
		feedName: "DS_Beauty_bestsellers",                      // 2,160 products
		fallbackKeywords: "Beauty",
	},
	"200216085": {
		name: "Hair Extensions & Wigs",
		feedName: "AEB_SHOPLAZZA_HairExtensions&Wigs_$0~50_20241115", // 2,644 products
		fallbackKeywords: "Hair Wig",
	},

	// ── Women's Clothing ──────────────────────────────────────────────────────
	"100003109": {
		name: "Women's Clothing",
		feedName: "AEB_SHOPLAZZA_WomenClothing_$10~30_20241115", // 1,302 products
		fallbackKeywords: "Women Clothing",
	},
	"200000297": {
		name: "Underwear & Sleepwear",
		feedName: "AEB_SHOPLAZZA_WomenClothing_$0~10_20241115", // 1,440 products
		fallbackKeywords: "Underwear",
	},

	// ── Men's Clothing ────────────────────────────────────────────────────────
	"100003070": {
		name: "Men's Clothing",
		feedName: "AEB_SHOPLAZZA_MenClothing_$10~30_20241115",  // 2,190 products
		fallbackKeywords: "Men Clothing",
	},

	// ── Shoes ─────────────────────────────────────────────────────────────────
	"322": {
		name: "Shoes",
		feedName: "AEB_SHOPLAZZA_Shoes_$10~30_20241115",        // 2,054 products
		fallbackKeywords: "Shoes",
	},

	// ── Luggage & Bags ────────────────────────────────────────────────────────
	"1524": {
		name: "Luggage & Bags",
		feedName: "AEB_SHOPLAZZA_Luggage&Bags_$10~30_20241115", // 1,481 products
		fallbackKeywords: "Bag",
	},

	// ── Jewelry & Watches ─────────────────────────────────────────────────────
	"200000345": {
		name: "Jewelry & Accessories",
		feedName: "DS_Jewelry&Watch 10$+",                      // 990 products
		fallbackKeywords: "Jewelry",
	},
	"200003655": {
		name: "Watches",
		feedName: "DS_Jewelry&Watch 10$+",                      // 990 products
		fallbackKeywords: "Watch",
	},

	// ── Mother & Kids ─────────────────────────────────────────────────────────
	"1501": {
		name: "Mother & Kids",
		feedName: "AEB_SHOPLAZZA_Mother&Kids_$10~30_20241115",  // 3,390 products
		fallbackKeywords: "Baby Kids",
	},

	// ── Toys & Hobbies ────────────────────────────────────────────────────────
	"1503": {
		name: "Toys & Hobbies",
		feedName: "AEB_SHOPLAZZA_Toys&Hobbies_$10~20_20241118", // 2,182 products
		fallbackKeywords: "Toys",
	},
	"143": {
		name: "Dolls & Accessories",
		feedName: "US_Dolls&Accessories",                       // 23,168 products
		fallbackKeywords: "Dolls",
	},

	// ── Security & Protection ─────────────────────────────────────────────────
	"30": {
		name: "Security & Protection",
		feedName: "Security_ZA topsellers_ 20240423",           // 9,210 products
		fallbackKeywords: "Security Camera",
	},

	// ── Pets & Supplies ───────────────────────────────────────────────────────
	"200000783": {
		name: "Pets & Pet Supplies",
		feedName: "AEB_Fetch_Garden&Tool&Pet&AutoParts_TopSellers_20241210", // 59,626 products
		fallbackKeywords: "Pet",
	},
};

interface RawTextSearchItem {
	product_id: number | string;
	product_title: string;
	product_main_image_url?: string;
	product_detail_url?: string;
	sale_price?: string;
	target_sale_price?: string;
	original_price?: string;
	target_original_price?: string;
	target_sale_price_currency?: string;
	app_sale_price_currency?: string;
	discount?: string;
	evaluate_rate?: string;
	evaluation_rate?: string;
	volume?: number | string;
	lastest_volume?: number | string;
	first_level_category_id?: number;
	second_level_category_id?: number;
}

interface RawTextSearchResponse {
	resp_result?: {
		resp_code?: number;
		resp_msg?: string;
		result?: {
			current_page_no?: number;
			total_page_count?: number;
			total_record_count?: number;
			products?: RawTextSearchItem[];
		};
	};
	result?: {
		products?: {
			traffic_product_d_t_o?: RawTextSearchItem[];
		};
		total_page_no?: number;
		current_page_no?: number;
		total_record_count?: number;
	};
}

export interface StandardProductItem {
	product_id: string;
	title: string;
	main_image_url?: string;
	sale_price?: string;
	original_price?: string;
	currency?: string;
	discount?: string;
	rating?: string;
	volume?: string;
	detail_url?: string;
	category_id?: number;
	subcategory_id?: number;
}

export interface CategoryFetchParams {
	categoryId?: string;
	subcategoryId?: string;
	q?: string;
	pageNo: number;
	pageSize: number;
	country: string;
	currency: string;
	language: string;
	sort?: string;
	feedName?: string;
	config: AliExpressClientConfig;
	sessionToken?: string;
}

export interface CategoryFetchResult {
	success: boolean;
	products: StandardProductItem[];
	totalCount?: number;
	totalPages?: number;
	currentPage: number;
	pageSize: number;
	error?: string;
	errorCode?: string;
}

/**
 * Resolves the human-readable category name from static dictionary or dynamic category API.
 */
export async function resolveCategoryName(
	categoryId: string,
	config: AliExpressClientConfig,
	sessionToken?: string
): Promise<string | undefined> {
	if (CATEGORY_MAP[categoryId]?.name) {
		return CATEGORY_MAP[categoryId].name;
	}

	try {
		const res = await callAliExpressApi<any>(
			config,
			"aliexpress.ds.category.get",
			{ app_signature: "true" },
			sessionToken
		);
		const categories: Array<{ category_id: number; category_name: string }> =
			res.data?.resp_result?.result?.categories?.category || [];
		const targetIdNum = parseInt(categoryId, 10);
		const found = categories.find((c) => c.category_id === targetIdNum);
		if (found?.category_name) {
			return found.category_name;
		}
	} catch {
		// Ignore fetch error
	}
	return undefined;
}

function mapRawProducts(
	rawItems: RawTextSearchItem[],
	targetCurrency: string,
	categoryId?: string,
	subcategoryId?: string
): StandardProductItem[] {
	return rawItems.map((p) => ({
		product_id: String(p.product_id),
		title: p.product_title,
		main_image_url: p.product_main_image_url,
		sale_price: p.target_sale_price || p.sale_price,
		original_price: p.original_price || p.target_original_price,
		currency:
			p.target_sale_price_currency ||
			p.app_sale_price_currency ||
			targetCurrency ||
			"USD",
		discount: p.discount,
		rating: p.evaluation_rate || p.evaluate_rate,
		volume:
			p.volume !== undefined
				? String(p.volume)
				: p.lastest_volume !== undefined
				? String(p.lastest_volume)
				: undefined,
		detail_url: p.product_detail_url,
		category_id:
			p.first_level_category_id ?? (categoryId ? parseInt(categoryId, 10) : undefined),
		subcategory_id:
			p.second_level_category_id ?? (subcategoryId ? parseInt(subcategoryId, 10) : undefined),
	}));
}

/**
 * Multi-strategy category and subcategory product fetcher.
 * Automatically tries category text search, category-specific bestsellers,
 * and general dropshipping bestsellers to prevent empty result sets.
 */
export async function fetchCategoryProducts(params: CategoryFetchParams): Promise<CategoryFetchResult> {
	const targetCategoryId = params.subcategoryId || params.categoryId;
	if (!targetCategoryId) {
		return {
			success: false,
			products: [],
			currentPage: params.pageNo,
			pageSize: params.pageSize,
			error: "Category ID or Subcategory ID is required.",
		};
	}

	const rootMeta = params.categoryId ? CATEGORY_MAP[params.categoryId] : CATEGORY_MAP[targetCategoryId];

	// Determine keywords to search: user query > category name > fallback keywords
	let keywords = params.q?.trim() || "";
	if (!keywords) {
		const resolvedName = await resolveCategoryName(targetCategoryId, params.config, params.sessionToken);
		keywords = resolvedName || rootMeta?.name || rootMeta?.fallbackKeywords || "";
	}

	// 1. If explicit feedName was passed, query that feed directly
	if (params.feedName) {
		const feedRes = await callAliExpressApi<RawTextSearchResponse>(
			params.config,
			"aliexpress.ds.recommend.feed.get",
			{
				feed_name: params.feedName,
				category_id: targetCategoryId,
				page_no: params.pageNo,
				page_size: params.pageSize,
				country: params.country,
				target_currency: params.currency,
				target_language: params.language,
				...(params.sort ? { sort: params.sort } : {}),
			},
			params.sessionToken
		);

		const rawFeed = feedRes.data?.result?.products?.traffic_product_d_t_o || [];
		if (rawFeed.length > 0) {
			const products = mapRawProducts(rawFeed, params.currency, params.categoryId, params.subcategoryId);
			return {
				success: true,
				products,
				currentPage: feedRes.data?.result?.current_page_no ?? params.pageNo,
				pageSize: params.pageSize,
				totalPages: feedRes.data?.result?.total_page_no,
				totalCount: feedRes.data?.result?.total_record_count ?? products.length,
			};
		}
	}

	// 2. Strategy A: aliexpress.ds.text.search with keywords + category_id
	if (keywords) {
		const textSearchParams: Record<string, string | number> = {
			category_id: targetCategoryId,
			keywords,
			page_no: params.pageNo,
			page_size: params.pageSize,
			countryCode: params.country,
			currency: params.currency,
			local: params.language.toLowerCase(),
			...(params.sort ? { sort: params.sort } : {}),
		};

		const textRes = await callAliExpressApi<RawTextSearchResponse>(
			params.config,
			"aliexpress.ds.text.search",
			textSearchParams,
			params.sessionToken
		);

		const respResult = textRes.data?.resp_result?.result;
		const rawItems = respResult?.products || textRes.data?.result?.products?.traffic_product_d_t_o || [];

		if (rawItems.length > 0) {
			const products = mapRawProducts(rawItems, params.currency, params.categoryId, params.subcategoryId);
			return {
				success: true,
				products,
				currentPage: respResult?.current_page_no ?? params.pageNo,
				pageSize: params.pageSize,
				totalPages: respResult?.total_page_count,
				totalCount: respResult?.total_record_count ?? products.length,
			};
		}
	}

	// 3. Strategy B: Category-specific recommendation feed, then high-volume generic feeds
	const candidateFeeds: string[] = [];
	if (rootMeta?.feedName) {
		candidateFeeds.push(rootMeta.feedName);
	}
	// Generic fallbacks in descending product_count order (all verified from feed.list):
	candidateFeeds.push(
		"DS_NewArrivals",                                           // 8,310 products
		"DS_Home&Kitchen_bestsellers",                              // 8,610 products
		"DS_Sports&Outdoors_bestsellers",                           // 23,820 products
		"DS_ConsumerElectronics_bestsellers",                       // 16,560 products
		"DS_Automobile&Accessories_bestsellers",                    // 13,901 products
		"AEB_Fetch_Garden&Tool&Pet&AutoParts_TopSellers_20241210",  // 59,626 products
		"AEB_i69_FullCategory_TopSellers_20241225",                 // 158,284 products
		"AEB_Droplo_BestsellersItems_20241016",                     // 200,110 products
	);

	for (const feed of candidateFeeds) {
		const feedRes = await callAliExpressApi<RawTextSearchResponse>(
			params.config,
			"aliexpress.ds.recommend.feed.get",
			{
				feed_name: feed,
				category_id: targetCategoryId,
				page_no: params.pageNo,
				page_size: params.pageSize,
				country: params.country,
				target_currency: params.currency,
				target_language: params.language,
				...(params.sort ? { sort: params.sort } : {}),
			},
			params.sessionToken
		);

		const rawFeed = feedRes.data?.result?.products?.traffic_product_d_t_o || [];
		if (rawFeed.length > 0) {
			let selected = rawFeed;
			if (params.q) {
				const lowerQ = params.q.toLowerCase();
				const filtered = rawFeed.filter((p) => p.product_title?.toLowerCase().includes(lowerQ));
				if (filtered.length > 0) selected = filtered;
			}

			const products = mapRawProducts(selected, params.currency, params.categoryId, params.subcategoryId);
			return {
				success: true,
				products,
				currentPage: feedRes.data?.result?.current_page_no ?? params.pageNo,
				pageSize: params.pageSize,
				totalPages: feedRes.data?.result?.total_page_no,
				totalCount: feedRes.data?.result?.total_record_count ?? products.length,
			};
		}
	}

	// 4. Strategy C: Text search with broader fallback keyword
	if (rootMeta?.fallbackKeywords && rootMeta.fallbackKeywords !== keywords) {
		const fallbackTextRes = await callAliExpressApi<RawTextSearchResponse>(
			params.config,
			"aliexpress.ds.text.search",
			{
				category_id: targetCategoryId,
				keywords: rootMeta.fallbackKeywords,
				page_no: params.pageNo,
				page_size: params.pageSize,
				countryCode: params.country,
				currency: params.currency,
				local: params.language.toLowerCase(),
			},
			params.sessionToken
		);

		const rawFallback =
			fallbackTextRes.data?.resp_result?.result?.products ||
			fallbackTextRes.data?.result?.products?.traffic_product_d_t_o ||
			[];

		if (rawFallback.length > 0) {
			const products = mapRawProducts(rawFallback, params.currency, params.categoryId, params.subcategoryId);
			return {
				success: true,
				products,
				currentPage: params.pageNo,
				pageSize: params.pageSize,
				totalPages: fallbackTextRes.data?.resp_result?.result?.total_page_count,
				totalCount: fallbackTextRes.data?.resp_result?.result?.total_record_count ?? products.length,
			};
		}
	}

	// If all upstream calls yielded 0 products, return empty result gracefully
	return {
		success: true,
		products: [],
		currentPage: params.pageNo,
		pageSize: params.pageSize,
		totalCount: 0,
		totalPages: 0,
	};
}

