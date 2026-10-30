-- ====================================================================
-- Supabase Migration: Mobile App Authentication (Ideamart OTP),
-- Profiles, Orders, and Order Items
-- ====================================================================

-- Enable pgcrypto / uuid extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------
-- 1. PROFILES TABLE
-- Stores user account info identified by their verified phone number
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state_province TEXT,
    postal_code TEXT,
    country TEXT NOT NULL DEFAULT 'LK',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for phone lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);

-- Trigger for profiles updated_at
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------------------------------
-- 2. APP_SESSIONS TABLE
-- Stores active bearer session tokens for mobile app users
-- Fields requested: id, token_hash, phone, expires_at, created_at
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL REFERENCES public.profiles(phone) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for session lookup and expiry cleanup
CREATE INDEX IF NOT EXISTS idx_app_sessions_token_hash ON public.app_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_app_sessions_phone ON public.app_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON public.app_sessions(expires_at);

-- --------------------------------------------------------------------
-- 3. ORDERS TABLE
-- Stores dropshipping customer orders placed through the mobile app
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    user_phone TEXT NOT NULL REFERENCES public.profiles(phone) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, processing, shipped, delivered, cancelled
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'LKR',
    payment_method TEXT, -- ideamart_direct, card, bank_transfer, cod
    payment_status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    payment_reference TEXT,
    shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    aliexpress_order_id TEXT,
    tracking_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for order lookups
CREATE INDEX IF NOT EXISTS idx_orders_user_phone ON public.orders(user_phone);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Trigger for orders updated_at
DROP TRIGGER IF EXISTS set_orders_updated_at ON public.orders;
CREATE TRIGGER set_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------------------------------
-- 4. ORDER_ITEMS TABLE
-- Individual line items associated with each customer order
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_title TEXT NOT NULL,
    product_image TEXT,
    product_detail_url TEXT,
    sku_id TEXT,
    sku_properties TEXT,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    total_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'LKR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying items for an order
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- --------------------------------------------------------------------
-- Row Level Security (RLS) setup
-- --------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically. For anon/authenticated keys:
-- Allow read/write access via the backend worker API service
CREATE POLICY "Allow service role full access to profiles" ON public.profiles
    FOR ALL USING (true);

CREATE POLICY "Allow service role full access to app_sessions" ON public.app_sessions
    FOR ALL USING (true);

CREATE POLICY "Allow service role full access to orders" ON public.orders
    FOR ALL USING (true);

CREATE POLICY "Allow service role full access to order_items" ON public.order_items
    FOR ALL USING (true);

