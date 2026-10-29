import { Hono } from "hono";
import { fromHono } from "chanfana";
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
import { AliExpressProductList } from "./products/productList";
import { AliExpressProductSearch } from "./products/productSearch";
import { AliExpressProductDetail } from "./products/productDetail";

export const aliexpressRouter = fromHono(new Hono());

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
aliexpressRouter.get("/categories/:categoryId/products", AliExpressCategoryProducts);

// Products Endpoints
// Note: /products/search must precede /products/:productId to prevent route shadowing
aliexpressRouter.get("/products/search", AliExpressProductSearch);
aliexpressRouter.get("/products", AliExpressProductList);
aliexpressRouter.get("/products/:productId", AliExpressProductDetail);
