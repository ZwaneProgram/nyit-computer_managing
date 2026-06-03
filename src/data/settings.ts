// Settings data layer — shop info (singleton) + account management.
import { http } from '../lib/api';

export interface ShopSettings {
  shop_name: string;
  address: string | null;
  tax_id: string | null;
  phone: string | null;
  default_low: number;
  currency: string;
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

// ----- Shop settings -----
export async function fetchSettings(): Promise<ShopSettings> {
  const { settings: s } = await http.get<{ settings: Record<string, unknown> }>('/api/settings');
  return {
    shop_name: (s.shop_name as string) ?? '',
    address: (s.address as string) ?? null,
    tax_id: (s.tax_id as string) ?? null,
    phone: (s.phone as string) ?? null,
    default_low: n(s.default_low),
    currency: (s.currency as string) ?? 'THB',
  };
}

export async function updateSettings(input: ShopSettings): Promise<ShopSettings> {
  const { settings: s } = await http.put<{ settings: Record<string, unknown> }>('/api/settings', input);
  return {
    shop_name: (s.shop_name as string) ?? '',
    address: (s.address as string) ?? null,
    tax_id: (s.tax_id as string) ?? null,
    phone: (s.phone as string) ?? null,
    default_low: n(s.default_low),
    currency: (s.currency as string) ?? 'THB',
  };
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
