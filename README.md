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

---

### 2. Categories & Subcategories (`/aliexpress/categories/*`)
Interacts with `aliexpress.category.redefining.getchildrenpostcategorybyid`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/aliexpress/categories` | Gets root categories (pass `parent_id=0` or omit) or child categories (pass `parent_id=<id>`). |
| `GET` | `/aliexpress/categories/:parentId/subcategories` | Gets direct subcategories for any given parent category ID (e.g. `509` for Phones & Telecommunications). |
| `GET` | `/aliexpress/categories/:parentId/subcategories/:subcategoryId/products` | Gets dropshipping products directly for a specific parent category and subcategory. |
| `GET` | `/aliexpress/categories/:categoryId/products` | Gets dropshipping product list filtered by category ID (and optional `?subcategory_id=`). |

---

### 3. Dropshipping Product Discovery & Search (`/aliexpress/products/*`)
Interacts with `aliexpress.ds.text.search`, `aliexpress.ds.recommend.feed.get`, and `aliexpress.ds.product.get`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/aliexpress/products/by-category` | **Get Products by Category & Subcategory** (query: `category_id`, `subcategory_id`, `q`, `sort`, `country`, `target_currency`). Does not require feed names. |
| `GET` | `/aliexpress/products/search` | **Search by Product Name / Keyword** (e.g. `?q=wireless+earbuds&category_id=509`). |
| `GET` | `/aliexpress/products` | Retrieves curated dropshipping product feeds (bestsellers, trending) with prices, discounts, and ratings. |
| `GET` | `/aliexpress/products/:productId` | Retrieves full product details including variants, SKUs, inventory, and images by product ID. |

#### Search Parameters (`/aliexpress/products/search`):
* `q` *(required)*: Search query / product name keywords.
* `category_id` *(optional)*: Constrain search to a category or subcategory ID.
* `page_no` *(default: 1)*: Page number.
* `page_size` *(default: 20, max 50)*: Number of items per page.
* `country` *(default: "US")*: Destination country ISO code.
* `target_currency` *(default: "USD")*: Currency for prices.
* `target_language` *(default: "EN")*: Language.
* `sort` *(optional)*: Sort criteria (`SALE_PRICE_ASC`, `SALE_PRICE_DESC`, `VOLUME_DESC`).

---

### 4. Customer Profile (`/profile`)
Persists and retrieves customer profiles (name, email, shipping addresses, phone, subscriber ID) in Supabase. Authenticated via `Bearer <session_token>`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/profile` | Retrieves current customer profile and shipping address. |
| `PATCH` | `/profile` | Partially updates user profile fields (name, email, avatar, address, city, etc.). |
| `PUT` | `/profile` | Full/idempotent update of customer profile details. |
| `DELETE` | `/profile` | Deletes user profile and terminates all active sessions. |

---

### 5. Customer Orders (`/orders`)
Enables dropshipping checkout, customer order tracking, cancellation, and metrics. Authenticated via `Bearer <session_token>`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/orders` | Places a new dropshipping order with items, shipping address, and payment method. Auto-calculates totals and sets status to `pending`. |
| `GET` | `/orders` | Returns a paginated list of orders for the customer with optional `status` filter (`page_no`, `page_size`). |
| `GET` | `/orders/stats` | Returns real-time counts of customer orders categorized by status (`pending`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`). |
| `GET` | `/orders/:orderId` | Retrieves full order details including line items, shipping address, and AliExpress tracking number by UUID or Order Number (`ORD-...`). |
| `POST` | `/orders/:orderId/cancel` | Cancels an order in `pending`, `paid`, or `processing` status with an optional cancellation reason. |

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

# Start local development server (with Swagger docs at http://localhost:8787/)
npm run dev

# Run Vitest test suite
npm run test
```
