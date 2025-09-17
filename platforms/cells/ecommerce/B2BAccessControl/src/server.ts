/**
 * B2BAccessControl Cell Server
 * CELLULAR REUSABILITY: 100% extends existing AuthenticationCore and permission-middleware
 * Nigerian Market: Naira pricing, business verification, local compliance
 */

import 'server-only';
import { z } from 'zod';
import { execute_sql } from '../../../../../lib/database';
import crypto from 'crypto';

// ✅ CELLULAR INDEPENDENCE: All authentication and permissions through Cell Gateway v2
import { cellBus } from '../../../../../cell-sdk/loader/cell-bus';

// ===================================================================
// CELLULAR INDEPENDENCE HELPER FUNCTIONS
// Replace all @/lib/* imports with Cell Gateway v2 communication
// ===================================================================

/**
 * ✅ CELLULAR INDEPENDENCE: Get secure tenant ID via Cell Gateway v2
 */
async function getSecureTenantId(): Promise<string> {
  try {
    const authResult = await cellBus.call('auth/AuthenticationCore', 'getCurrentTenant', {});
    if (!authResult.success || !authResult.tenantId) {
      throw new Error('Failed to get tenant ID');
    }
    return authResult.tenantId;
  } catch (error) {
    console.error('Error getting secure tenant ID:', error);
    throw new Error('Authentication required');
  }
}

/**
 * ✅ CELLULAR INDEPENDENCE: Get current user via Cell Gateway v2
 */
async function getCurrentUser(): Promise<{ id: string; email?: string; username?: string } | null> {
  try {
    const authResult = await cellBus.call('auth/AuthenticationCore', 'getCurrentUser', {});
    if (!authResult.success) {
      return null;
    }
    return authResult.user || null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * ✅ CELLULAR INDEPENDENCE: Check permissions via Cell Gateway v2
 */
async function hasPermission(userId: string, tenantId: string, permission: string): Promise<boolean> {
  try {
    const permResult = await cellBus.call('auth/AuthenticationCore', 'checkPermission', {
      userId,
      tenantId,
      permission
    });
    return permResult.success && permResult.hasPermission === true;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * ✅ CELLULAR INDEPENDENCE: Get user permissions via Cell Gateway v2
 */
async function getUserPermissions(userId: string, tenantId: string): Promise<{ allPermissions: string[] }> {
  try {
    const permResult = await cellBus.call('auth/AuthenticationCore', 'getUserPermissions', {
      userId,
      tenantId
    });
    if (!permResult.success) {
      return { allPermissions: [] };
    }
    return { allPermissions: permResult.permissions || [] };
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return { allPermissions: [] };
  }
}

// ===================================================================
// VALIDATION SCHEMAS - Input validation for B2B operations
// ===================================================================

const CreateB2BGroupSchema = z.object({
  groupName: z.string().min(2).max(100),
  groupCode: z.string().min(2).max(50).regex(/^[A-Z0-9_]+$/),
  description: z.string().optional(),
  groupType: z.enum(['wholesale', 'retail', 'vip', 'employee', 'guest', 'distributor', 'reseller']),
  priceVisibility: z.enum(['hidden', 'visible', 'partial', 'request_quote']),
  hideFromGuests: z.boolean().default(false),
  hidePriceText: z.string().max(200).optional(),
  loginPromptText: z.string().max(200).optional(),
  guestMessage: z.string().max(500).optional(),
  allowedCategories: z.array(z.string().uuid()).optional(),
  restrictedCategories: z.array(z.string().uuid()).optional(),
  categoryAccessType: z.enum(['whitelist', 'blacklist', 'unrestricted']).default('unrestricted'),
  currencyPreference: z.enum(['NGN', 'USD', 'GBP']).default('NGN'),
  minOrderAmount: z.number().min(0).default(0),
  creditLimit: z.number().min(0).default(0),
  paymentTermsDays: z.number().min(0).default(30),
  requiresApproval: z.boolean().default(false),
  priorityLevel: z.number().min(1).max(10).default(5)
});

const AssignUserToGroupSchema = z.object({
  userId: z.string().uuid(),
  groupId: z.string().uuid(), 
  membershipType: z.enum(['regular', 'trial', 'premium', 'lifetime']).default('regular'),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  autoRenewal: z.boolean().default(true),
  renewalPeriodMonths: z.number().min(1).default(12),
  discountPercentage: z.number().min(0).max(100).default(0),
  creditLimitOverride: z.number().min(0).optional(),
  salesRepId: z.string().uuid().optional(),
  territory: z.string().max(100).optional(),
  businessRegistration: z.string().max(100).optional(),
  taxIdentification: z.string().max(50).optional()
});

const CheckAccessSchema = z.object({
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  userId: z.string().uuid().optional(),
  action: z.enum(['view_price', 'view_product', 'add_to_cart', 'purchase']).default('view_price')
});

const CategoryAccessRuleSchema = z.object({
  ruleScope: z.enum(['group', 'user', 'global']),
  groupId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  accessType: z.enum(['allow', 'deny', 'request_approval']),
  minimumOrderValue: z.number().min(0).default(0),
  maximumOrderQuantity: z.number().min(1).optional(),
  requiresLicense: z.boolean().default(false),
  ageVerificationRequired: z.boolean().default(false),
  priority: z.number().min(1).max(10).default(5),
  description: z.string().optional()
});

// ===================================================================
// TYPES - TypeScript interfaces for B2B operations
// ===================================================================

interface B2BGroup {
  id: string;
  tenantId: string;
  groupName: string;
  groupCode: string;
  groupType: string;
  priceVisibility: string;
  memberCount?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface B2BGroupMembership {
  id: string;
  userId: string;
  groupId: string;
  membershipStatus: string;
  effectiveDate: string;
  expiryDate?: string;
  discountPercentage: number;
  territory?: string;
}

interface AccessCheckResult {
  canViewPrice: boolean;
  canViewProduct: boolean;
  restrictionReason?: string;
  alternativeMessage?: string;
  loginRequired: boolean;
  groupRequired: boolean;
  appliedRules: string[];
}

interface CategoryAccessResult {
  hasAccess: boolean;
  restrictionLevel: 'none' | 'partial' | 'full';
  restrictionReason?: string;
  allowedActions: string[];
  requiredApprovals: string[];
}

// ===================================================================
// B2B GROUP MANAGEMENT - CELLULAR REUSABILITY with existing roles
// ===================================================================

/**
 * Create B2B Group with cellular reusability
 * EXTENDS: existing role system, no duplicate permissions logic
 */
export const createB2BGroup = async (params: z.infer<typeof CreateB2BGroupSchema>) => {
  try {
    // CELLULAR REUSABILITY: Use existing authentication
    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    // ✅ CELLULAR INDEPENDENCE: Check permissions via Cell Gateway v2
    const hasCreatePermission = await hasPermission(user.id, tenantId, 'b2b.groups.create');
    if (!hasCreatePermission) {
      return { success: false, error: 'Insufficient permissions to create B2B groups' };
    }

    // Validate input
    const validated = CreateB2BGroupSchema.parse(params);

    // Check for unique group name and code
    const existingCheck = await execute_sql(`
      SELECT id FROM b2b_user_groups 
      WHERE tenant_id = $1 AND (group_name = $2 OR group_code = $3)
    `, [tenantId, validated.groupName, validated.groupCode]);

    if (existingCheck.rows.length > 0) {
      return { success: false, error: 'Group name or code already exists' };
    }

    // Create the B2B group
    const groupId = crypto.randomUUID();
    await execute_sql(`
      INSERT INTO b2b_user_groups (
        id, tenant_id, group_name, group_code, description, group_type,
        price_visibility, hide_price_text, login_prompt_text, guest_message,
        allowed_categories, restricted_categories, category_access_type,
        currency_preference, min_order_amount, credit_limit, payment_terms_days,
        requires_approval, priority_level, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )
    `, [
      groupId, tenantId, validated.groupName, validated.groupCode,
      validated.description || null, validated.groupType,
      validated.priceVisibility,
      validated.hidePriceText || `Login to view ${validated.groupType} prices`,
      validated.loginPromptText || `Access ${validated.groupType} pricing`,
      validated.guestMessage || `Contact us for ${validated.groupType} rates in Nigerian Naira`,
      validated.allowedCategories || [],
      validated.restrictedCategories || [],
      validated.categoryAccessType,
      validated.currencyPreference,
      validated.minOrderAmount,
      validated.creditLimit,
      validated.paymentTermsDays,
      validated.requiresApproval,
      validated.priorityLevel,
      user.id
    ]);

    // Get the created group details
    const groupResult = await execute_sql(`
      SELECT * FROM b2b_user_groups WHERE id = $1 AND tenant_id = $2
    `, [groupId, tenantId]);

    if (groupResult.rows.length === 0) {
      return { success: false, error: 'Failed to create B2B group' };
    }

    const group = groupResult.rows[0];

    return {
      success: true,
      groupId: group.id,
      groupDetails: {
        groupName: group.group_name,
        groupCode: group.group_code,
        groupType: group.group_type,
        priceVisibility: group.price_visibility,
        memberCount: 0,
        permissions: await getGroupEffectivePermissions(groupId, tenantId)
      },
      message: `B2B group "${validated.groupName}" created successfully with ${validated.currencyPreference} pricing`
    };

  } catch (error) {
    console.error('Error creating B2B group:', error);
    return {
      success: false,
      error: error instanceof z.ZodError 
        ? `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        : 'Failed to create B2B group'
    };
  }
};

/**
 * Assign User to B2B Group - CELLULAR REUSABILITY with existing user system
 */
export const assignUserToB2BGroup = async (params: z.infer<typeof AssignUserToGroupSchema>) => {
  try {
    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Authentication required' };
    }

    // ✅ CELLULAR INDEPENDENCE: Check permissions via Cell Gateway v2
    const hasAssignPermission = await hasPermission(user.id, tenantId, 'b2b.memberships.create');
    if (!hasAssignPermission) {
      return { success: false, error: 'Insufficient permissions to assign users to B2B groups' };
    }

    const validated = AssignUserToGroupSchema.parse(params);

    // Verify user exists (CELLULAR REUSABILITY: uses existing users table)
    const userCheck = await execute_sql(`
      SELECT id FROM users WHERE id = $1
    `, [validated.userId]);

    if (userCheck.rows.length === 0) {
      return { success: false, error: 'User not found' };
    }

    // Verify group exists
    const groupCheck = await execute_sql(`
      SELECT id, group_name, requires_approval FROM b2b_user_groups 
      WHERE id = $1 AND tenant_id = $2
    `, [validated.groupId, tenantId]);

    if (groupCheck.rows.length === 0) {
      return { success: false, error: 'B2B group not found' };
    }

    const group = groupCheck.rows[0];

    // Check for existing membership
    const existingMembership = await execute_sql(`
      SELECT id, membership_status FROM b2b_group_memberships
      WHERE tenant_id = $1 AND user_id = $2 AND group_id = $3
    `, [tenantId, validated.userId, validated.groupId]);

    if (existingMembership.rows.length > 0) {
      const existing = existingMembership.rows[0];
      if (existing.membership_status === 'active') {
        return { success: false, error: 'User is already an active member of this group' };
      }
    }

    // Create or update membership
    const membershipId = crypto.randomUUID();
    const membershipStatus = group.requires_approval ? 'pending' : 'active';
    
    await execute_sql(`
      INSERT INTO b2b_group_memberships (
        id, tenant_id, user_id, group_id, membership_status, membership_type,
        effective_date, expiry_date, auto_renewal, renewal_period_months,
        discount_percentage, credit_limit_override, sales_rep_id,
        territory, business_registration, tax_identification, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      ON CONFLICT (tenant_id, user_id, group_id) 
      DO UPDATE SET
        membership_status = EXCLUDED.membership_status,
        membership_type = EXCLUDED.membership_type,
        effective_date = EXCLUDED.effective_date,
        updated_at = CURRENT_TIMESTAMP
    `, [
      membershipId, tenantId, validated.userId, validated.groupId,
      membershipStatus, validated.membershipType,
      validated.effectiveDate || new Date().toISOString().split('T')[0],
      validated.expiryDate || null,
      validated.autoRenewal,
      validated.renewalPeriodMonths,
      validated.discountPercentage,
      validated.creditLimitOverride || null,
      validated.salesRepId || null,
      validated.territory || null,
      validated.businessRegistration || null,
      validated.taxIdentification || null,
      user.id
    ]);

    // Get effective permissions for this user-group combination
    const effectivePermissions = await getUserEffectiveB2BPermissions(validated.userId, validated.groupId, tenantId);

    return {
      success: true,
      membershipId,
      effectivePermissions,
      message: group.requires_approval 
        ? `User assigned to B2B group "${group.group_name}" - pending approval`
        : `User successfully assigned to B2B group "${group.group_name}"`
    };

  } catch (error) {
    console.error('Error assigning user to B2B group:', error);
    return {
      success: false,
      error: error instanceof z.ZodError 
        ? `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        : 'Failed to assign user to B2B group'
    };
  }
};

/**
 * Check Guest Price Access - Core B2B functionality
 */
export const checkGuestPriceAccess = async (params: z.infer<typeof CheckAccessSchema>) => {
  try {
    const tenantId = await getSecureTenantId();
    const validated = CheckAccessSchema.parse(params);
    
    // Get current user (may be null for guests)
    const user = await getCurrentUser();
    const userId = user?.id || null;

    // Get global B2B settings for this tenant
    const settingsResult = await execute_sql(`
      SELECT * FROM b2b_global_settings WHERE tenant_id = $1
    `, [tenantId]);

    const globalSettings = settingsResult.rows[0] || {
      default_hide_from_guests: false,
      default_hide_price_text: 'Login to view prices',
      default_login_prompt_text: 'Create an account to access pricing',
      default_guest_message: 'Contact us for wholesale rates'
    };

    // If user is not logged in (guest)
    if (!userId) {
      const result: AccessCheckResult = {
        canViewPrice: !globalSettings.default_hide_from_guests,
        canViewProduct: true, // Products visible, prices may be hidden
        loginRequired: globalSettings.default_hide_from_guests,
        groupRequired: false,
        appliedRules: ['global_guest_settings'],
        restrictionReason: globalSettings.default_hide_from_guests 
          ? 'Prices hidden from guests'
          : undefined,
        alternativeMessage: globalSettings.default_hide_from_guests 
          ? globalSettings.default_guest_message
          : undefined
      };

      // Log access attempt
      await logB2BAccessAttempt({
        tenantId,
        userId: null,
        resourceType: 'price',
        resourceId: validated.productId || validated.categoryId || 'unknown',
        actionAttempted: validated.action,
        accessGranted: result.canViewPrice,
        denialReason: result.restrictionReason,
        context: { userType: 'guest', globalSettings }
      });

      return {
        success: true,
        ...result
      };
    }

    // User is logged in - check their B2B group memberships
    const membershipResult = await execute_sql(`
      SELECT 
        gm.*, 
        g.group_name, g.group_type, g.price_visibility,
        g.hide_price_text, g.priority_level
      FROM b2b_group_memberships gm
      JOIN b2b_user_groups g ON g.id = gm.group_id
      WHERE gm.tenant_id = $1 AND gm.user_id = $2 AND gm.membership_status = 'active'
      AND (gm.expiry_date IS NULL OR gm.expiry_date >= CURRENT_DATE)
      ORDER BY g.priority_level DESC, gm.created_at ASC
    `, [tenantId, userId]);

    let accessResult: AccessCheckResult;

    if (membershipResult.rows.length === 0) {
      // User has no B2B group memberships - treat as regular customer
      accessResult = {
        canViewPrice: true,
        canViewProduct: true,
        loginRequired: false,
        groupRequired: false,
        appliedRules: ['default_customer'],
        restrictionReason: undefined
      };
    } else {
      // Use highest priority group's settings
      const primaryMembership = membershipResult.rows[0];
      const priceVisible = primaryMembership.price_visibility === 'visible' || 
                          primaryMembership.price_visibility === 'partial';

      accessResult = {
        canViewPrice: priceVisible,
        canViewProduct: true,
        loginRequired: false,
        groupRequired: !priceVisible,
        appliedRules: [`group_${primaryMembership.group_id}`],
        restrictionReason: !priceVisible 
          ? `Price visibility restricted for ${primaryMembership.group_type} group`
          : undefined,
        alternativeMessage: !priceVisible 
          ? primaryMembership.hide_price_text
          : undefined
      };
    }

    // Check category-specific restrictions if category provided
    if (validated.categoryId) {
      const categoryAccess = await checkUserCategoryAccess({
        userId,
        categoryId: validated.categoryId,
        tenantId,
        action: validated.action
      });

      if (!categoryAccess.hasAccess) {
        accessResult.canViewPrice = false;
        accessResult.canViewProduct = categoryAccess.restrictionLevel !== 'full';
        accessResult.restrictionReason = categoryAccess.restrictionReason;
        accessResult.appliedRules.push('category_restriction');
      }
    }

    // Log access attempt
    await logB2BAccessAttempt({
      tenantId,
      userId,
      resourceType: validated.productId ? 'product' : 'category',
      resourceId: validated.productId || validated.categoryId || 'unknown',
      actionAttempted: validated.action,
      accessGranted: accessResult.canViewPrice,
      denialReason: accessResult.restrictionReason,
      context: { 
        memberships: membershipResult.rows.length,
        primaryGroup: membershipResult.rows[0]?.group_type 
      }
    });

    return {
      success: true,
      ...accessResult
    };

  } catch (error) {
    console.error('Error checking guest price access:', error);
    return {
      success: false,
      error: 'Failed to check price access',
      canViewPrice: false,
      canViewProduct: false,
      loginRequired: true,
      groupRequired: false,
      appliedRules: ['error_fallback']
    };
  }
};

/**
 * Check Category Access for User
 */
export const checkCategoryAccess = async (params: { categoryId: string; userId?: string }) => {
  try {
    const tenantId = await getSecureTenantId();
    const user = await getCurrentUser();
    const userId = params.userId || user?.id;

    if (!userId) {
      return {
        success: true,
        hasAccess: false,
        restrictionLevel: 'full' as const,
        restrictionReason: 'Authentication required for category access',
        allowedActions: []
      };
    }

    const categoryAccess = await checkUserCategoryAccess({
      userId,
      categoryId: params.categoryId,
      tenantId,
      action: 'view_product'
    });

    return {
      success: true,
      ...categoryAccess
    };

  } catch (error) {
    console.error('Error checking category access:', error);
    return {
      success: false,
      hasAccess: false,
      restrictionLevel: 'full' as const,
      restrictionReason: 'Category access check failed',
      allowedActions: []
    };
  }
};

// ===================================================================
// HELPER FUNCTIONS - Internal utilities for B2B operations
// ===================================================================

/**
 * Get effective permissions for a user in a specific B2B group
 */
async function getUserEffectiveB2BPermissions(
  userId: string, 
  groupId: string, 
  tenantId: string
): Promise<string[]> {
  try {
    // CELLULAR REUSABILITY: Use existing permission system
    const userPermissions = await getUserPermissions(userId, tenantId);
    
    // Get group-specific permissions
    const groupResult = await execute_sql(`
      SELECT group_type, priority_level FROM b2b_user_groups 
      WHERE id = $1 AND tenant_id = $2
    `, [groupId, tenantId]);

    if (groupResult.rows.length === 0) {
      return userPermissions.allPermissions;
    }

    const group = groupResult.rows[0];
    const b2bPermissions: string[] = [];

    // Add B2B-specific permissions based on group type
    switch (group.group_type) {
      case 'wholesale':
        b2bPermissions.push('b2b.prices.view', 'b2b.bulk.order', 'quotes.request');
        break;
      case 'vip':
        b2bPermissions.push('b2b.prices.view', 'b2b.bulk.order', 'products.early_access');
        break;
      case 'distributor':
        b2bPermissions.push('b2b.prices.view', 'b2b.bulk.order', 'b2b.territory.manage');
        break;
      case 'employee':
        b2bPermissions.push('b2b.prices.view', 'products.internal_pricing');
        break;
    }

    return [...userPermissions.allPermissions, ...b2bPermissions];

  } catch (error) {
    console.error('Error getting user effective B2B permissions:', error);
    return [];
  }
}

/**
 * Get effective permissions for a B2B group
 */
async function getGroupEffectivePermissions(groupId: string, tenantId: string): Promise<string[]> {
  try {
    const result = await execute_sql(`
      SELECT group_type, priority_level FROM b2b_user_groups 
      WHERE id = $1 AND tenant_id = $2
    `, [groupId, tenantId]);

    if (result.rows.length === 0) {
      return [];
    }

    const group = result.rows[0];
    const permissions: string[] = [];

    // Base permissions for all B2B groups
    permissions.push('products.view', 'orders.create', 'orders.view');

    // Type-specific permissions
    switch (group.group_type) {
      case 'wholesale':
        permissions.push('b2b.prices.view', 'b2b.bulk.order', 'quotes.request');
        break;
      case 'retail':
        permissions.push('products.purchase');
        break;
      case 'vip':
        permissions.push('b2b.prices.view', 'products.early_access', 'events.exclusive');
        break;
      case 'distributor':
        permissions.push('b2b.prices.view', 'b2b.bulk.order', 'b2b.territory.manage');
        break;
      case 'employee':
        permissions.push('b2b.prices.view', 'products.internal_pricing', 'inventory.view');
        break;
    }

    return permissions;

  } catch (error) {
    console.error('Error getting group effective permissions:', error);
    return [];
  }
}

/**
 * Check user's access to specific category
 */
async function checkUserCategoryAccess(params: {
  userId: string;
  categoryId: string;
  tenantId: string;
  action: string;
}): Promise<CategoryAccessResult> {
  try {
    // Get all applicable access rules for this user and category
    const rulesResult = await execute_sql(`
      SELECT 
        car.*,
        CASE 
          WHEN car.user_id IS NOT NULL THEN 'user'
          WHEN car.group_id IS NOT NULL THEN 'group'
          ELSE 'global'
        END as rule_type,
        bg.group_name
      FROM b2b_category_access_rules car
      LEFT JOIN b2b_user_groups bg ON bg.id = car.group_id
      LEFT JOIN b2b_group_memberships gm ON gm.group_id = car.group_id AND gm.user_id = $2
      WHERE car.tenant_id = $1 AND car.category_id = $3
        AND (
          car.user_id = $2 OR
          (car.group_id IS NOT NULL AND gm.membership_status = 'active') OR
          car.rule_scope = 'global'
        )
      ORDER BY car.priority DESC, car.created_at ASC
    `, [params.tenantId, params.userId, params.categoryId]);

    const rules = rulesResult.rows;
    
    if (rules.length === 0) {
      // No specific rules - default to allow access
      return {
        hasAccess: true,
        restrictionLevel: 'none',
        allowedActions: ['view_product', 'view_price', 'add_to_cart', 'purchase'],
        requiredApprovals: []
      };
    }

    // Apply highest priority rule
    const primaryRule = rules[0];
    let hasAccess = primaryRule.access_type === 'allow';
    let restrictionLevel: 'none' | 'partial' | 'full' = 'none';
    let allowedActions: string[] = [];
    let requiredApprovals: string[] = [];

    switch (primaryRule.access_type) {
      case 'allow':
        hasAccess = true;
        restrictionLevel = 'none';
        allowedActions = ['view_product', 'view_price', 'add_to_cart', 'purchase'];
        break;
      case 'deny':
        hasAccess = false;
        restrictionLevel = 'full';
        allowedActions = [];
        break;
      case 'request_approval':
        hasAccess = true;
        restrictionLevel = 'partial';
        allowedActions = ['view_product', 'view_price'];
        requiredApprovals = ['purchase_approval'];
        break;
    }

    return {
      hasAccess,
      restrictionLevel,
      restrictionReason: !hasAccess 
        ? `Category access denied by ${primaryRule.rule_type} rule`
        : primaryRule.access_type === 'request_approval'
          ? 'Purchase requires approval for this category'
          : undefined,
      allowedActions,
      requiredApprovals
    };

  } catch (error) {
    console.error('Error checking user category access:', error);
    return {
      hasAccess: false,
      restrictionLevel: 'full',
      restrictionReason: 'Category access check failed',
      allowedActions: [],
      requiredApprovals: []
    };
  }
}

/**
 * Log B2B access attempts for audit and compliance
 */
async function logB2BAccessAttempt(params: {
  tenantId: string;
  userId?: string | null;
  resourceType: string;
  resourceId: string;
  actionAttempted: string;
  accessGranted: boolean;
  denialReason?: string;
  appliedRuleId?: string;
  groupId?: string;
  context?: any;
}) {
  try {
    await execute_sql(`
      INSERT INTO b2b_access_audit (
        tenant_id, user_id, resource_type, resource_id, action_attempted,
        access_granted, denial_reason, applied_rule_id, group_id,
        request_context, currency_context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      params.tenantId,
      params.userId || null,
      params.resourceType,
      params.resourceId,
      params.actionAttempted,
      params.accessGranted,
      params.denialReason || null,
      params.appliedRuleId || null,
      params.groupId || null,
      JSON.stringify(params.context || {}),
      'NGN' // Default Nigerian Naira context
    ]);
  } catch (error) {
    console.error('Error logging B2B access attempt:', error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

// ===================================================================
// EXPORTS - Cell interface for external usage
// ===================================================================

// Export cell aggregate for actions.ts compatibility
export const b2bAccessControlCell = {
  // Core B2B Access Functions
  createB2BGroup,
  assignUserToB2BGroup,
  checkGuestPriceAccess,
  checkCategoryAccess,
  
  /**
   * ✅ CELLULAR INDEPENDENCE: Remove user from B2B group with proper authentication
   */
  async removeUserFromB2BGroup(params: { userId: string; groupId: string; tenantId?: string }): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const tenantId = params.tenantId || await getSecureTenantId();
      const user = await getCurrentUser();
      
      if (!user) {
        return { success: false, error: 'Authentication required', message: '' };
      }

      // ✅ CELLULAR INDEPENDENCE: Check permissions via Cell Gateway v2
      const hasRemovePermission = await hasPermission(user.id, tenantId, 'b2b.memberships.delete');
      if (!hasRemovePermission) {
        return { success: false, error: 'Insufficient permissions to remove users from B2B groups', message: '' };
      }

      // Update membership status to 'revoked' instead of deleting
      const result = await execute_sql(`
        UPDATE b2b_group_memberships 
        SET membership_status = 'revoked', updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND user_id = $2 AND group_id = $3
      `, [tenantId, params.userId, params.groupId]);

      if (result.rowCount === 0) {
        return { success: false, error: 'Membership not found or already revoked', message: '' };
      }

      return {
        success: true,
        message: 'User successfully removed from B2B group'
      };

    } catch (error) {
      console.error('Error removing user from B2B group:', error);
      return {
        success: false,
        error: 'Failed to remove user from B2B group',
        message: ''
      };
    }
  },

  /**
   * ✅ CELLULAR INDEPENDENCE: Check User B2B Status
   */
  async checkUserB2BStatus(params: { userId?: string } = {}): Promise<any> {
    try {
      const tenantId = await getSecureTenantId();
      const user = await getCurrentUser();
      const targetUserId = params.userId || user?.id;

      if (!targetUserId) {
        return {
          success: true,
          isB2BCustomer: false,
          groups: [],
          status: 'guest',
          message: 'User not authenticated'
        };
      }

      // Get user's active B2B group memberships
      const result = await execute_sql(`
        SELECT 
          gm.id,
          gm.membership_status,
          gm.membership_type,
          gm.effective_date,
          gm.expiry_date,
          gm.discount_percentage,
          gm.territory,
          g.group_name,
          g.group_type,
          g.price_visibility,
          g.priority_level
        FROM b2b_group_memberships gm
        JOIN b2b_user_groups g ON g.id = gm.group_id
        WHERE gm.tenant_id = $1 AND gm.user_id = $2 
        AND gm.membership_status = 'active'
        AND (gm.expiry_date IS NULL OR gm.expiry_date >= CURRENT_DATE)
        ORDER BY g.priority_level DESC, gm.created_at ASC
      `, [tenantId, targetUserId]);

      const memberships = result.rows;
      const isB2BCustomer = memberships.length > 0;
      const primaryMembership = memberships[0];

      return {
        success: true,
        isB2BCustomer,
        groups: memberships.map((m: any) => ({
          id: m.id,
          groupName: m.group_name,
          groupType: m.group_type,
          membershipStatus: m.membership_status,
          membershipType: m.membership_type,
          priceVisibility: m.price_visibility,
          discountPercentage: m.discount_percentage,
          territory: m.territory,
          effectiveDate: m.effective_date,
          expiryDate: m.expiry_date
        })),
        status: isB2BCustomer ? 'b2b_customer' : 'regular_customer',
        primaryGroup: primaryMembership ? {
          groupName: primaryMembership.group_name,
          groupType: primaryMembership.group_type,
          priceVisibility: primaryMembership.price_visibility
        } : null,
        message: isB2BCustomer 
          ? `User has ${memberships.length} active B2B group membership(s)`
          : 'User is not a B2B customer'
      };

    } catch (error) {
      console.error('Error in checkUserB2BStatus:', error);
      return {
        success: false,
        isB2BCustomer: false,
        groups: [],
        status: 'error',
        message: 'Failed to check user B2B status'
      };
    }
  },

  /**
   * ✅ CELLULAR INDEPENDENCE: List B2B Groups
   */
  async listB2BGroups(params: { 
    limit?: number; 
    offset?: number; 
    groupType?: string;
    status?: string;
  } = {}): Promise<any> {
    try {
      const tenantId = await getSecureTenantId();
      const user = await getCurrentUser();
      
      if (!user) {
        return { success: false, error: 'Authentication required' };
      }

      const hasViewPermission = await hasPermission(user.id, tenantId, 'b2b.groups.view');
      if (!hasViewPermission) {
        return { success: false, error: 'Insufficient permissions to view B2B groups' };
      }

      let query = `
        SELECT 
          g.*,
          COUNT(gm.id) as member_count
        FROM b2b_user_groups g
        LEFT JOIN b2b_group_memberships gm ON gm.group_id = g.id AND gm.membership_status = 'active'
        WHERE g.tenant_id = $1
      `;
      
      const queryParams = [tenantId];
      let paramIndex = 2;

      if (params.groupType) {
        query += ` AND g.group_type = $${paramIndex}`;
        queryParams.push(params.groupType);
        paramIndex++;
      }

      if (params.status) {
        query += ` AND g.status = $${paramIndex}`;
        queryParams.push(params.status);
        paramIndex++;
      }

      query += ` GROUP BY g.id ORDER BY g.priority_level DESC, g.created_at ASC`;

      if (params.limit) {
        query += ` LIMIT $${paramIndex}`;
        queryParams.push(params.limit.toString());
        paramIndex++;
      }

      if (params.offset) {
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(params.offset.toString());
      }

      const result = await execute_sql(query, queryParams);

      return {
        success: true,
        groups: result.rows.map((row: any) => ({
          id: row.id,
          groupName: row.group_name,
          groupCode: row.group_code,
          description: row.description,
          groupType: row.group_type,
          priceVisibility: row.price_visibility,
          memberCount: parseInt(row.member_count) || 0,
          status: row.status,
          priorityLevel: row.priority_level,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        total: result.rows.length,
        message: `Found ${result.rows.length} B2B group(s)`
      };

    } catch (error) {
      console.error('Error in listB2BGroups:', error);
      return {
        success: false,
        error: 'Failed to list B2B groups',
        groups: [],
        total: 0
      };
    }
  },

  /**
   * ✅ CELLULAR INDEPENDENCE: Get B2B Group Members
   */
  async getB2BGroupMembers(params: { 
    groupId: string; 
    limit?: number; 
    offset?: number;
    status?: string;
  }): Promise<any> {
    try {
      const tenantId = await getSecureTenantId();
      const user = await getCurrentUser();
      
      if (!user) {
        return { success: false, error: 'Authentication required' };
      }

      const hasViewPermission = await hasPermission(user.id, tenantId, 'b2b.memberships.view');
      if (!hasViewPermission) {
        return { success: false, error: 'Insufficient permissions to view group members' };
      }

      let query = `
        SELECT 
          gm.*,
          u.username,
          u.email,
          u.full_name,
          g.group_name,
          g.group_type
        FROM b2b_group_memberships gm
        JOIN users u ON u.id = gm.user_id
        JOIN b2b_user_groups g ON g.id = gm.group_id
        WHERE gm.tenant_id = $1 AND gm.group_id = $2
      `;
      
      const queryParams = [tenantId, params.groupId];
      let paramIndex = 3;

      if (params.status) {
        query += ` AND gm.membership_status = $${paramIndex}`;
        queryParams.push(params.status);
        paramIndex++;
      }

      query += ` ORDER BY gm.created_at DESC`;

      if (params.limit) {
        query += ` LIMIT $${paramIndex}`;
        queryParams.push(params.limit.toString());
        paramIndex++;
      }

      if (params.offset) {
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(params.offset.toString());
      }

      const result = await execute_sql(query, queryParams);

      return {
        success: true,
        members: result.rows.map((row: any) => ({
          membershipId: row.id,
          userId: row.user_id,
          username: row.username,
          email: row.email,
          fullName: row.full_name,
          membershipStatus: row.membership_status,
          membershipType: row.membership_type,
          effectiveDate: row.effective_date,
          expiryDate: row.expiry_date,
          discountPercentage: row.discount_percentage,
          territory: row.territory,
          businessRegistration: row.business_registration,
          taxIdentification: row.tax_identification,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        groupInfo: result.rows[0] ? {
          groupName: result.rows[0].group_name,
          groupType: result.rows[0].group_type
        } : null,
        total: result.rows.length,
        message: `Found ${result.rows.length} member(s) in group`
      };

    } catch (error) {
      console.error('Error in getB2BGroupMembers:', error);
      return {
        success: false,
        error: 'Failed to get group members',
        members: [],
        total: 0
      };
    }
  },

  /**
   * ✅ CELLULAR INDEPENDENCE: Update Price Visibility Settings
   */
  async updatePriceVisibilitySettings(params: any): Promise<any> {
    try {
      const tenantId = await getSecureTenantId();
      const user = await getCurrentUser();
      
      if (!user) {
        return { success: false, error: 'Authentication required' };
      }

      const hasUpdatePermission = await hasPermission(user.id, tenantId, 'b2b.settings.update');
      if (!hasUpdatePermission) {
        return { success: false, error: 'Insufficient permissions to update B2B settings' };
      }

      // Update or insert global B2B settings
      await execute_sql(`
        INSERT INTO b2b_global_settings (
          tenant_id, default_hide_from_guests, default_hide_price_text,
          default_login_prompt_text, default_guest_message, default_currency,
          vat_rate, auto_approve_registrations, require_business_verification,
          minimum_order_for_b2b, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id) DO UPDATE SET
          default_hide_from_guests = EXCLUDED.default_hide_from_guests,
          default_hide_price_text = EXCLUDED.default_hide_price_text,
          default_login_prompt_text = EXCLUDED.default_login_prompt_text,
          default_guest_message = EXCLUDED.default_guest_message,
          default_currency = EXCLUDED.default_currency,
          vat_rate = EXCLUDED.vat_rate,
          auto_approve_registrations = EXCLUDED.auto_approve_registrations,
          require_business_verification = EXCLUDED.require_business_verification,
          minimum_order_for_b2b = EXCLUDED.minimum_order_for_b2b,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `, [
        tenantId,
        params.hideFromGuests,
        params.hidePriceText || 'Login to view wholesale prices',
        params.loginPromptText || 'Create account for business pricing',
        params.guestMessage || 'Contact us for B2B rates in Nigerian Naira',
        params.defaultCurrency,
        params.vatRate,
        params.autoApproveRegistrations,
        params.requireBusinessVerification,
        params.minimumOrderForB2B,
        user.id
      ]);

      return {
        success: true,
        settings: params,
        message: 'B2B price visibility settings updated successfully'
      };

    } catch (error) {
      console.error('Error in updatePriceVisibilitySettings:', error);
      return {
        success: false,
        error: 'Failed to update price visibility settings'
      };
    }
  },

  /**
   * ✅ CELLULAR INDEPENDENCE: Get Price Visibility Settings
   */
  async getPriceVisibilitySettings(): Promise<any> {
    try {
      const tenantId = await getSecureTenantId();
      const user = await getCurrentUser();
      
      if (!user) {
        return { success: false, error: 'Authentication required' };
      }

      const hasViewPermission = await hasPermission(user.id, tenantId, 'b2b.settings.view');
      if (!hasViewPermission) {
        return { success: false, error: 'Insufficient permissions to view B2B settings' };
      }

      const result = await execute_sql(`
        SELECT * FROM b2b_global_settings WHERE tenant_id = $1
      `, [tenantId]);

      const settings = result.rows[0] || {
        default_hide_from_guests: false,
        default_hide_price_text: 'Login to view prices',
        default_login_prompt_text: 'Create account for pricing access',
        default_guest_message: 'Contact us for wholesale pricing',
        default_currency: 'NGN',
        vat_rate: 0.075,
        auto_approve_registrations: false,
        require_business_verification: true,
        minimum_order_for_b2b: 0
      };

      return {
        success: true,
        settings: {
          hideFromGuests: settings.default_hide_from_guests,
          hidePriceText: settings.default_hide_price_text,
          loginPromptText: settings.default_login_prompt_text,
          guestMessage: settings.default_guest_message,
          defaultCurrency: settings.default_currency,
          vatRate: settings.vat_rate,
          autoApproveRegistrations: settings.auto_approve_registrations,
          requireBusinessVerification: settings.require_business_verification,
          minimumOrderForB2B: settings.minimum_order_for_b2b
        },
        message: 'B2B settings retrieved successfully'
      };

    } catch (error) {
      console.error('Error in getPriceVisibilitySettings:', error);
      return {
        success: false,
        error: 'Failed to get price visibility settings',
        settings: {}
      };
    }
  },

  /**
   * ✅ CELLULAR INDEPENDENCE: Generate Access Report
   */
  async generateAccessReport(params: {
    startDate?: string;
    endDate?: string;
    resourceType?: string;
    accessGranted?: boolean;
    limit?: number;
  }): Promise<any> {
    try {
      const tenantId = await getSecureTenantId();
      const user = await getCurrentUser();
      
      if (!user) {
        return { success: false, error: 'Authentication required' };
      }

      const hasReportPermission = await hasPermission(user.id, tenantId, 'b2b.reports.view');
      if (!hasReportPermission) {
        return { success: false, error: 'Insufficient permissions to view B2B reports' };
      }

      let query = `
        SELECT 
          ba.*,
          u.username,
          u.email,
          g.group_name
        FROM b2b_access_audit ba
        LEFT JOIN users u ON u.id = ba.user_id
        LEFT JOIN b2b_user_groups g ON g.id = ba.group_id
        WHERE ba.tenant_id = $1
      `;
      
      const queryParams = [tenantId];
      let paramIndex = 2;

      if (params.startDate) {
        query += ` AND ba.created_at >= $${paramIndex}`;
        queryParams.push(params.startDate);
        paramIndex++;
      }

      if (params.endDate) {
        query += ` AND ba.created_at <= $${paramIndex}`;
        queryParams.push(params.endDate);
        paramIndex++;
      }

      if (params.resourceType) {
        query += ` AND ba.resource_type = $${paramIndex}`;
        queryParams.push(params.resourceType);
        paramIndex++;
      }

      if (params.accessGranted !== undefined) {
        query += ` AND ba.access_granted = $${paramIndex}`;
        queryParams.push(params.accessGranted.toString());
        paramIndex++;
      }

      query += ` ORDER BY ba.created_at DESC`;

      if (params.limit && params.limit <= 1000) {
        query += ` LIMIT $${paramIndex}`;
        queryParams.push(params.limit.toString());
      } else {
        query += ` LIMIT 500`; // Default limit
      }

      const result = await execute_sql(query, queryParams);

      return {
        success: true,
        report: result.rows.map((row: any) => ({
          id: row.id,
          userId: row.user_id,
          username: row.username,
          email: row.email,
          groupName: row.group_name,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          actionAttempted: row.action_attempted,
          accessGranted: row.access_granted,
          denialReason: row.denial_reason,
          context: row.context,
          createdAt: row.created_at
        })),
        total: result.rows.length,
        summary: {
          totalAttempts: result.rows.length,
          successfulAttempts: result.rows.filter((r: any) => r.access_granted).length,
          deniedAttempts: result.rows.filter((r: any) => !r.access_granted).length
        },
        message: `Generated access report with ${result.rows.length} entries`
      };

    } catch (error) {
      console.error('Error in generateAccessReport:', error);
      return {
        success: false,
        error: 'Failed to generate access report',
        report: []
      };
    }
  },

  // Utility Functions
  getUserEffectiveB2BPermissions,
  getGroupEffectivePermissions
};