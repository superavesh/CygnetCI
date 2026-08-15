// src/lib/permissions.ts
// Client-side permission helpers. Reads the user (with roles + permissions)
// stored at login. Server-side enforcement is authoritative; this only drives UI.

export interface StoredUser {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  is_superuser?: boolean;
  roles?: { id: number; name: string }[];
  permissions?: Record<string, string[]>;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function isSuperuser(): boolean {
  return !!getStoredUser()?.is_superuser;
}

/** True if the current user may perform `action` on `resource`. Superusers always can. */
export function hasPermission(resource: string, action: string): boolean {
  const user = getStoredUser();
  if (!user) return false;
  if (user.is_superuser) return true;
  const perms = user.permissions || {};
  const allowed = perms[resource.toLowerCase()] || [];
  return allowed.includes(action.toLowerCase());
}

export function canRead(resource: string): boolean {
  return hasPermission(resource, 'read');
}
