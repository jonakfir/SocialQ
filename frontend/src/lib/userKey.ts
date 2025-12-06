/**
 * Get a unique key for the current user based on their ID and email.
 * This is used to scope localStorage keys so each user has their own game history.
 * Checks mock auth storage first (dev mode), then falls back to regular auth storage.
 */
export function getUserKey(): string {
  if (typeof localStorage === 'undefined') {
    return 'guest';
  }
  
  // Check mock auth storage first (dev mode)
  try {
    const mockAuth = localStorage.getItem('mock_auth_user');
    if (mockAuth) {
      const user = JSON.parse(mockAuth);
      if (user?.id && user?.email) {
        return `${user.email}_${user.id}`;
      }
    }
  } catch {
    // Ignore parse errors
  }
  
  // Fallback to regular auth storage (if any)
  const uid = localStorage.getItem('userId');
  const uname = localStorage.getItem('username') || localStorage.getItem('email') || 'guest';
  return uid ? `${uname}_${uid}` : uname;
}