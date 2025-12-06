/**
 * Admin utility functions
 */

/**
 * Check if a user is an admin
 */
export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin';
}

/**
 * Check if current user is admin from layout data
 */
export function checkAdmin(user: any): boolean {
  return user?.role === 'admin';
}
