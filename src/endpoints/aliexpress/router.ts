import { Hono } from "hono";
import { fromHono } from "chanfana";
import { cfCache } from "../../middleware/cache";
import { AliExpressAuthorize } from "./auth/authorize";
import { AliExpressAuthCallback } from "./auth/callback";
import { AliExpressTokenCreate } from "./auth/tokenCreate";
import { AliExpressTokenRefresh } from "./auth/tokenRefresh";
import { AliExpressTokenList } from "./auth/tokenList";
import { AliExpressTokenGet } from "./auth/tokenGet";
import { AliExpressTokenDelete } from "./auth/tokenDelete";
import { AliExpressCategoryList } from "./categories/categoryList";
import { AliExpressSubCategoryList } from "./categories/subCategoryList";
import { AliExpressCategoryProducts } from "./categories/categoryProducts";
import { AliExpressSubCategoryProducts } from "./categories/subCategoryProducts";
import { AliExpressProductList } from "./products/productList";
import { AliExpressProductSearch } from "./products/productSearch";
import { AliExpressProductDetail } from "./products/productDetail";
import { AliExpressFeedNameList } from "./products/feedNameList";
import { AliExpressProductByCategory } from "./products/productByCategory";

const subApp = new Hono();

// Cloudflare Workers Caching Middleware: 1 Day (86,400 seconds) for all data endpoints
const ONE_DAY_SECONDS = 86400; // 24 hours

// Categories
subApp.use("/categories", cfCache(ONE_DAY_SECONDS));
subApp.use("/categories/:parentId/subcategories", cfCache(ONE_DAY_SECONDS));
subApp.use("/categories/:parentId/subcategories/:subcategoryId/products", cfCache(ONE_DAY_SECONDS));

// Feed Names
subApp.use("/feeds", cfCache(ONE_DAY_SECONDS));

// Category Products
subApp.use("/categories/:categoryId/products", cfCache(ONE_DAY_SECONDS));

// Products by Category & Subcategory
subApp.use("/products/by-category", cfCache(ONE_DAY_SECONDS));
subApp.use("/products/category", cfCache(ONE_DAY_SECONDS));

// Products Feed List
subApp.use("/products", cfCache(ONE_DAY_SECONDS));

// Product Search
subApp.use("/products/search", cfCache(ONE_DAY_SECONDS));

// Product Details
subApp.use("/products/:productId", cfCache(ONE_DAY_SECONDS));

export const aliexpressRouter = fromHono(subApp);

// Token Management Endpoints
aliexpressRouter.get("/auth/authorize", AliExpressAuthorize);
aliexpressRouter.get("/auth/callback", AliExpressAuthCallback);
aliexpressRouter.post("/auth/token/create", AliExpressTokenCreate);
aliexpressRouter.post("/auth/token/refresh", AliExpressTokenRefresh);
aliexpressRouter.get("/auth/tokens", AliExpressTokenList);
aliexpressRouter.get("/auth/token/:userId", AliExpressTokenGet);
aliexpressRouter.delete("/auth/token/:userId", AliExpressTokenDelete);

// Categories Endpoints
aliexpressRouter.get("/categories", AliExpressCategoryList);
aliexpressRouter.get("/categories/:parentId/subcategories", AliExpressSubCategoryList);
aliexpressRouter.get("/categories/:parentId/subcategories/:subcategoryId/products", AliExpressSubCategoryProducts);
aliexpressRouter.get("/categories/:categoryId/products", AliExpressCategoryProducts);

// Products Endpoints
aliexpressRouter.get("/feeds", AliExpressFeedNameList);
// Note: Specific paths (/products/search, /products/by-category, etc.) must precede /products/:productId to prevent route shadowing
aliexpressRouter.get("/products/search", AliExpressProductSearch);
aliexpressRouter.get("/products/by-category", AliExpressProductByCategory);
aliexpressRouter.get("/products/category", AliExpressProductByCategory);
aliexpressRouter.get("/products", AliExpressProductList);
aliexpressRouter.get("/products/:productId", AliExpressProductDetail);
