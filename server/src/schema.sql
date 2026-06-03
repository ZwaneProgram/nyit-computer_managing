-- Nyit Computer — database schema (PostgreSQL).
-- Idempotent: safe to run repeatedly (CREATE TABLE IF NOT EXISTS).
-- Single-role auth: every account has full access.

create table if not exists users (
  id            bigint generated always as identity primary key,
  username      text not null unique,
  password_hash text not null,
  full_name     text,
  created_at    timestamptz not null default now()
);

create table if not exists categories (
  id   bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  sort int  not null default 0
);

-- A product is a *model* (e.g. "RTX 5070"). Physical units live in
-- product_serials, so stock = count of in_stock serials (derived, not stored).
-- sku is nullable because drafts can be saved incomplete.
create table if not exists products (
  id              bigint generated always as identity primary key,
  category_id     bigint references categories(id) on delete set null,
  name            text not null,
  sku             text,
  brand           text,
  model           text,
  cost            numeric(12,2) not null default 0,
  price           numeric(12,2) not null default 0,
  low             int not null default 0,
  warranty_months int not null default 0,
  image_url       text,
  notes           text,
  status          text not null default 'active' check (status in ('active', 'draft')),
  created_by      bigint references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- SKU unique only when present (drafts may have none).
create unique index if not exists uniq_products_sku on products(sku) where sku is not null;

create table if not exists product_serials (
  id         bigint generated always as identity primary key,
  product_id bigint not null references products(id) on delete cascade,
  serial     text not null unique,
  status     text not null default 'in_stock' check (status in ('in_stock', 'sold', 'returned')),
  sale_id    bigint, -- FK added after sales table exists (see bottom)
  created_at timestamptz not null default now()
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
alter table products alter column sku drop not null;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'products_sku_key') then
    alter table products drop constraint products_sku_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_status_check') then
    alter table products add constraint products_status_check check (status in ('active', 'draft'));
  end if;
end $$;
alter table product_serials add column if not exists created_at timestamptz not null default now();

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
