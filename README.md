# AliExpress Dropshipping Platform Backend

Cloudflare Workers backend API with OpenAPI 3.1 documentation, built using **Hono**, **Chanfana**, and **Cloudflare D1**.

Integrated with the official **AliExpress Open Platform** ([https://openservice.aliexpress.com/](https://openservice.aliexpress.com/)) using HMAC-SHA256 signature authentication for complete token management, category tree exploration, and dropshipping product discovery.

---

## 🔑 Configured Credentials

The application is pre-configured with the provided credentials (in `wrangler.jsonc` & `src/types.ts`):
* **AppKey:** `556446`
* **App Secret:** `HusiSvXXSceP9mAcOl1317tqPlAPByG7`
* **Gateway Endpoint:** `https://api-sg.aliexpress.com`

---

## 🚀 API Endpoints Overview

### 1. Token Management (`/aliexpress/auth/*`)
Handles the complete OAuth 2.0 lifecycle and stores active seller tokens in Cloudflare D1.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/aliexpress/auth/authorize` | Generates the AliExpress OAuth login URL for sellers. Redirect them here to obtain an authorization `code`. |
| `POST` | `/aliexpress/auth/token/create` | Trades the authorization `code` for an `access_token` and `refresh_token` and persists them into D1. |
| `POST` | `/aliexpress/auth/token/refresh` | Refreshes an expired `access_token` using a `refresh_token` without user re-login. |
| `GET` | `/aliexpress/auth/tokens` | Lists all stored seller tokens with remaining validity and expiration statuses. |
| `GET` | `/aliexpress/auth/token/:userId` | Retrieves token details and expiry status for a specific user ID. |
| `DELETE` | `/aliexpress/auth/token/:userId` | Deletes stored token credentials for a user. |

#### OAuth 2.0 Workflow:
1. Call `GET /aliexpress/auth/authorize?redirect_uri=https://your-domain.com/callback`.
2. Direct the seller to the returned `authorization_url`.
3. Seller logs in and grants permission. AliExpress redirects to your callback with `?code=AUTH_CODE`.
4. Call `POST /aliexpress/auth/token/create` with `{ "code": "AUTH_CODE", "user_id": "seller_1" }`.

---

### 2. Categories & Subcategories (`/aliexpress/categories/*`)
Interacts with `aliexpress.category.redefining.getchildrenpostcategorybyid`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/aliexpress/categories` | Gets root categories (pass `parent_id=0` or omit) or child categories (pass `parent_id=<id>`). |
| `GET` | `/aliexpress/categories/:parentId/subcategories` | Gets direct subcategories for any given parent category ID (e.g. `509` for Phones & Telecommunications). |

#### Query Parameters:
* `parent_id` *(optional, default: 0)*: Parent category ID.
* `user_id` *(optional)*: Specific seller whose authorized session should be attached to the request.

---

### 3. Dropshipping Product Discovery (`/aliexpress/products/*`)
Interacts with `aliexpress.ds.recommend.feed.get` and `aliexpress.ds.product.get`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/aliexpress/products` | Retrieves a feed of dropshipping products (bestsellers, trending, by category) with prices and ratings. |
| `GET` | `/aliexpress/products/:productId` | Retrieves full product details including variants, SKUs, inventory, and images by product ID. |

#### Product List Query Parameters:
* `feed_name` *(default: "DS bestseller")*: Feed type (e.g., `DS bestseller`, `DS new arrival`).
* `category_id` *(optional)*: Filter products by AliExpress category ID.
* `page_no` *(default: 1)*: Page number.
* `page_size` *(default: 20, max 50)*: Number of items per page.
* `country` *(default: "US")*: Destination country ISO code.
* `target_currency` *(default: "USD")*: Currency for prices.
* `target_language` *(default: "EN")*: Language.
* `sort` *(optional)*: Sort criteria (`SALE_PRICE_ASC`, `SALE_PRICE_DESC`, `VOLUME_DESC`).

---

## 🛠 Database Schema

Applied via Cloudflare D1 migration (`migrations/0002_aliexpress_tokens.sql`):
```sql
CREATE TABLE IF NOT EXISTS aliexpress_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id TEXT NOT NULL UNIQUE,
    seller_id TEXT,
    account TEXT,
    user_nick TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token_expires_at INTEGER NOT NULL,
    refresh_token_expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 💻 Development & Testing

```bash
# Run migrations locally
npm run seedLocalDb

# Start local development server (with OpenAPI docs at http://localhost:8787/)
npm run dev

# Run Vitest test suite
npm run test
```
