-- Nyit Computer — database schema (PostgreSQL).
-- Idempotent: safe to run repeatedly (CREATE TABLE IF NOT EXISTS).
-- Single-role auth: every account has full access.

create table if not exists users (
  id            bigint generated always as identity primary key,
  username      text not null unique,
  password_hash text not null,
  full_name     text,
  role          text not null default 'staff' check (role in ('owner', 'staff')),
  created_at    timestamptz not null default now()
);

create table if not exists categories (
  id   bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  sort int  not null default 0
);

-- A product is a *catalog model* (e.g. "RTX 5070"). Physical units live in
-- product_serials, so stock = count of in_stock serials (derived, not stored).
-- Per-item attributes (sku/cost/price/warranty/note/image) live on the unit.
create table if not exists products (
  id              bigint generated always as identity primary key,
  category_id     bigint references categories(id) on delete set null,
  name            text not null,
  brand           text,
  model           text,
  low             int not null default 0,
  notes           text,
  status          text not null default 'active' check (status in ('active', 'draft')),
  created_by      bigint references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Each row is one physical unit, carrying its own sku/cost/price/warranty/note/image.
create table if not exists product_serials (
  id              bigint generated always as identity primary key,
  product_id      bigint not null references products(id) on delete cascade,
  serial          text not null unique,
  sku             text,
  cost            numeric(12,2) not null default 0,
  price           numeric(12,2) not null default 0,
  warranty_months int not null default 0,
  note            text,
  image_url       text,
  status          text not null default 'in_stock' check (status in ('draft', 'in_stock', 'sold', 'returned')),
  sale_id         bigint, -- FK added after sales table exists (see bottom)
  created_at      timestamptz not null default now()
);

create table if not exists bundles (
  id           bigint generated always as identity primary key,
  name         text not null,
  discount_pct numeric(5,2) not null default 0,
  created_by   bigint references users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists bundle_items (
  bundle_id  bigint not null references bundles(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  primary key (bundle_id, product_id)
);

create table if not exists sales (
  id               bigint generated always as identity primary key,
  kind             text not null check (kind in ('item', 'bundle')),
  customer_name    text,
  customer_phone   text,
  customer_address text,
  tax_id           text,
  payment_method   text check (payment_method in ('cash', 'transfer', 'card', 'qr')),
  payment_status   text check (payment_status in ('paid', 'pending', 'partial')),
  shipping         numeric(12,2) not null default 0,
  discount         numeric(12,2) not null default 0,
  subtotal         numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  profit           numeric(12,2) not null default 0,
  staff_id         bigint references users(id) on delete set null,
  status           text not null default 'paid' check (status in ('paid', 'pending', 'refunded')),
  created_at       timestamptz not null default now()
);

create table if not exists sale_items (
  id         bigint generated always as identity primary key,
  sale_id    bigint not null references sales(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  bundle_id  bigint references bundles(id) on delete set null,
  qty        int not null default 1,
  unit_price numeric(12,2) not null default 0,
  unit_cost  numeric(12,2) not null default 0
);

create table if not exists stock_movements (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references products(id) on delete cascade,
  delta       int not null,
  reason      text not null check (reason in ('purchase', 'sale', 'adjustment', 'return')),
  ref_sale_id bigint references sales(id) on delete set null,
  note        text,
  created_by  bigint references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists shop_settings (
  id          int primary key default 1,
  shop_name   text not null default 'Nyit Computer',
  address     text,
  tax_id      text,
  phone       text,
  default_low int  not null default 5,
  currency    text not null default 'THB',
  constraint shop_settings_singleton check (id = 1)
);
insert into shop_settings (id) values (1) on conflict (id) do nothing;

-- AI sales-post footer (2026-06-17): fixed shop info appended verbatim to every
-- generated Facebook/Marketplace post, so the AI never invents phone/links. All
-- owner-editable in Settings. Idempotent — safe on existing databases.
alter table shop_settings add column if not exists post_warranty text;
alter table shop_settings add column if not exists post_shipping text;
alter table shop_settings add column if not exists post_payment  text;
alter table shop_settings add column if not exists post_phone    text;
alter table shop_settings add column if not exists post_website  text;
alter table shop_settings add column if not exists post_page_url text;
alter table shop_settings add column if not exists post_shopee_url text;
alter table shop_settings add column if not exists post_hashtags text;
alter table shop_settings add column if not exists post_extra    text;

-- Facebook page posting (2026-06-17): owner stores Page ID + long-lived Page
-- Access Token in Settings; backend posts on their behalf via Graph API.
alter table shop_settings add column if not exists fb_page_id           text;
alter table shop_settings add column if not exists fb_page_access_token text;

-- AI product description (2026-06-17): owner can generate or type a Thai product
-- description shown on the public storefront below the model name.
alter table products add column if not exists description text;

-- AI product specs (2026-06-17): structured key-value spec sheet stored as a
-- JSON array of [key, value] pairs, e.g. [["Brand","GIGABYTE"],["CUDA Cores","21760"]].
-- Displayed as a table on the public storefront.
alter table products add column if not exists specs jsonb;

-- product_serials.sale_id -> sales(id) (added here because sales is defined later).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_serials_sale_fk'
  ) then
    alter table product_serials
      add constraint product_serials_sale_fk
      foreign key (sale_id) references sales(id) on delete set null;
  end if;
end $$;

-- Converge databases migrated before the serials/drafts changes (no-ops on fresh).
alter table products drop column if exists stock;
alter table products add column if not exists status text not null default 'active';
do $$
begin
  -- sku may already be dropped by the per-item migration below — guard it.
  if exists (select 1 from information_schema.columns
             where table_name = 'products' and column_name = 'sku') then
    alter table products alter column sku drop not null;
  end if;
  if exists (select 1 from pg_constraint where conname = 'products_sku_key') then
    alter table products drop constraint products_sku_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_status_check') then
    alter table products add constraint products_status_check check (status in ('active', 'draft'));
  end if;
end $$;
alter table product_serials add column if not exists created_at timestamptz not null default now();

-- Per-item inventory (2026-06-09): move sku/cost/price/warranty/image from the
-- catalog (products) down to each unit (product_serials). Idempotent.
alter table product_serials add column if not exists sku             text;
alter table product_serials add column if not exists cost            numeric(12,2) not null default 0;
alter table product_serials add column if not exists price           numeric(12,2) not null default 0;
alter table product_serials add column if not exists warranty_months int not null default 0;
alter table product_serials add column if not exists note            text;
alter table product_serials add column if not exists image_url       text;
create unique index if not exists uniq_serials_sku on product_serials(sku) where sku is not null;

-- One-time copy of catalog values onto units, BEFORE dropping the columns.
-- Only fills zero/null so re-runs never clobber per-unit edits. Guarded so it
-- no-ops once products no longer has the columns. SKU is intentionally NOT
-- copied (would collide with the per-unit unique index).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'products' and column_name = 'price') then
    update product_serials ps set
      cost            = case when ps.cost = 0 then p.cost else ps.cost end,
      price           = case when ps.price = 0 then p.price else ps.price end,
      warranty_months = case when ps.warranty_months = 0 then p.warranty_months else ps.warranty_months end,
      image_url       = coalesce(ps.image_url, p.image_url)
    from products p where p.id = ps.product_id;
  end if;
end $$;

-- Drop the moved columns from the catalog.
drop index if exists uniq_products_sku;
alter table products drop column if exists sku;
alter table products drop column if exists cost;
alter table products drop column if exists price;
alter table products drop column if exists warranty_months;
alter table products drop column if exists image_url;

-- Per-unit draft (2026-06-09): a unit can be 'draft' (recorded but not stock,
-- not sellable). Widen the status check + flip old draft catalogs to active.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'product_serials_status_check') then
    alter table product_serials drop constraint product_serials_status_check;
  end if;
  alter table product_serials add constraint product_serials_status_check
    check (status in ('draft', 'in_stock', 'sold', 'returned'));
end $$;
update products set status = 'active' where status = 'draft';

-- Account roles (added 2026-06-03): owner manages accounts + settings, staff
-- just uses the shop. Converge older DBs: add the column, then make sure there
-- is at least one owner by promoting the earliest-created account.
alter table users add column if not exists role text not null default 'staff';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_check') then
    alter table users add constraint users_role_check check (role in ('owner', 'staff'));
  end if;
end $$;
update users set role = 'owner'
 where id = (select id from users order by id limit 1)
   and not exists (select 1 from users where role = 'owner');

-- Per-bundle warranty (added 2026-07-05): 0 = shop warranty (30 days), >0 = months.
alter table bundles add column if not exists warranty_months int not null default 0;

-- Free-text warranty (added 2026-07-05): when set, overrides warranty_months for
-- display (e.g. "15 วัน", "ประกันตลอดชีพ"). Applies to units and bundles.
alter table product_serials add column if not exists warranty_text text;
alter table bundles         add column if not exists warranty_text text;

-- Seed the default product categories (idempotent).
insert into categories (name, slug, sort) values
  ('การ์ดจอ', 'gpu', 1),
  ('ซีพียู', 'cpu', 2),
  ('เมนบอร์ด', 'mb', 3),
  ('แรม', 'ram', 4),
  ('หน่วยเก็บข้อมูล', 'ssd', 5),
  ('พาวเวอร์', 'psu', 6),
  ('จอแสดงผล', 'monitor', 7),
  ('อุปกรณ์เสริม', 'peripheral', 8)
on conflict (slug) do nothing;

-- Helpful indexes.
create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_status   on products(status);
create index if not exists idx_serials_product   on product_serials(product_id);
create index if not exists idx_serials_status    on product_serials(status);
create index if not exists idx_sale_items_sale   on sale_items(sale_id);
create index if not exists idx_stock_mov_product on stock_movements(product_id);
