// Settings data layer — shop info (singleton) + account management.
import { http } from '../lib/api';

export interface ShopSettings {
  shop_name: string;
  address: string | null;
  tax_id: string | null;
  phone: string | null;
  default_low: number;
  currency: string;
  // AI sales-post footer (appended verbatim to generated posts).
  post_warranty: string | null;
  post_shipping: string | null;
  post_payment: string | null;
  post_phone: string | null;
  post_website: string | null;
  post_page_url: string | null;
  post_shopee_url: string | null;
  post_hashtags: string | null;
  post_extra: string | null;
  // Facebook page posting — owner stores once in Settings.
  fb_page_id: string | null;
  fb_page_access_token: string | null;
}

export interface Account {
  id: number;
  username: string;
  full_name: string | null;
  role: 'owner' | 'staff';
  created_at: string;
}

export interface NewAccount {
  username: string;
  password: string;
  full_name?: string;
  role: 'owner' | 'staff';
}

const n = (v: unknown): number => (v == null ? 0 : Number(v));
const str = (v: unknown): string | null => ((v as string)?.trim() ? (v as string) : null);

function normSettings(s: Record<string, unknown>): ShopSettings {
  return {
    shop_name: (s.shop_name as string) ?? '',
    address: (s.address as string) ?? null,
    tax_id: (s.tax_id as string) ?? null,
    phone: (s.phone as string) ?? null,
    default_low: n(s.default_low),
    currency: (s.currency as string) ?? 'THB',
    post_warranty: str(s.post_warranty),
    post_shipping: str(s.post_shipping),
    post_payment: str(s.post_payment),
    post_phone: str(s.post_phone),
    post_website: str(s.post_website),
    post_page_url: str(s.post_page_url),
    post_shopee_url: str(s.post_shopee_url),
    post_hashtags: str(s.post_hashtags),
    post_extra: str(s.post_extra),
    fb_page_id: str(s.fb_page_id),
    fb_page_access_token: str(s.fb_page_access_token),
  };
}

// ----- Shop settings -----
export async function fetchSettings(): Promise<ShopSettings> {
  const { settings: s } = await http.get<{ settings: Record<string, unknown> }>('/api/settings');
  return normSettings(s);
}

export async function updateSettings(input: ShopSettings): Promise<ShopSettings> {
  const { settings: s } = await http.put<{ settings: Record<string, unknown> }>('/api/settings', input);
  return normSettings(s);
}

// ----- Accounts -----
export async function fetchUsers(): Promise<Account[]> {
  const { users } = await http.get<{ users: Record<string, unknown>[] }>('/api/users');
  return users.map((u) => ({
    id: Number(u.id),
    username: u.username as string,
    full_name: (u.full_name as string) ?? null,
    role: (u.role as 'owner' | 'staff') ?? 'staff',
    created_at: u.created_at as string,
  }));
}

export async function createUser(input: NewAccount): Promise<void> {
  await http.post('/api/users', input);
}

export async function deleteUser(id: number): Promise<void> {
  await http.del(`/api/users/${id}`);
}

export async function changePassword(
  id: number,
  newPassword: string,
  currentPassword?: string,
): Promise<void> {
  await http.put(`/api/users/${id}/password`, {
    new_password: newPassword,
    current_password: currentPassword,
  });
}
