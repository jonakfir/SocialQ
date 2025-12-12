// backend/routes/organizations.js
const express = require('express');
const {
  createOrganization,
  findOrganizationById,
  findOrganizationsByUserId,
  addUserToOrganization,
  removeUserFromOrganization,
  getOrganizationMembers,
  getUserRole,
  findUserById
} = require('../db/db');

const router = express.Router();

// Helper to get current user ID from request
function getCurrentUserId(req) {
  const idFromUser = req.user?.id || req.session?.user?.id;
  if (idFromUser) return Number(idFromUser);
  const idFromCookie = Number(req.cookies?.uid) || Number(req.cookies?.userId) || null;
  return idFromCookie || null;
}

// Helper to require authentication
function requireAuth(req, res, next) {
  const userId = getCurrentUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.currentUserId = userId;
  next();
}

// Helper to check if user is admin
async function isAdmin(userId) {
  const role = await getUserRole(userId);
  return role === 'admin';
}

// Helper to check if user is org admin for a specific organization
async function isOrgAdmin(userId, organizationId) {
  const org = await findOrganizationById(organizationId);
  if (!org) return false;
  
  // Check if user created the organization
  if (org.created_by_user_id === userId) return true;
  
  // Check if user is org_admin in memberships
  const members = await getOrganizationMembers(organizationId);
  const membership = members.find(m => m.id === userId && m.membership_role === 'org_admin');
  return !!membership;
}

// POST /organizations - Create a new organization
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const organization = await createOrganization({
      name: name.trim(),
      description: description?.trim() || null,
      createdByUserId: userId
    });

    // Automatically add creator as org_admin
    await addUserToOrganization({
      organizationId: organization.id,
      userId: userId,
      role: 'org_admin'
    });

    return res.status(201).json({ ok: true, organization });
  } catch (e) {
    console.error('[POST /organizations] error:', e);
    if (e.code === '23505' || e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Organization name already exists' });
    }
    return res.status(500).json({ error: 'Failed to create organization' });
  }
});

// GET /organizations - Get all organizations for current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const organizations = await findOrganizationsByUserId(userId);
    return res.json({ ok: true, organizations });
  } catch (e) {
    console.error('[GET /organizations] error:', e);
    return res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// GET /organizations/:id - Get organization by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const organizationId = parseInt(req.params.id, 10);

    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const organization = await findOrganizationById(organizationId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if user has access (is member or admin)
    const userOrgs = await findOrganizationsByUserId(userId);
    const hasAccess = userOrgs.some(org => org.id === organizationId) || await isAdmin(userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json({ ok: true, organization });
  } catch (e) {
    console.error('[GET /organizations/:id] error:', e);
    return res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// GET /organizations/:id/members - Get organization members
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const organizationId = parseInt(req.params.id, 10);

    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Check if user has access
    const userOrgs = await findOrganizationsByUserId(userId);
    const hasAccess = userOrgs.some(org => org.id === organizationId) || await isAdmin(userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const members = await getOrganizationMembers(organizationId);
    return res.json({ ok: true, members });
  } catch (e) {
    console.error('[GET /organizations/:id/members] error:', e);
    return res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /organizations/:id/members - Add user to organization
router.post('/:id/members', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const organizationId = parseInt(req.params.id, 10);
    const { userEmail, role = 'member' } = req.body;

    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    if (!userEmail || typeof userEmail !== 'string') {
      return res.status(400).json({ error: 'User email is required' });
    }

    // Check if user is org admin or system admin
    const userIsOrgAdmin = await isOrgAdmin(userId, organizationId);
    const userIsAdmin = await isAdmin(userId);

    if (!userIsOrgAdmin && !userIsAdmin) {
      return res.status(403).json({ error: 'Only organization admins can add members' });
    }

    // Find user by email
    const { findUserByEmail } = require('../db/db');
    const targetUser = await findUserByEmail(userEmail);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add user to organization
    const membership = await addUserToOrganization({
      organizationId,
      userId: targetUser.id,
      role: role === 'org_admin' ? 'org_admin' : 'member'
    });

    return res.status(201).json({ ok: true, membership });
  } catch (e) {
    console.error('[POST /organizations/:id/members] error:', e);
    return res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /organizations/:id/members/:userId - Remove user from organization
router.delete('/:id/members/:memberId', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const organizationId = parseInt(req.params.id, 10);
    const memberId = parseInt(req.params.memberId, 10);

    if (isNaN(organizationId) || isNaN(memberId)) {
      return res.status(400).json({ error: 'Invalid organization or member ID' });
    }

    // Check if user is org admin or system admin
    const userIsOrgAdmin = await isOrgAdmin(userId, organizationId);
    const userIsAdmin = await isAdmin(userId);

    if (!userIsOrgAdmin && !userIsAdmin) {
      return res.status(403).json({ error: 'Only organization admins can remove members' });
    }

    // Don't allow removing the creator
    const organization = await findOrganizationById(organizationId);
    if (organization && organization.created_by_user_id === memberId) {
      return res.status(400).json({ error: 'Cannot remove organization creator' });
    }

    await removeUserFromOrganization({ organizationId, userId: memberId });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /organizations/:id/members/:memberId] error:', e);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;

