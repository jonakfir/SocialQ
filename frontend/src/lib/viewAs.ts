export type ViewAsMode = 'admin' | 'personal' | 'org_admin';

const KEY = 'VIEW_AS_MODE';
const ORG_ID_KEY = 'VIEW_AS_ORG_ID';

export function getViewAs(): ViewAsMode {
  if (typeof localStorage === 'undefined') return 'admin';
  const v = (localStorage.getItem(KEY) || 'admin').toLowerCase();
  if (v === 'personal') return 'personal';
  if (v === 'org_admin') return 'org_admin';
  return 'admin';
}

export function setViewAs(mode: ViewAsMode, orgId?: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, mode);
      if (orgId) {
        localStorage.setItem(ORG_ID_KEY, orgId);
      } else if (mode !== 'org_admin') {
        localStorage.removeItem(ORG_ID_KEY);
      }
    }
  } catch {}
}

export function getViewAsOrgId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ORG_ID_KEY) || null;
}

export function clearViewAs() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(KEY);
      localStorage.removeItem(ORG_ID_KEY);
    }
  } catch {}
}

export function isViewingAsPersonal(): boolean {
  return getViewAs() === 'personal';
}

export function isViewingAsOrgAdmin(): boolean {
  return getViewAs() === 'org_admin';
}
