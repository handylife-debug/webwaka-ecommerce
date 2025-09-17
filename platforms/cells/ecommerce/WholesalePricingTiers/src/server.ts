// WholesalePricingTiers Cell - Server Logic
// 100% CELLULAR REUSABILITY: Extends inventory/TaxAndFee Cell calculation engine

// ✅ CELLULAR INDEPENDENCE: Use Cell Gateway instead of direct imports
import { cellBus } from '../../../../cell-sdk/loader/cell-bus';
import { execute_sql } from '../../../../lib/database';

// ===================================================================
// TYPES AND INTERFACES
// ===================================================================

export interface WholesalePriceInput {
  basePrice: number;
  quantity: number;
  productId: string;
  categoryId?: string;
  userId?: string;
  groupId?: string;
  territory?: string;
  currency?: string;
  paymentTerms?: string;
  tenantId: string; // CRITICAL: Required for tenant isolation security
}

export interface PricingTierRule {
  id: string;
  minQuantity: number;
  maxQuantity?: number;
  discountType: 'percentage' | 'fixed_amount' | 'fixed_price';
  discountValue: number;
  territory?: string;
  paymentTermsDiscount: number;
}

export interface WholesalePriceResult {
  originalPrice: number;
  wholesalePrice: number;
  totalSavings: number;
  unitPrice: number;
  appliedTier?: PricingTierRule;
  taxCalculation?: any; // From TaxAndFee Cell
  paymentTermsDiscount: number;
  territoryAdjustment: number;
  currency: string;
  breakdown: {
    baseAmount: number;
    quantityDiscount: number;
    groupDiscount: number;
    territoryDiscount: number;
    paymentDiscount: number;
    finalAmount: number;
  };
}

export interface PricingTierInput {
  groupId?: string;
  productId?: string;
  categoryId?: string;
  minQuantity: number;
  maxQuantity?: number;
  discountType: 'percentage' | 'fixed_amount' | 'fixed_price';
  discountValue: number;
  territory?: string;
  effectiveDate?: string;
  expiryDate?: string;
  paymentTermsDiscount?: number;
  tenantId: string;
}

// ===================================================================
// WHOLESALE PRICING TIERS CELL CLASS
// 100% EXTENDS TAXANDFEE CELL FUNCTIONALITY
// ===================================================================

export class WholesalePricingTiersCell {
  
  // ===================================================================
  // CORE WHOLESALE PRICING CALCULATION
  // Extends TaxAndFee Cell with quantity tiers and B2B group pricing
  // ===================================================================
  
  async calculateWholesalePrice(input: WholesalePriceInput): Promise<WholesalePriceResult> {
    try {
      const {
        basePrice,
        quantity,
        productId,
        categoryId,
        userId,
        groupId,
        territory = 'Lagos',
        currency = 'NGN',
        paymentTerms = 'net_30',
        tenantId
      } = input;

      // Input validation including critical tenant isolation
      if (basePrice <= 0) throw new Error('Base price must be greater than zero');
      if (quantity <= 0) throw new Error('Quantity must be greater than zero');
      if (!productId) throw new Error('Product ID is required');
      if (!tenantId) throw new Error('Tenant ID is required for security isolation');

      // ✅ CELLULAR INDEPENDENCE: Get B2B group permissions via Cell Gateway v2
      let customerGroup = null;
      if (userId) {
        try {
          // ✅ CELLULAR INDEPENDENCE: Use Cell Gateway instead of direct import
          const groupPermissions = await cellBus.call('ecommerce/B2BAccessControl', 'checkUserB2BStatus', { 
            userId,
            tenantId 
          });
          if (groupPermissions.success && groupPermissions.groups && groupPermissions.groups.length > 0) {
            customerGroup = groupPermissions.groups[0]; // Primary group
          }
        } catch (error: unknown) {
          // Continue without group-specific pricing if B2B check fails
          console.warn('B2B group check failed, continuing with standard pricing:', error);
        }
      }

      // Get applicable pricing tiers with tenant isolation
      const pricingTiers = await this.getApplicablePricingTiers({
        productId,
        categoryId,
        groupId: groupId || customerGroup?.id,
        territory,
        quantity,
        tenantId // CRITICAL: Pass tenant ID for security isolation
      });

      // Find best applicable tier
      const appliedTier = this.findBestPricingTier(pricingTiers, quantity);
      
      // Calculate base discount from tier
      const baseAmount = basePrice * quantity;
      let quantityDiscount = 0;
      
      if (appliedTier) {
        switch (appliedTier.discountType) {
          case 'percentage':
            quantityDiscount = baseAmount * (appliedTier.discountValue / 100);
            break;
          case 'fixed_amount':
            quantityDiscount = appliedTier.discountValue * quantity;
            break;
          case 'fixed_price':
            quantityDiscount = baseAmount - (appliedTier.discountValue * quantity);
            break;
        }
      }

      // CELLULAR REUSABILITY: Apply territory adjustments extending TaxAndFee regional logic
      const territoryAdjustment = await this.calculateTerritoryAdjustment(territory, baseAmount - quantityDiscount, tenantId);
      
      // Calculate group-specific discount
      const groupDiscount = customerGroup ? 
        await this.calculateGroupDiscount(customerGroup.id, baseAmount - quantityDiscount - territoryAdjustment, tenantId) : 0;

      // Calculate payment terms discount
      const paymentTermsDiscount = await this.calculatePaymentTermsDiscount(
        paymentTerms, 
        baseAmount - quantityDiscount - territoryAdjustment - groupDiscount
      );

      // Calculate final amount before tax
      const finalAmount = Math.max(0, 
        baseAmount - quantityDiscount - territoryAdjustment - groupDiscount - paymentTermsDiscount
      );

      // CELLULAR REUSABILITY: Apply tax calculation using TaxAndFee Cell
      let taxCalculation = null;
      try {
        // Get appropriate tax rate for territory and product
        const taxRate = await this.getTaxRateForTerritoryAndProduct(territory, productId, tenantId);
        
        // ✅ CELLULAR INDEPENDENCE: Use Cell Gateway instead of direct cell import
        taxCalculation = await cellBus.call('inventory/TaxAndFee', 'calculate', {
          amount: finalAmount,
          taxRate,
          region: territory,
          itemType: categoryId || 'general',
          tenantId
        });
      } catch (error) {
        console.warn('Tax calculation failed, continuing without tax:', error);
      }

      // Final pricing calculations
      const wholesalePrice = taxCalculation ? taxCalculation.total : finalAmount;
      const originalPrice = taxCalculation ? 
        await this.calculateOriginalPriceWithTax(basePrice * quantity, taxCalculation.tax / finalAmount) : 
        basePrice * quantity;
      
      const totalSavings = originalPrice - wholesalePrice;
      const unitPrice = wholesalePrice / quantity;

      return {
        originalPrice: parseFloat(originalPrice.toFixed(2)),
        wholesalePrice: parseFloat(wholesalePrice.toFixed(2)),
        totalSavings: parseFloat(totalSavings.toFixed(2)),
        unitPrice: parseFloat(unitPrice.toFixed(2)),
        appliedTier: appliedTier || undefined,
        taxCalculation,
        paymentTermsDiscount: parseFloat(paymentTermsDiscount.toFixed(2)),
        territoryAdjustment: parseFloat(territoryAdjustment.toFixed(2)),
        currency,
        breakdown: {
          baseAmount: parseFloat(baseAmount.toFixed(2)),
          quantityDiscount: parseFloat(quantityDiscount.toFixed(2)),
          groupDiscount: parseFloat(groupDiscount.toFixed(2)),
          territoryDiscount: parseFloat(territoryAdjustment.toFixed(2)),
          paymentDiscount: parseFloat(paymentTermsDiscount.toFixed(2)),
          finalAmount: parseFloat(finalAmount.toFixed(2))
        }
      };

    } catch (error) {
      console.error('Wholesale price calculation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Failed to calculate wholesale price: ${errorMessage}`);
    }
  }

  // ===================================================================
  // PRICING TIER MANAGEMENT
  // ===================================================================

  async createPricingTier(input: PricingTierInput): Promise<{ success: boolean; id?: string; message: string }> {
    try {
      const {
        tenantId,
        groupId,
        productId,
        categoryId,
        minQuantity,
        maxQuantity,
        discountType,
        discountValue,
        territory,
        effectiveDate,
        expiryDate,
        paymentTermsDiscount = 0
      } = input;

      // Validation
      if (minQuantity <= 0) throw new Error('Minimum quantity must be greater than zero');
      if (maxQuantity && maxQuantity <= minQuantity) throw new Error('Maximum quantity must be greater than minimum quantity');
      if (discountValue < 0) throw new Error('Discount value cannot be negative');
      if (paymentTermsDiscount < 0 || paymentTermsDiscount > 0.5) throw new Error('Payment terms discount must be between 0 and 50%');
      
      if (!productId && !categoryId) throw new Error('Either product ID or category ID must be provided');
      if (!groupId) throw new Error('Group ID is required for pricing tier creation');

      const query = `
        INSERT INTO wholesale_pricing_tiers (
          tenant_id, group_id, product_id, category_id, tier_name, tier_description,
          min_quantity, max_quantity, discount_type, discount_value, currency, territory,
          payment_terms, payment_terms_discount, effective_date, expiry_date, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        ) RETURNING id
      `;

      const tierName = `${discountType === 'percentage' ? discountValue + '%' : '₦' + discountValue} off ${minQuantity}+ units`;
      const tierDescription = `Wholesale pricing tier: ${tierName}${territory ? ` in ${territory}` : ''}`;

      const params = [
        tenantId,
        groupId,
        productId,
        categoryId,
        tierName,
        tierDescription,
        minQuantity,
        maxQuantity,
        discountType,
        discountValue,
        'NGN',
        territory,
        'net_30',
        paymentTermsDiscount,
        effectiveDate || new Date().toISOString(),
        expiryDate,
        tenantId // Using tenant ID as creator for now
      ];

      const result = await execute_sql(query, params);
      
      if (result.rows.length === 0) {
        throw new Error('Failed to create pricing tier - no ID returned');
      }

      return {
        success: true,
        id: result.rows[0].id,
        message: `Pricing tier created successfully: ${tierName}`
      };

    } catch (error) {
      console.error('Failed to create pricing tier:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: `Failed to create pricing tier: ${errorMessage}`
      };
    }
  }

  async getPricingTiers(filters: {
    tenantId: string;
    groupId?: string;
    productId?: string;
    categoryId?: string;
    territory?: string;
    includeInactive?: boolean;
  }): Promise<{ success: boolean; tiers: PricingTierRule[]; message: string }> {
    try {
      const { tenantId, groupId, productId, categoryId, territory, includeInactive = false } = filters;

      let whereConditions = ['tenant_id = $1'];
      let params: any[] = [tenantId];
      let paramIndex = 2;

      if (groupId) {
        whereConditions.push(`group_id = $${paramIndex}`);
        params.push(groupId);
        paramIndex++;
      }

      if (productId) {
        whereConditions.push(`product_id = $${paramIndex}`);
        params.push(productId);
        paramIndex++;
      }

      if (categoryId) {
        whereConditions.push(`category_id = $${paramIndex}`);
        params.push(categoryId);
        paramIndex++;
      }

      if (territory) {
        whereConditions.push(`territory = $${paramIndex}`);
        params.push(territory);
        paramIndex++;
      }

      if (!includeInactive) {
        whereConditions.push('is_active = true');
      }

      const query = `
        SELECT 
          id, min_quantity, max_quantity, discount_type, discount_value,
          territory, payment_terms_discount, tier_name, tier_description,
          effective_date, expiry_date, is_active
        FROM wholesale_pricing_tiers 
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY priority ASC, min_quantity ASC
      `;

      const result = await execute_sql(query, params);

      const tiers: PricingTierRule[] = result.rows.map((row: any) => ({
        id: row.id,
        minQuantity: row.min_quantity,
        maxQuantity: row.max_quantity,
        discountType: row.discount_type,
        discountValue: parseFloat(row.discount_value),
        territory: row.territory,
        paymentTermsDiscount: parseFloat(row.payment_terms_discount || 0)
      }));

      return {
        success: true,
        tiers,
        message: `Found ${tiers.length} pricing tiers`
      };

    } catch (error) {
      console.error('Failed to get pricing tiers:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        tiers: [],
        message: `Failed to retrieve pricing tiers: ${errorMessage}`
      };
    }
  }

  // ===================================================================
  // BULK PRICING MATRIX GENERATION
  // ===================================================================

  async getBulkPricingMatrix(input: {
    productIds: string[];
    groupId?: string;
    territory?: string;
    currency?: string;
    tenantId: string;
  }): Promise<{
    success: boolean;
    matrix: any[];
    currency: string;
    territory: string;
    message: string;
  }> {
    try {
      const { productIds, groupId, territory = 'Lagos', currency = 'NGN', tenantId } = input;

      if (!productIds || productIds.length === 0) {
        throw new Error('Product IDs are required');
      }

      const matrix = [];

      for (const productId of productIds) {
        // Get product base price (this would normally come from product catalog)
        const basePrice = await this.getProductBasePrice(productId, tenantId);
        
        if (!basePrice) {
          continue; // Skip products without base price
        }

        // Get applicable pricing tiers for this product
        const tiersResult = await this.getPricingTiers({
          tenantId,
          groupId,
          productId,
          territory
        });

        if (!tiersResult.success) {
          continue;
        }

        // Generate pricing matrix for different quantities
        const quantityTiers = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
        const productMatrix: {
          productId: string;
          productName: string;
          basePrice: number;
          tiers: Array<{
            minQuantity: number;
            maxQuantity: number | null;
            unitPrice: number;
            discount: number;
            savings: number;
          }>;
        } = {
          productId,
          productName: `Product ${productId}`, // Would come from product catalog
          basePrice,
          tiers: []
        };

        for (const qty of quantityTiers) {
          const pricingResult = await this.calculateWholesalePrice({
            basePrice,
            quantity: qty,
            productId,
            groupId,
            territory,
            currency,
            tenantId // CRITICAL: Pass tenant ID for security isolation
          });

          productMatrix.tiers.push({
            minQuantity: qty,
            maxQuantity: qty === 1000 ? null : quantityTiers[quantityTiers.indexOf(qty) + 1] - 1,
            unitPrice: pricingResult.unitPrice,
            discount: ((basePrice - pricingResult.unitPrice) / basePrice * 100),
            savings: (basePrice - pricingResult.unitPrice) * qty
          });
        }

        matrix.push(productMatrix);
      }

      return {
        success: true,
        matrix,
        currency,
        territory,
        message: `Generated pricing matrix for ${matrix.length} products`
      };

    } catch (error) {
      console.error('Failed to generate bulk pricing matrix:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        matrix: [],
        currency: input.currency || 'NGN',
        territory: input.territory || 'Lagos',
        message: `Failed to generate pricing matrix: ${errorMessage}`
      };
    }
  }

  // ===================================================================
  // PRIVATE HELPER METHODS
  // Extending TaxAndFee Cell logic with B2B-specific calculations
  // ===================================================================

  private async getApplicablePricingTiers(filters: {
    productId: string;
    categoryId?: string;
    groupId?: string;
    territory?: string;
    quantity: number;
    tenantId: string; // CRITICAL: Required for tenant isolation
  }): Promise<PricingTierRule[]> {
    try {
      const { tenantId, ...filterParams } = filters;
      const tiersResult = await this.getPricingTiers({
        tenantId, // Use provided tenant ID for security
        ...filterParams
      });

      if (!tiersResult.success) {
        return [];
      }

      // Filter tiers applicable to the quantity
      return tiersResult.tiers.filter(tier => 
        tier.minQuantity <= filters.quantity && 
        (!tier.maxQuantity || tier.maxQuantity >= filters.quantity)
      );

    } catch (error) {
      console.error('Failed to get applicable pricing tiers:', error);
      return [];
    }
  }

  private findBestPricingTier(tiers: PricingTierRule[], quantity: number): PricingTierRule | null {
    if (tiers.length === 0) return null;

    // Find the tier with the highest discount value that applies to this quantity
    let bestTier = null;
    let bestSavings = 0;

    for (const tier of tiers) {
      if (tier.minQuantity <= quantity && (!tier.maxQuantity || tier.maxQuantity >= quantity)) {
        // Calculate potential savings for comparison
        let savings = 0;
        switch (tier.discountType) {
          case 'percentage':
            savings = tier.discountValue; // Use percentage as comparison metric
            break;
          case 'fixed_amount':
            savings = tier.discountValue * quantity;
            break;
          case 'fixed_price':
            savings = 1000; // Assign high value to fixed price tiers
            break;
        }

        if (savings > bestSavings) {
          bestSavings = savings;
          bestTier = tier;
        }
      }
    }

    return bestTier;
  }

  private async calculateTerritoryAdjustment(territory: string, amount: number, tenantId: string): Promise<number> {
    try {
      const query = `
        SELECT price_multiplier 
        FROM territory_pricing_adjustments 
        WHERE territory = $1 AND tenant_id = $2 AND is_active = true
      `;
      
      const result = await execute_sql(query, [territory, tenantId]);
      
      if (result.rows.length > 0) {
        const multiplier = parseFloat(result.rows[0].price_multiplier);
        return amount * (1 - multiplier); // Discount if multiplier < 1, surcharge if > 1
      }
      
      return 0; // No territory adjustment
      
    } catch (error) {
      console.warn('Territory adjustment calculation failed:', error);
      return 0;
    }
  }

  private async calculateGroupDiscount(groupId: string, amount: number, tenantId: string): Promise<number> {
    try {
      // CELLULAR REUSABILITY: Leverage B2BAccessControl group data
      // This would integrate with the group's default discount percentage
      const query = `
        SELECT metadata 
        FROM b2b_user_groups 
        WHERE id = $1 AND tenant_id = $2 AND status = 'active'
      `;
      
      const result = await execute_sql(query, [groupId, tenantId]);
      
      if (result.rows.length > 0 && result.rows[0].metadata) {
        const metadata = result.rows[0].metadata;
        if (metadata.defaultDiscountPercent) {
          return amount * (metadata.defaultDiscountPercent / 100);
        }
      }
      
      return 0;
      
    } catch (error) {
      console.warn('Group discount calculation failed:', error);
      return 0;
    }
  }

  private async calculatePaymentTermsDiscount(paymentTerms: string, amount: number): Promise<number> {
    // Nigerian market payment terms discounts
    const paymentDiscounts: Record<string, number> = {
      'advance_payment': 0.05,   // 5% discount for advance payment
      'cash_on_delivery': 0.02,  // 2% discount for COD
      'net_15': 0.01,            // 1% discount for 15-day terms
      'net_30': 0,               // Standard terms, no discount
      'net_60': -0.01,           // 1% surcharge for 60-day terms
      'net_90': -0.02            // 2% surcharge for 90-day terms
    };

    const discountRate = paymentDiscounts[paymentTerms] || 0;
    return amount * Math.abs(discountRate);
  }

  private async getTaxRateForTerritoryAndProduct(territory: string, productId: string, tenantId: string): Promise<number> {
    // CELLULAR REUSABILITY: Use TaxAndFee Cell regional logic
    // Nigerian VAT standard rate is 7.5%
    try {
      // ✅ CELLULAR INDEPENDENCE: Use Cell Gateway instead of direct cell import
      const regionRates = await cellBus.call('inventory/TaxAndFee', 'getRegionRates', { 
        region: territory, 
        tenantId 
      });
      return 0.075 * (regionRates.taxMultiplier || 1); // 7.5% VAT with regional adjustment
    } catch (error) {
      console.warn('Tax rate calculation failed, using standard VAT:', error);
      return 0.075; // Standard Nigerian VAT rate
    }
  }

  private async calculateOriginalPriceWithTax(baseAmount: number, taxRate: number): Promise<number> {
    return baseAmount * (1 + taxRate);
  }

  private async getProductBasePrice(productId: string, tenantId: string): Promise<number> {
    try {
      // This would integrate with the product catalog
      // For now, return a mock price
      const query = `
        SELECT price 
        FROM products 
        WHERE id = $1 AND tenant_id = $2
      `;
      
      const result = await execute_sql(query, [productId, tenantId]);
      
      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].price);
      }
      
      return 100; // Mock base price in NGN
      
    } catch (error) {
      console.warn('Product base price lookup failed, using mock price:', error);
      return 100; // Mock price
    }
  }

  // ===================================================================
  // UPDATE AND DELETE PRICING TIER OPERATIONS
  // ===================================================================

  async updatePricingTier(input: {
    id: string;
    tenantId: string;
    minQuantity?: number;
    maxQuantity?: number;
    discountType?: 'percentage' | 'fixed_amount' | 'fixed_price';
    discountValue?: number;
    territory?: string;
    effectiveDate?: string;
    expiryDate?: string;
    paymentTermsDiscount?: number;
    isActive?: boolean;
  }): Promise<{ success: boolean; id?: string; message: string }> {
    try {
      const { id, tenantId, ...updateFields } = input;

      if (!id) {
        throw new Error('Tier ID is required for updates');
      }
      if (!tenantId) {
        throw new Error('Tenant ID is required for security isolation');
      }

      // Build dynamic update query
      const updateValues: any[] = [];
      const updateClauses: string[] = [];
      let paramIndex = 1;

      Object.entries(updateFields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // Handle field name mapping
          const dbFieldMap: Record<string, string> = {
            minQuantity: 'min_quantity',
            maxQuantity: 'max_quantity',
            discountType: 'discount_type',
            discountValue: 'discount_value',
            effectiveDate: 'effective_date',
            expiryDate: 'expiry_date',
            paymentTermsDiscount: 'payment_terms_discount',
            isActive: 'is_active'
          };
          
          const dbField = dbFieldMap[key] || key;
          
          // Validate payment terms discount conversion (0-50% to 0-0.5)
          if (key === 'paymentTermsDiscount') {
            const numValue = parseFloat(value as string);
            if (numValue < 0 || numValue > 50) {
              throw new Error('Payment terms discount must be between 0 and 50%');
            }
            // Convert percentage to decimal (e.g., 5% -> 0.05)
            value = numValue / 100;
          }
          
          // Validate quantity constraints
          if (key === 'minQuantity' && (value as number) <= 0) {
            throw new Error('Minimum quantity must be greater than zero');
          }
          
          updateClauses.push(`${dbField} = $${paramIndex}`);
          updateValues.push(value);
          paramIndex++;
        }
      });

      if (updateClauses.length === 0) {
        throw new Error('No valid fields provided for update');
      }

      // Add updated_at timestamp
      updateClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      
      // Add WHERE clause parameters
      updateValues.push(id, tenantId);
      
      const query = `
        UPDATE wholesale_pricing_tiers 
        SET ${updateClauses.join(', ')}
        WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
        RETURNING id, tier_name
      `;

      const result = await execute_sql(query, updateValues);
      
      if (result.rows.length === 0) {
        throw new Error('Pricing tier not found or access denied');
      }

      return {
        success: true,
        id: result.rows[0].id,
        message: `Pricing tier "${result.rows[0].tier_name}" updated successfully`
      };

    } catch (error) {
      console.error('Failed to update pricing tier:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: `Failed to update pricing tier: ${errorMessage}`
      };
    }
  }

  async deletePricingTier(input: {
    id: string;
    tenantId: string;
    softDelete?: boolean;
  }): Promise<{ success: boolean; id?: string; message: string }> {
    try {
      const { id, tenantId, softDelete = true } = input;

      if (!id) {
        throw new Error('Tier ID is required for deletion');
      }
      if (!tenantId) {
        throw new Error('Tenant ID is required for security isolation');
      }

      let query: string;
      let params: any[];

      if (softDelete) {
        // Soft delete: mark as inactive
        query = `
          UPDATE wholesale_pricing_tiers 
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, tier_name
        `;
        params = [id, tenantId];
      } else {
        // Hard delete: remove from database
        query = `
          DELETE FROM wholesale_pricing_tiers 
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, tier_name
        `;
        params = [id, tenantId];
      }

      const result = await execute_sql(query, params);
      
      if (result.rows.length === 0) {
        throw new Error('Pricing tier not found or access denied');
      }

      const action = softDelete ? 'deactivated' : 'deleted';
      return {
        success: true,
        id: result.rows[0].id,
        message: `Pricing tier "${result.rows[0].tier_name}" ${action} successfully`
      };

    } catch (error) {
      console.error('Failed to delete pricing tier:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: `Failed to delete pricing tier: ${errorMessage}`
      };
    }
  }

  private async getTenantId(): Promise<string> {
    // DEPRECATED: This method should no longer be used
    // Tenant ID must be explicitly passed from request context for security
    throw new Error('getTenantId() deprecated - tenant ID must be explicitly provided for security isolation');
  }
}

// ===================================================================
// EXPORT CELL INSTANCE
// ===================================================================

export const wholesalePricingTiersCell = new WholesalePricingTiersCell();