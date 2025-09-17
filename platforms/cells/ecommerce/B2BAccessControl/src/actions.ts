/**
 * B2BAccessControl Cell Actions
 * CELLULAR REUSABILITY: Server actions that delegate to B2BAccessControl server functions
 * Nigerian Market: Complete B2B access control with local business compliance
 */

'use server';

import { z } from 'zod';
import { b2bAccessControlCell } from './server';

// ===================================================================
// ACTION SCHEMAS - Validation for all B2B operations
// ===================================================================

const CreateB2BGroupActionSchema = z.object({
  groupName: z.string().min(2).max(100),
  groupCode: z.string().min(2).max(50),
  description: z.string().optional(),
  groupType: z.enum(['wholesale', 'retail', 'vip', 'employee', 'guest', 'distributor', 'reseller']),
  priceVisibility: z.enum(['hidden', 'visible', 'partial', 'request_quote']),
  hideFromGuests: z.boolean().default(false),
  hidePriceText: z.string().optional(),
  loginPromptText: z.string().optional(),
  guestMessage: z.string().optional(),
  allowedCategories: z.array(z.string()).default([]),
  restrictedCategories: z.array(z.string()).default([]),
  categoryAccessType: z.enum(['whitelist', 'blacklist', 'unrestricted']).default('unrestricted'),
  currencyPreference: z.enum(['NGN', 'USD', 'GBP']).default('NGN'),
  minOrderAmount: z.number().min(0).default(0),
  creditLimit: z.number().min(0).default(0),
  paymentTermsDays: z.number().min(0).default(30),
  requiresApproval: z.boolean().default(false),
  priorityLevel: z.number().min(1).max(10).default(5)
});

const AssignUserActionSchema = z.object({
  userId: z.string().uuid(),
  groupId: z.string().uuid(),
  membershipType: z.enum(['regular', 'trial', 'premium', 'lifetime']).default('regular'),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  autoRenewal: z.boolean().default(true),
  renewalPeriodMonths: z.number().min(1).default(12),
  discountPercentage: z.number().min(0).max(100).default(0),
  territory: z.string().optional(),
  businessRegistration: z.string().optional(),
  taxIdentification: z.string().optional()
});

const CheckAccessActionSchema = z.object({
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  userId: z.string().optional(),
  action: z.enum(['view_price', 'view_product', 'add_to_cart', 'purchase']).default('view_price')
});

const UpdateSettingsActionSchema = z.object({
  hideFromGuests: z.boolean(),
  hidePriceText: z.string().optional(),
  loginPromptText: z.string().optional(),
  guestMessage: z.string().optional(),
  defaultCurrency: z.enum(['NGN', 'USD', 'GBP']).default('NGN'),
  vatRate: z.number().min(0).max(1).default(0.075),
  autoApproveRegistrations: z.boolean().default(false),
  requireBusinessVerification: z.boolean().default(true),
  minimumOrderForB2B: z.number().min(0).default(0)
});

// ===================================================================
// B2B GROUP MANAGEMENT ACTIONS - CELLULAR REUSABILITY
// ===================================================================

/**
 * Create B2B Group Action
 * CELLULAR REUSABILITY: Delegates to server cell functions
 */
export async function createB2BGroup(formData: FormData) {
  try {
    const rawData = {
      groupName: formData.get('groupName') as string,
      groupCode: formData.get('groupCode') as string,
      description: formData.get('description') as string || undefined,
      groupType: formData.get('groupType') as string,
      priceVisibility: formData.get('priceVisibility') as string,
      hideFromGuests: formData.get('hideFromGuests') === 'true',
      hidePriceText: formData.get('hidePriceText') as string || undefined,
      loginPromptText: formData.get('loginPromptText') as string || undefined,
      guestMessage: formData.get('guestMessage') as string || undefined,
      allowedCategories: JSON.parse(formData.get('allowedCategories') as string || '[]'),
      restrictedCategories: JSON.parse(formData.get('restrictedCategories') as string || '[]'),
      categoryAccessType: formData.get('categoryAccessType') as string || 'unrestricted',
      currencyPreference: formData.get('currencyPreference') as string || 'NGN',
      minOrderAmount: parseFloat(formData.get('minOrderAmount') as string || '0'),
      creditLimit: parseFloat(formData.get('creditLimit') as string || '0'),
      paymentTermsDays: parseInt(formData.get('paymentTermsDays') as string || '30'),
      requiresApproval: formData.get('requiresApproval') === 'true',
      priorityLevel: parseInt(formData.get('priorityLevel') as string || '5')
    };

    const validatedData = CreateB2BGroupActionSchema.parse(rawData);
    
    // CELLULAR REUSABILITY: Delegate to server cell
    const result = await b2bAccessControlCell.createB2BGroup(validatedData);
    
    return result;

  } catch (error) {
    console.error('Error in createB2BGroup action:', error);
    return {
      success: false,
      error: error instanceof z.ZodError 
        ? `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        : 'Failed to create B2B group'
    };
  }
}

/**
 * Assign User to B2B Group Action
 */
export async function assignUserToB2BGroup(formData: FormData) {
  try {
    const rawData = {
      userId: formData.get('userId') as string,
      groupId: formData.get('groupId') as string,
      membershipType: formData.get('membershipType') as string || 'regular',
      effectiveDate: formData.get('effectiveDate') as string || undefined,
      expiryDate: formData.get('expiryDate') as string || undefined,
      autoRenewal: formData.get('autoRenewal') !== 'false',
      discountPercentage: parseFloat(formData.get('discountPercentage') as string || '0'),
      territory: formData.get('territory') as string || undefined,
      businessRegistration: formData.get('businessRegistration') as string || undefined,
      taxIdentification: formData.get('taxIdentification') as string || undefined
    };

    const validatedData = AssignUserActionSchema.parse(rawData);
    
    // CELLULAR REUSABILITY: Delegate to server cell
    const result = await b2bAccessControlCell.assignUserToB2BGroup(validatedData);
    
    return result;

  } catch (error) {
    console.error('Error in assignUserToB2BGroup action:', error);
    return {
      success: false,
      error: error instanceof z.ZodError 
        ? `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        : 'Failed to assign user to B2B group'
    };
  }
}

/**
 * ✅ CELLULAR INDEPENDENCE: Remove User from B2B Group Action - Delegates to server
 */
export async function removeUserFromB2BGroup(params: { userId: string; groupId: string }) {
  try {
    // ✅ CELLULAR INDEPENDENCE: Proper delegation to server function
    const result = await b2bAccessControlCell.removeUserFromB2BGroup(params);
    return result;

  } catch (error) {
    console.error('Error in removeUserFromB2BGroup action:', error);
    return {
      success: false,
      error: 'Failed to remove user from B2B group'
    };
  }
}

// ===================================================================
// ACCESS CHECK ACTIONS - Core B2B functionality
// ===================================================================

/**
 * Check Guest Price Access Action
 */
export async function checkGuestPriceAccess(params: { 
  productId?: string; 
  categoryId?: string; 
  userId?: string; 
  action?: string;
}) {
  try {
    const validatedData = CheckAccessActionSchema.parse(params);
    
    // CELLULAR REUSABILITY: Delegate to server cell
    const result = await b2bAccessControlCell.checkGuestPriceAccess(validatedData);
    
    return result;

  } catch (error) {
    console.error('Error in checkGuestPriceAccess action:', error);
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
}

/**
 * Check Category Access Action
 */
export async function checkCategoryAccess(params: { categoryId: string; userId?: string }) {
  try {
    // CELLULAR REUSABILITY: Delegate to server cell
    const result = await b2bAccessControlCell.checkCategoryAccess(params);
    
    return result;

  } catch (error) {
    console.error('Error in checkCategoryAccess action:', error);
    return {
      success: false,
      hasAccess: false,
      restrictionLevel: 'full' as const,
      restrictionReason: 'Category access check failed',
      allowedActions: []
    };
  }
}

/**
 * Check User B2B Status Action
 * CELLULAR INDEPENDENCE: Delegates to server cell functions
 */
export async function checkUserB2BStatus(params: { userId?: string } = {}) {
  try {
    // CELLULAR INDEPENDENCE: Delegate to server cell
    const result = await b2bAccessControlCell.checkUserB2BStatus(params);
    return result;

  } catch (error) {
    console.error('Error in checkUserB2BStatus action:', error);
    return {
      success: false,
      isB2BCustomer: false,
      groups: [],
      status: 'error',
      message: 'Failed to check user B2B status'
    };
  }
}

// ===================================================================
// B2B GROUP LISTING AND MANAGEMENT ACTIONS
// ===================================================================

/**
 * List B2B Groups Action
 * CELLULAR INDEPENDENCE: Delegates to server cell functions
 */
export async function listB2BGroups(params: { 
  limit?: number; 
  offset?: number; 
  groupType?: string;
  status?: string;
} = {}) {
  try {
    // CELLULAR INDEPENDENCE: Delegate to server cell
    const result = await b2bAccessControlCell.listB2BGroups(params);
    return result;

  } catch (error) {
    console.error('Error in listB2BGroups action:', error);
    return {
      success: false,
      error: 'Failed to list B2B groups',
      groups: [],
      total: 0
    };
  }
}

/**
 * Get B2B Group Members Action
 * CELLULAR INDEPENDENCE: Delegates to server cell functions
 */
export async function getB2BGroupMembers(params: { 
  groupId: string; 
  limit?: number; 
  offset?: number;
  status?: string;
}) {
  try {
    // CELLULAR INDEPENDENCE: Delegate to server cell
    const result = await b2bAccessControlCell.getB2BGroupMembers(params);
    return result;

  } catch (error) {
    console.error('Error in getB2BGroupMembers action:', error);
    return {
      success: false,
      error: 'Failed to get group members',
      members: [],
      total: 0
    };
  }
}

// ===================================================================
// B2B SETTINGS MANAGEMENT ACTIONS
// ===================================================================

/**
 * Update Price Visibility Settings Action
 * CELLULAR INDEPENDENCE: Delegates to server cell functions
 */
export async function updatePriceVisibilitySettings(formData: FormData) {
  try {
    const rawData = {
      hideFromGuests: formData.get('hideFromGuests') === 'true',
      hidePriceText: formData.get('hidePriceText') as string || undefined,
      loginPromptText: formData.get('loginPromptText') as string || undefined,
      guestMessage: formData.get('guestMessage') as string || undefined,
      defaultCurrency: formData.get('defaultCurrency') as string || 'NGN',
      vatRate: parseFloat(formData.get('vatRate') as string || '0.075'),
      autoApproveRegistrations: formData.get('autoApproveRegistrations') === 'true',
      requireBusinessVerification: formData.get('requireBusinessVerification') !== 'false',
      minimumOrderForB2B: parseFloat(formData.get('minimumOrderForB2B') as string || '0')
    };

    const validatedData = UpdateSettingsActionSchema.parse(rawData);

    // CELLULAR INDEPENDENCE: Delegate to server cell
    const result = await b2bAccessControlCell.updatePriceVisibilitySettings(validatedData);
    return result;

  } catch (error) {
    console.error('Error in updatePriceVisibilitySettings action:', error);
    return {
      success: false,
      error: error instanceof z.ZodError 
        ? `Validation error: ${error.errors.map(e => e.message).join(', ')}`
        : 'Failed to update price visibility settings'
    };
  }
}

/**
 * Get Price Visibility Settings Action
 * CELLULAR INDEPENDENCE: Delegates to server cell functions
 */
export async function getPriceVisibilitySettings() {
  try {
    // CELLULAR INDEPENDENCE: Delegate to server cell
    const result = await b2bAccessControlCell.getPriceVisibilitySettings();
    return result;

  } catch (error) {
    console.error('Error in getPriceVisibilitySettings action:', error);
    return {
      success: false,
      error: 'Failed to get price visibility settings',
      settings: {}
    };
  }
}

// ===================================================================
// BULK OPERATIONS AND UTILITIES
// ===================================================================

/**
 * Get Bulk Category Access Action
 */
export async function getBulkCategoryAccess(params: { 
  userId: string; 
  categoryIds: string[];
}) {
  try {
    if (params.categoryIds.length === 0) {
      return {
        success: true,
        results: [],
        message: 'No categories provided'
      };
    }

    if (params.categoryIds.length > 100) {
      return {
        success: false,
        error: 'Too many categories requested (max 100)'
      };
    }

    const results = [];
    
    // Check access for each category
    for (const categoryId of params.categoryIds) {
      try {
        const accessResult = await checkCategoryAccess({ 
          categoryId, 
          userId: params.userId 
        });
        
        results.push({
          categoryId,
          hasAccess: accessResult.hasAccess,
          restrictionLevel: accessResult.restrictionLevel,
          restrictionReason: accessResult.restrictionReason,
          allowedActions: accessResult.allowedActions
        });
      } catch (error) {
        results.push({
          categoryId,
          hasAccess: false,
          restrictionLevel: 'full' as const,
          restrictionReason: 'Access check failed',
          allowedActions: []
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        total: results.length,
        allowed: results.filter((r: any) => r.hasAccess).length,
        restricted: results.filter((r: any) => !r.hasAccess).length
      },
      message: `Checked access for ${results.length} categories`
    };

  } catch (error) {
    console.error('Error in getBulkCategoryAccess action:', error);
    return {
      success: false,
      error: 'Failed to check bulk category access',
      results: []
    };
  }
}

/**
 * Generate Access Report Action
 * CELLULAR INDEPENDENCE: Delegates to server cell functions
 */
export async function generateAccessReport(params: {
  startDate?: string;
  endDate?: string;
  resourceType?: string;
  accessGranted?: boolean;
  limit?: number;
}) {
  try {
    // CELLULAR INDEPENDENCE: Delegate to server cell
    const result = await b2bAccessControlCell.generateAccessReport(params);
    return result;

  } catch (error) {
    console.error('Error in generateAccessReport action:', error);
    return {
      success: false,
      error: 'Failed to generate access report',
      report: []
    };
  }
}