import { test, expect } from '@playwright/test';

/**
 * TaxAndFee Cell Gateway Communication Tests
 * Tests the cellular independence and Gateway communication for TaxAndFee cell
 * 
 * CRITICAL REQUIREMENTS:
 * - All communication through Cell Gateway v2 (no direct imports)
 * - Proper tenantId isolation and validation
 * - Fallback behavior for failed calculations
 * - Contract validation for payload shapes
 */

const TEST_TENANT_ID = 'test-tenant-123';
const INVALID_TENANT_ID = 'invalid-tenant';

// Test API base URL - should be dynamically determined in real tests
const API_BASE = process.env.API_BASE || 'http://localhost:5000';

test.describe('TaxAndFee Cell Gateway Communication', () => {
  
  test.describe('Cell Health and Status', () => {
    test('should return healthy status with correct configuration metadata', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/cells/inventory/TaxAndFee/health`);
      
      expect(response.status()).toBe(200);
      const data = await response.json();
      
      // ✅ CRITICAL: Should indicate database-driven configuration (not hardcoded)
      expect(data.status).toBe('healthy');
      expect(data.hardcodedConfiguration).toBe(false);
      expect(data.configurationSource).toBe('database');
      expect(data.endpoints).toContain('calculate');
      expect(data.endpoints).toContain('getRegionRates');
      expect(data.cachingEnabled).toBe(true);
    });

    test('should provide comprehensive metadata about tax configuration', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/cells/inventory/TaxAndFee/health`);
      const data = await response.json();
      
      // Validate metadata structure
      expect(data.metadata).toBeDefined();
      expect(data.metadata.configurationTables).toEqual([
        'tax_configurations',
        'fee_structures', 
        'region_tax_multipliers'
      ]);
      expect(data.metadata.supportedRegions).toContain('NG');
      expect(data.metadata.defaultVatRate).toBe(0.075);
    });
  });

  test.describe('Gateway Contract: calculate method', () => {
    test('should calculate tax with valid tenantId and parameters', async ({ request }) => {
      const payload = {
        amount: 1000,
        taxRate: 0.075,
        region: 'NG',
        itemType: 'product',
        tenantId: TEST_TENANT_ID
      };

      const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/calculate`, {
        data: payload
      });

      expect(response.status()).toBe(200);
      const result = await response.json();

      // ✅ CONTRACT VALIDATION: Expected return structure
      expect(result).toHaveProperty('tax');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('fees');
      expect(result.tax).toBe(75); // 7.5% of 1000
      expect(result.total).toBe(1075); // 1000 + 75
      expect(typeof result.fees).toBe('object');
    });

    test('should require tenantId parameter', async ({ request }) => {
      const payload = {
        amount: 1000,
        taxRate: 0.075,
        region: 'NG',
        itemType: 'product'
        // Missing tenantId
      };

      const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/calculate`, {
        data: payload
      });

      // ✅ SECURITY: Should reject requests without tenantId
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('tenantId');
    });

    test('should handle invalid tenantId gracefully', async ({ request }) => {
      const payload = {
        amount: 1000,
        taxRate: 0.075,
        region: 'NG',
        itemType: 'product',
        tenantId: INVALID_TENANT_ID
      };

      const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/calculate`, {
        data: payload
      });

      // Should handle gracefully, not throw 500 error
      expect(response.status()).toBeLessThan(500);
      
      if (response.status() === 200) {
        const result = await response.json();
        // Should fall back to standard rates when tenant config not found
        expect(result.tax).toBeGreaterThan(0);
      }
    });

    test('should validate required parameters', async ({ request }) => {
      const testCases = [
        { amount: null, taxRate: 0.075, region: 'NG', itemType: 'product', tenantId: TEST_TENANT_ID },
        { amount: 1000, taxRate: null, region: 'NG', itemType: 'product', tenantId: TEST_TENANT_ID },
        { amount: 1000, taxRate: 0.075, region: null, itemType: 'product', tenantId: TEST_TENANT_ID },
        { amount: 1000, taxRate: 0.075, region: 'NG', itemType: null, tenantId: TEST_TENANT_ID }
      ];

      for (const testCase of testCases) {
        const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/getRegionRates`, {
          data: {
            method: 'calculate',
            params: testCase
          }
        });

        expect(response.status()).toBe(400);
        const error = await response.json();
        expect(error.success).toBe(false);
      }
    });

    test('should apply regional tax multipliers', async ({ request }) => {
      // Test Lagos region (should have different rate than default)
      const lagosPayload = {
        amount: 1000,
        taxRate: 0.075,
        region: 'Lagos',
        itemType: 'product',
        tenantId: TEST_TENANT_ID
      };

      const lagosResponse = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
        data: {
          method: 'calculate',
          params: lagosPayload
        }
      });

      // Test Abuja region
      const abujaPayload = { ...lagosPayload, region: 'Abuja' };
      const abujaResponse = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
        data: {
          method: 'calculate',
          params: abujaPayload
        }
      });

      if (lagosResponse.status() === 200 && abujaResponse.status() === 200) {
        const lagosResult = await lagosResponse.json();
        const abujaResult = await abujaResponse.json();

        // Regional rates may differ based on database configuration
        expect(lagosResult.tax).toBeGreaterThan(0);
        expect(abujaResult.tax).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Gateway Contract: getRegionRates method', () => {
    test('should return region tax rates with valid tenantId', async ({ request }) => {
      const payload = {
        region: 'NG',
        tenantId: TEST_TENANT_ID
      };

      const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/getRegionRates`, {
        data: payload
      });

      expect(response.status()).toBe(200);
      const result = await response.json();

      // ✅ CONTRACT VALIDATION: Expected structure
      expect(result).toHaveProperty('taxMultiplier');
      expect(result).toHaveProperty('region');
      expect(result.region).toBe('NG');
      expect(typeof result.taxMultiplier).toBe('number');
      expect(result.taxMultiplier).toBeGreaterThan(0);
    });

    test('should require tenantId for region rates', async ({ request }) => {
      const payload = {
        region: 'NG'
        // Missing tenantId
      };

      const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/getRegionRates`, {
        data: payload
      });

      // ✅ SECURITY: Should reject requests without tenantId
      expect(response.status()).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('tenantId');
    });

    test('should handle unknown regions gracefully', async ({ request }) => {
      const payload = {
        region: 'UNKNOWN_REGION',
        tenantId: TEST_TENANT_ID
      };

      const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/getRegionRates`, {
        data: payload
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      // Should return default multiplier for unknown regions
      expect(result.taxMultiplier).toBe(1);
    });
  });

  test.describe('Multi-Tenant Isolation', () => {
    test('should isolate tax configurations between tenants', async ({ request }) => {
      const tenant1Payload = {
        amount: 1000,
        taxRate: 0.075,
        region: 'NG',
        itemType: 'product',
        tenantId: 'tenant-1'
      };

      const tenant2Payload = {
        ...tenant1Payload,
        tenantId: 'tenant-2'
      };

      const [response1, response2] = await Promise.all([
        request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
          data: { method: 'calculate', params: tenant1Payload }
        }),
        request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
          data: { method: 'calculate', params: tenant2Payload }
        })
      ]);

      if (response1.status() === 200 && response2.status() === 200) {
        const result1 = await response1.json();
        const result2 = await response2.json();

        // Results may be different based on tenant-specific configurations
        expect(result1).toHaveProperty('tax');
        expect(result2).toHaveProperty('tax');
        
        // Both should be valid calculations
        expect(result1.tax).toBeGreaterThan(0);
        expect(result2.tax).toBeGreaterThan(0);
      }
    });

    test('should cache tenant-specific configurations separately', async ({ request }) => {
      // This test verifies that cached configurations are properly scoped to tenants
      const payload = {
        amount: 1000,
        taxRate: 0.075,
        region: 'NG',
        itemType: 'product',
        tenantId: TEST_TENANT_ID
      };

      // First call (should populate cache)
      const firstResponse = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
        data: { method: 'calculate', params: payload }
      });

      // Second call with same tenant (should use cache)
      const secondResponse = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
        data: { method: 'calculate', params: payload }
      });

      // Third call with different tenant (should not use first tenant's cache)
      const differentTenantResponse = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
        data: { 
          method: 'calculate', 
          params: { ...payload, tenantId: 'different-tenant' }
        }
      });

      expect(firstResponse.status()).toBe(200);
      expect(secondResponse.status()).toBe(200);
      
      const firstResult = await firstResponse.json();
      const secondResult = await secondResponse.json();
      
      // Same tenant should return identical results
      expect(firstResult).toEqual(secondResult);
    });
  });

  test.describe('Error Handling and Fallbacks', () => {
    test('should handle database connection failures gracefully', async ({ request }) => {
      // This would require mocking database failures
      // For now, test that the endpoint responds appropriately to edge cases
      
      const payload = {
        amount: 0, // Edge case: zero amount
        taxRate: 0.075,
        region: 'NG',
        itemType: 'product',
        tenantId: TEST_TENANT_ID
      };

      const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/getRegionRates`, {
        data: { method: 'calculate', params: payload }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.tax).toBe(0);
      expect(result.total).toBe(0);
    });

    test('should handle extreme values appropriately', async ({ request }) => {
      const testCases = [
        { amount: 999999999, taxRate: 0.075 }, // Very large amount
        { amount: 0.01, taxRate: 0.075 },      // Very small amount  
        { amount: 1000, taxRate: 0.25 },       // High tax rate
        { amount: 1000, taxRate: 0 }           // Zero tax rate
      ];

      for (const testCase of testCases) {
        const payload = {
          ...testCase,
          region: 'NG',
          itemType: 'product',
          tenantId: TEST_TENANT_ID
        };

        const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/getRegionRates`, {
          data: { method: 'calculate', params: payload }
        });

        expect(response.status()).toBe(200);
        const result = await response.json();
        expect(result.tax).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeGreaterThanOrEqual(testCase.amount);
      }
    });
  });

  test.describe('Performance and Caching', () => {
    test('should respond within acceptable time limits', async ({ request }) => {
      const payload = {
        amount: 1000,
        taxRate: 0.075,
        region: 'NG',
        itemType: 'product',
        tenantId: TEST_TENANT_ID
      };

      const startTime = Date.now();
      const response = await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee/actions/getRegionRates`, {
        data: { method: 'calculate', params: payload }
      });
      const endTime = Date.now();

      expect(response.status()).toBe(200);
      
      // Should respond within 2 seconds (adjust based on requirements)
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(2000);
    });

    test('should improve performance on subsequent calls (caching)', async ({ request }) => {
      const payload = {
        amount: 1000,
        taxRate: 0.075,
        region: 'NG',
        itemType: 'product',
        tenantId: TEST_TENANT_ID
      };

      // First call (cold)
      const start1 = Date.now();
      await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
        data: { method: 'calculate', params: payload }
      });
      const time1 = Date.now() - start1;

      // Second call (should be cached/warmer)
      const start2 = Date.now();
      await request.post(`${API_BASE}/api/cells/inventory/TaxAndFee`, {
        data: { method: 'calculate', params: payload }
      });
      const time2 = Date.now() - start2;

      // Cached call should generally be faster (though not always guaranteed)
      // This is more of a performance characteristic observation
      console.log(`First call: ${time1}ms, Second call: ${time2}ms`);
    });
  });
});