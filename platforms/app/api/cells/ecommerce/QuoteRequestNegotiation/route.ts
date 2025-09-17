/**
 * QuoteRequestNegotiation Cell API Route
 * Provides gateway communication for quote request and negotiation services
 * Following cellular independence principles with Cell Bus communication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context';
import { cellBus } from '../../../../../cell-sdk/loader/cell-bus';

// Handle GET requests - Return cell metadata and supported actions
export async function GET(request: NextRequest) {
  try {
    // Get tenant context for security
    const tenantContext = await getTenantContext(request);
    const { tenantId } = tenantContext;

    // Validate tenant access
    const hasAccess = await validateTenantAccess(tenantId, request);
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required or access denied'
      }, { status: 401 });
    }

    console.log(`[QuoteRequestNegotiation API] GET metadata request for tenant: ${tenantId}`);

    // Return QuoteRequestNegotiation cell metadata and capabilities
    return NextResponse.json({
      cellId: 'ecommerce/QuoteRequestNegotiation',
      name: 'QuoteRequestNegotiation',
      version: '1.0.0',
      description: 'Quote request and negotiation management for B2B wholesale customers with real-time messaging, Nigerian market pricing support, and automated offer conversion',
      status: 'operational',
      capabilities: {
        quoteRequestManagement: 'Create, update, and manage quote requests from B2B customers',
        negotiationMessaging: 'Real-time messaging system for quote negotiations',
        offerGeneration: 'Generate formal quotes and offers with Nigerian market compliance',
        priceCalculation: 'Calculate pricing with VAT, taxes, and wholesale tiers',
        documentGeneration: 'Generate PDF quotes and proforma invoices',
        statusTracking: 'Track quote status through complete negotiation lifecycle',
        nigerianCompliance: 'Support for Nigerian VAT, tax IDs, and business registration'
      },
      supportedActions: [
        'createQuoteRequest',           // Create new quote request
        'updateQuoteRequest',           // Update existing quote request
        'getQuoteRequest',              // Retrieve quote request details
        'searchQuoteRequests',          // Search and filter quote requests
        'addNegotiationMessage',        // Add message to negotiation thread
        'getNegotiationHistory',        // Get negotiation message history
        'createQuoteOffer',             // Generate formal quote offer
        'updateOfferStatus',            // Update offer status (accept/reject/counter)
        'convertToOrder',               // Convert approved quote to sales order
        'generateQuotePDF',             // Generate PDF document
        'assignSalesRep',               // Assign sales representative
        'calculateQuoteTotal',          // Calculate quote totals with taxes/fees
        'validateBusinessInfo',         // Validate Nigerian business information
        'getQuoteAnalytics'            // Get quote performance analytics
      ],
      quoteStatuses: [
        'draft', 'submitted', 'under_review', 'negotiating', 
        'quoted', 'approved', 'rejected', 'expired', 'converted', 'cancelled'
      ],
      messageTypes: [
        'customer_inquiry', 'sales_response', 'price_negotiation', 
        'terms_discussion', 'specification_change', 'delivery_update', 
        'system_notification', 'approval_request'
      ],
      nigerianFeatures: {
        vatSupport: true,
        vatRate: '7.5%',
        supportedCurrencies: ['NGN', 'USD'],
        taxIdValidation: true,
        businessRegistrationValidation: true,
        proformaInvoiceGeneration: true,
        withholdingTaxSupport: true
      },
      dependencies: {
        cells: ['customer/CustomerProfile', 'ecommerce/B2BAccessControl', 'customer/CustomerEngagement', 'inventory/TaxAndFee', 'ecommerce/WholesalePricingTiers'],
        services: ['sms-service', 'replitmail'],
        communicationMethod: 'cell_gateway_v2'
      },
      healthEndpoint: '/api/cells/ecommerce/QuoteRequestNegotiation/health',
      cellularIndependence: true,
      communicationMethod: 'cell_bus',
      hardcodedConfiguration: false, // ✅ Database-driven configuration
      configurationSource: 'database', // ✅ Configuration stored in database tables
      metadata: {
        tenantId,
        requestedAt: new Date().toISOString(),
        version: '1.0.0'
      }
    });

  } catch (error) {
    console.error('[QuoteRequestNegotiation API] GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve QuoteRequestNegotiation cell metadata'
    }, { status: 500 });
  }
}

// Handle POST requests for QuoteRequestNegotiation Cell actions
export async function POST(request: NextRequest) {
  try {
    // Get tenant context from request headers/subdomain
    const tenantContext = await getTenantContext(request);
    const { tenantId } = tenantContext;

    // Validate tenant access with authentication
    const hasAccess = await validateTenantAccess(tenantId, request);
    if (!hasAccess) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required or access denied'
      }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { action, ...payload } = body;

    if (!action) {
      return NextResponse.json({
        success: false,
        error: 'Action is required'
      }, { status: 400 });
    }

    console.log(`[QuoteRequestNegotiation] Executing action: ${action} for tenant: ${tenantId}`);

    // ✅ CELLULAR INDEPENDENCE: Use Cell Bus instead of direct imports
    console.log(`[QuoteRequestNegotiation] Routing ${action} through Cell Bus for cellular independence`);
    
    // Enhance payload with tenant context for security
    const enhancedPayload = {
      ...payload,
      tenantId, // Inject tenant context
      requestedAt: new Date().toISOString(),
      source: 'api_gateway'
    };

    let result;
    
    try {
      // ✅ STRICT CELLULAR INDEPENDENCE: Use Cell Bus ONLY - NO FALLBACKS
      result = await cellBus.call('ecommerce/QuoteRequestNegotiation', action, enhancedPayload);
    } catch (cellBusError) {
      // 🚨 PRODUCTION-SAFE: No fallback to direct imports - maintain cellular independence
      console.error(`[QuoteRequestNegotiation] Cell Bus failed for ${action} - cellular independence maintained:`, cellBusError);
      
      return NextResponse.json({
        success: false,
        error: 'Cell communication failed',
        message: 'QuoteRequestNegotiation cell is temporarily unavailable',
        code: 'CELL_BUS_COMMUNICATION_ERROR',
        action,
        cellId: 'ecommerce/QuoteRequestNegotiation',
        retryable: true
      }, { status: 502 });
    }

    // ✅ CELLULAR INDEPENDENCE ACHIEVED: Return result from Cell Bus communication only
    return NextResponse.json({
      ...result,
      metadata: {
        cellId: 'ecommerce/QuoteRequestNegotiation',
        action,
        version: '1.0.0',
        tenantId,
        processedAt: new Date().toISOString(),
        cellularIndependence: true,
        communicationMethod: 'cell_bus',
        fallbacksDisabled: true,
        hardcodedConfiguration: false // ✅ Database-driven configuration
      }
    });

  } catch (error) {
    console.error('[QuoteRequestNegotiation API] Error:', error);

    return NextResponse.json({
      success: false,
      error: 'QuoteRequestNegotiation operation failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      cellId: 'ecommerce/QuoteRequestNegotiation',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}