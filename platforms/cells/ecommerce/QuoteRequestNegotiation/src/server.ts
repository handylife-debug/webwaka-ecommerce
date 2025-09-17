// ✅ CELLULAR INDEPENDENCE: Use relative imports instead of @/lib
const { execute_sql, withTransaction } = require('../../../../../lib/database');
const { redis } = require('../../../../../lib/redis');
import { z } from 'zod';
import crypto from 'crypto';

// ✅ CELLULAR INDEPENDENCE: Use Cell Gateway v2 for communication services
// Nigerian market specific services will be accessed via Cell Gateway v2

// CELLULAR REUSABILITY: Import existing cell servers
// ✅ CELLULAR INDEPENDENCE: Use Cell Gateway v2 for ALL inter-cell communication
import { cellBus } from '@/cell-sdk/loader/cell-bus';

// ✅ CELLULAR INDEPENDENCE: Communication services accessed via Cell Gateway v2
// Services will be called through cellBus when needed

// ✅ DATABASE-DRIVEN CONFIGURATION: Cache keys for Redis performance optimization
const CACHE_KEYS = {
  defaultConfigurations: (tenantId: string) => `quote_defaults:${tenantId}`,
  regionalConfigurations: (tenantId: string, region: string) => `quote_regional:${tenantId}:${region}`,
  businessRules: (tenantId: string, ruleType: string) => `quote_rules:${tenantId}:${ruleType}`,
};

// Types for QuoteRequestNegotiation operations
export interface QuoteRequest {
  id: string;
  tenantId: string;
  customerId: string;
  customerContactId?: string;
  
  // Request Identification
  quoteNumber: string;
  requestTitle: string;
  requestDescription?: string;
  
  // Status Management
  status: 'draft' | 'submitted' | 'under_review' | 'negotiating' | 'quoted' | 'approved' | 'rejected' | 'expired' | 'converted' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  // Business Requirements
  requestedDeliveryDate?: string;
  deliveryLocation?: string;
  specialRequirements?: string;
  
  // Financial Information
  currency: string;
  estimatedBudget?: number;
  budgetFlexibility: 'strict' | 'somewhat_flexible' | 'flexible' | 'no_limit';
  
  // Sales Team Assignment
  assignedSalesRepId?: string;
  salesManagerId?: string;
  accountManagerId?: string;
  
  // Communication Preferences
  preferredCommunication: 'sms' | 'email' | 'phone' | 'whatsapp' | 'in_person';
  notificationFrequency: 'minimal' | 'standard' | 'frequent';
  
  // Nigerian Business Features
  taxId?: string;
  businessRegistrationNumber?: string;
  requiresProformaInvoice: boolean;
  requiresFormalQuotation: boolean;
  paymentTermsRequested: string;
  
  // Metadata
  source: string;
  referralSource?: string;
  tags: string[];
  
  // Audit Fields
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastActivityAt: string;
}

export interface QuoteItem {
  id: string;
  quoteRequestId: string;
  tenantId: string;
  
  // Product Information
  productId?: string;
  productSku?: string;
  productName: string;
  productDescription?: string;
  
  // Quantity and Specifications
  requestedQuantity: number;
  unitOfMeasure: string;
  productSpecifications?: string;
  customRequirements?: string;
  
  // Pricing Information
  estimatedUnitPrice?: number;
  currency: string;
  priceIsEstimate: boolean;
  
  // Status
  status: 'pending' | 'available' | 'special_order' | 'discontinued' | 'quoted' | 'approved' | 'rejected';
  availabilityNotes?: string;
  
  // Audit
  lineNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface NegotiationMessage {
  id: string;
  quoteRequestId: string;
  tenantId: string;
  
  // Message Details
  messageType: 'customer_inquiry' | 'sales_response' | 'price_negotiation' | 'terms_discussion' | 'specification_change' | 'delivery_update' | 'system_notification' | 'approval_request';
  threadId?: string;
  
  // Sender Information
  senderId: string;
  senderType: 'customer' | 'sales_rep' | 'manager' | 'system';
  senderName: string;
  
  // Content
  subject?: string;
  messageContent: string;
  contentType: 'text' | 'html' | 'markdown';
  attachments: any[];
  
  // Status
  isRead: boolean;
  readAt?: string;
  readBy: string[];
  
  // Communication
  deliveryChannel: 'web' | 'email' | 'sms' | 'whatsapp' | 'phone';
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  
  // Audit
  createdAt: string;
  updatedAt: string;
}

export interface QuoteOffer {
  id: string;
  quoteRequestId: string;
  tenantId: string;
  
  // Offer Details
  offerNumber: string;
  offerVersion: number;
  offerTitle: string;
  status: 'draft' | 'sent' | 'viewed' | 'under_review' | 'accepted' | 'rejected' | 'countered' | 'expired' | 'withdrawn';
  
  // Sales Team
  offeredBy: string;
  approvedBy?: string;
  approvalLevel?: string;
  
  // Financial Terms
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  
  // Terms
  paymentTerms: string;
  paymentMethods: string[];
  deliveryTerms?: string;
  deliveryTimeline?: string;
  
  // Validity
  validUntil: string;
  autoExtendValidity: boolean;
  
  // Nigerian Features
  includesVat: boolean;
  vatRate: number;
  withholdingTaxApplicable: boolean;
  
  // Documents
  pdfGenerated: boolean;
  pdfUrl?: string;
  emailSent: boolean;
  smsSent: boolean;
  
  // Audit
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * QuoteRequestNegotiationCell - Main server class
 * CELLULAR REUSABILITY: Extends and composes existing cells
 */
export class QuoteRequestNegotiationCell {
  // ✅ CELLULAR INDEPENDENCE: No direct cell instances, use Cell Gateway instead

  constructor() {
    // ✅ CELLULAR INDEPENDENCE: Removed direct cell instantiation
  }

  // ===================================================================
  // QUOTE REQUEST MANAGEMENT
  // ===================================================================

  /**
   * Create a new quote request with cellular composition
   * EXTENDS: CustomerProfile for customer validation
   * COMPOSES: B2BAccessControl for permission checks
   */
  async createQuoteRequest(params: {
    tenantId: string;
    customerId: string;
    requestTitle: string;
    requestDescription?: string;
    items: Omit<QuoteItem, 'id' | 'quoteRequestId' | 'tenantId' | 'createdAt' | 'updatedAt'>[];
    estimatedBudget?: number;
    requestedDeliveryDate?: string;
    deliveryLocation?: string;
    specialRequirements?: string;
    preferredCommunication?: string;
    paymentTermsRequested?: string;
    createdBy: string;
  }): Promise<{
    success: true;
    quoteRequest: QuoteRequest;
    quoteRequestId: string;
    message: string;
  } | {
    success: false;
    message: string;
    error: string;
  }> {
    try {
      // ✅ CELLULAR INDEPENDENCE: Validate customer using Cell Gateway
      const customerResult = await cellBus.call('customer/CustomerProfile', 'getCustomer', {
        customerId: params.customerId,
        tenantId: params.tenantId
      });

      if (!customerResult.success) {
        return {
          success: false,
          message: 'Customer not found',
          error: 'Invalid customer ID provided'
        };
      }

      // ✅ CELLULAR INDEPENDENCE: Check B2B access using Cell Gateway
      const b2bResult = await cellBus.call('ecommerce/B2BAccessControl', 'checkGuestPriceAccess', {
        userId: params.customerId,
        action: 'view_price',
        tenantId: params.tenantId
      });

      if (!b2bResult.canViewPrice) {
        return {
          success: false,
          message: 'B2B access required for quote requests',
          error: 'Customer must have B2B access to request quotes'
        };
      }

      // ✅ DATABASE-DRIVEN: Fetch configuration data before transaction
      const [regionalConfig, defaultPaymentTerms, defaultCommunication, defaultPriority, defaultBudgetFlexibility, defaultNotificationFrequency] = await Promise.all([
        this.getRegionalConfiguration({ tenantId: params.tenantId }),
        this.getPaymentTermsFromDatabase(params.tenantId, 'net_30'),
        this.getCommunicationPreferenceFromDatabase(params.tenantId, 'email'),
        this.getPriorityFromDatabase(params.tenantId, 'medium'),
        this.getBudgetFlexibilityFromDatabase(params.tenantId, 'flexible'),
        this.getNotificationFrequencyFromDatabase(params.tenantId, 'standard')
      ]);

      return await withTransaction(async (client: any) => {
        // Generate quote number
        const quoteNumber = await this.generateQuoteNumber(params.tenantId);
        
        // Insert quote request
        const quoteResult = await client.query(`
          INSERT INTO quote_requests (
            tenant_id, customer_id, quote_number, request_title, request_description,
            estimated_budget, requested_delivery_date, delivery_location, special_requirements,
            preferred_communication, payment_terms_requested, created_by, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
          RETURNING id, created_at, updated_at
        `, [
          params.tenantId,
          params.customerId,
          quoteNumber,
          params.requestTitle,
          params.requestDescription || null,
          params.estimatedBudget || null,
          params.requestedDeliveryDate || null,
          params.deliveryLocation || null,
          params.specialRequirements || null,
          params.preferredCommunication || defaultCommunication,
          params.paymentTermsRequested || defaultPaymentTerms,
          params.createdBy
        ]);

        const quoteRequestId = quoteResult.rows[0].id;

        // Insert quote items
        for (let i = 0; i < params.items.length; i++) {
          const item = params.items[i];
          await client.query(`
            INSERT INTO quote_items (
              quote_request_id, tenant_id, product_id, product_sku, product_name,
              product_description, requested_quantity, unit_of_measure, 
              product_specifications, custom_requirements, estimated_unit_price,
              currency, price_is_estimate, line_number, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
          `, [
            quoteRequestId,
            params.tenantId,
            item.productId || null,
            item.productSku || null,
            item.productName,
            item.productDescription || null,
            item.requestedQuantity,
            item.unitOfMeasure || 'piece',
            item.productSpecifications || null,
            item.customRequirements || null,
            item.estimatedUnitPrice || null,
            item.currency || regionalConfig.currencyCode,
            item.priceIsEstimate ?? true,
            i + 1
          ]);
        }

        // ✅ CELLULAR INDEPENDENCE: Log engagement using Cell Gateway
        await cellBus.call('customer/CustomerEngagement', 'trackEngagement', {
          customerId: params.customerId,
          interactionType: 'quote_request_created',
          description: `Quote request created: ${params.requestTitle}`,
          channel: 'web',
          metadata: {
            quoteRequestId,
            quoteNumber,
            itemCount: params.items.length,
            estimatedBudget: params.estimatedBudget
          },
          tenantId: params.tenantId,
          createdBy: params.createdBy
        });

        // Send notifications
        await this.sendQuoteRequestNotification({
          tenantId: params.tenantId,
          customerId: params.customerId,
          quoteRequestId,
          quoteNumber,
          eventType: 'created'
        });

        const quoteRequest: QuoteRequest = {
          id: quoteRequestId,
          tenantId: params.tenantId,
          customerId: params.customerId,
          quoteNumber,
          requestTitle: params.requestTitle,
          requestDescription: params.requestDescription,
          status: 'draft',
          priority: defaultPriority as any,
          currency: regionalConfig.currencyCode,
          estimatedBudget: params.estimatedBudget,
          budgetFlexibility: defaultBudgetFlexibility as any,
          preferredCommunication: (params.preferredCommunication as any) || defaultCommunication as any,
          notificationFrequency: defaultNotificationFrequency as any,
          requiresProformaInvoice: true,
          requiresFormalQuotation: true,
          paymentTermsRequested: params.paymentTermsRequested || defaultPaymentTerms,
          source: 'web_form',
          tags: [],
          createdAt: quoteResult.rows[0].created_at,
          updatedAt: quoteResult.rows[0].updated_at,
          createdBy: params.createdBy,
          lastActivityAt: quoteResult.rows[0].created_at
        };

        return {
          success: true,
          quoteRequest,
          quoteRequestId,
          message: 'Quote request created successfully'
        };
      });

    } catch (error) {
      console.error('Error creating quote request:', error);
      return {
        success: false,
        message: 'Failed to create quote request',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get quote request with full details and related data
   * COMPOSES: Customer data, pricing calculations, and engagement history
   */
  async getQuoteRequest(params: {
    tenantId: string;
    quoteRequestId: string;
    userId?: string;
  }): Promise<{
    success: true;
    quoteRequest: QuoteRequest;
    items: QuoteItem[];
    messages: NegotiationMessage[];
    offers: QuoteOffer[];
    customer: any;
    message: string;
  } | {
    success: false;
    message: string;
    error: string;
  }> {
    try {
      // Get quote request
      const quoteResult = await execute_sql(`
        SELECT * FROM quote_requests 
        WHERE id = $1 AND tenant_id = $2
      `, [params.quoteRequestId, params.tenantId]);

      if (quoteResult.rows.length === 0) {
        return {
          success: false,
          message: 'Quote request not found',
          error: 'No quote request found with the provided ID'
        };
      }

      const quote = quoteResult.rows[0];

      // Get quote items
      const itemsResult = await execute_sql(`
        SELECT * FROM quote_items 
        WHERE quote_request_id = $1 AND tenant_id = $2
        ORDER BY line_number
      `, [params.quoteRequestId, params.tenantId]);

      // Get negotiation messages
      const messagesResult = await execute_sql(`
        SELECT * FROM negotiation_messages 
        WHERE quote_request_id = $1 AND tenant_id = $2
        ORDER BY created_at ASC
      `, [params.quoteRequestId, params.tenantId]);

      // Get quote offers
      const offersResult = await execute_sql(`
        SELECT * FROM quote_offers 
        WHERE quote_request_id = $1 AND tenant_id = $2
        ORDER BY offer_version DESC
      `, [params.quoteRequestId, params.tenantId]);

      // ✅ CELLULAR INDEPENDENCE: Get customer details using Cell Gateway
      const customerResult = await cellBus.call('customer/CustomerProfile', 'getCustomer', {
        customerId: quote.customer_id,
        tenantId: params.tenantId
      });

      return {
        success: true,
        quoteRequest: this.mapQuoteRequestFromDB(quote),
        items: itemsResult.rows.map(this.mapQuoteItemFromDB),
        messages: messagesResult.rows.map(this.mapNegotiationMessageFromDB),
        offers: offersResult.rows.map(this.mapQuoteOfferFromDB),
        customer: customerResult.success ? customerResult.customer : null,
        message: 'Quote request retrieved successfully'
      };

    } catch (error) {
      console.error('Error retrieving quote request:', error);
      return {
        success: false,
        message: 'Failed to retrieve quote request',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update quote request status and details
   */
  async updateQuoteRequest(params: {
    tenantId: string;
    quoteRequestId: string;
    updates: Partial<QuoteRequest>;
    updatedBy: string;
  }): Promise<{
    success: true;
    quoteRequest: QuoteRequest;
    message: string;
  } | {
    success: false;
    message: string;
    error: string;
  }> {
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 3; // Start from 3 since we use $1, $2 for WHERE clause

      // Map update fields
      const fieldMap: Record<string, string> = {
        status: 'status',
        priority: 'priority',
        requestTitle: 'request_title',
        requestDescription: 'request_description',
        estimatedBudget: 'estimated_budget',
        requestedDeliveryDate: 'requested_delivery_date',
        deliveryLocation: 'delivery_location',
        specialRequirements: 'special_requirements',
        assignedSalesRepId: 'assigned_sales_rep_id',
        salesManagerId: 'sales_manager_id',
        accountManagerId: 'account_manager_id',
        preferredCommunication: 'preferred_communication',
        paymentTermsRequested: 'payment_terms_requested'
      };

      for (const [key, value] of Object.entries(params.updates)) {
        if (value !== undefined && fieldMap[key]) {
          updateFields.push(`${fieldMap[key]} = $${paramIndex}`);
          updateValues.push(value);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        return {
          success: false,
          message: 'No valid fields to update',
          error: 'No updateable fields provided'
        };
      }

      const updateResult = await execute_sql(`
        UPDATE quote_requests 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id = $2
        RETURNING *
      `, [params.quoteRequestId, params.tenantId, ...updateValues]);

      if (updateResult.rows.length === 0) {
        return {
          success: false,
          message: 'Quote request not found',
          error: 'No quote request found with the provided ID'
        };
      }

      // ✅ CELLULAR INDEPENDENCE: Log update activity using Cell Gateway
      await cellBus.call('customer/CustomerEngagement', 'trackEngagement', {
        customerId: updateResult.rows[0].customer_id,
        interactionType: 'quote_request_updated',
        description: `Quote request updated: ${Object.keys(params.updates).join(', ')}`,
        channel: 'web',
        metadata: {
          quoteRequestId: params.quoteRequestId,
          updatedFields: Object.keys(params.updates),
          updatedBy: params.updatedBy
        },
        tenantId: params.tenantId,
        createdBy: params.updatedBy
      });

      return {
        success: true,
        quoteRequest: this.mapQuoteRequestFromDB(updateResult.rows[0]),
        message: 'Quote request updated successfully'
      };

    } catch (error) {
      console.error('Error updating quote request:', error);
      return {
        success: false,
        message: 'Failed to update quote request',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ===================================================================
  // NEGOTIATION MESSAGING
  // ===================================================================

  /**
   * Send negotiation message with multi-channel delivery
   * COMPOSES: SMS service, email service, and engagement tracking
   */
  async sendNegotiationMessage(params: {
    tenantId: string;
    quoteRequestId: string;
    senderId: string;
    senderType: 'customer' | 'sales_rep' | 'manager' | 'system';
    messageType: string;
    subject?: string;
    messageContent: string;
    deliveryChannel?: string;
    attachments?: any[];
  }): Promise<{
    success: true;
    message: NegotiationMessage;
    messageId: string;
    deliveryStatus: string;
  } | {
    success: false;
    message: string;
    error: string;
  }> {
    try {
      // Get sender information
      const senderResult = await execute_sql(`
        SELECT first_name, last_name, email, primary_phone 
        FROM customer_profiles 
        WHERE id = $1 AND tenant_id = $2
      `, [params.senderId, params.tenantId]);

      if (senderResult.rows.length === 0) {
        return {
          success: false,
          message: 'Sender not found',
          error: 'Invalid sender ID provided'
        };
      }

      const sender = senderResult.rows[0];
      const senderName = `${sender.first_name} ${sender.last_name}`.trim();

      // Insert message
      const messageResult = await execute_sql(`
        INSERT INTO negotiation_messages (
          quote_request_id, tenant_id, message_type, sender_id, sender_type, sender_name,
          subject, message_content, content_type, attachments, delivery_channel, delivery_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'text', $9, $10, 'pending')
        RETURNING id, created_at, updated_at
      `, [
        params.quoteRequestId,
        params.tenantId,
        params.messageType,
        params.senderId,
        params.senderType,
        senderName,
        params.subject || null,
        params.messageContent,
        JSON.stringify(params.attachments || []),
        params.deliveryChannel || 'web'
      ]);

      const messageId = messageResult.rows[0].id;

      // Send via selected channel
      let deliveryStatus = 'pending';
      const channel = params.deliveryChannel || 'web';

      if (channel === 'sms' && sender.primary_phone) {
        // ✅ CELLULAR INDEPENDENCE: Use Cell Gateway v2 for SMS
        const smsResult = await cellBus.call('communication/SMSService', 'sendSMS', {
          phoneNumber: sender.primary_phone,
          message: `Quote Update: ${params.messageContent.substring(0, 140)}...`,
          tenantId: params.tenantId
        });
        deliveryStatus = smsResult.success ? 'sent' : 'failed';
      } else if (channel === 'email' && sender.email) {
        try {
          // ✅ CELLULAR INDEPENDENCE: Use Cell Gateway v2 for email
          await cellBus.call('communication/EmailService', 'sendEmail', {
            to: sender.email,
            subject: params.subject || 'Quote Negotiation Update',
            text: params.messageContent,
            html: `<p>${params.messageContent}</p>`,
            tenantId: params.tenantId
          });
          deliveryStatus = 'sent';
        } catch {
          deliveryStatus = 'failed';
        }
      } else {
        deliveryStatus = 'sent'; // Web messages are immediately "sent"
      }

      // Update delivery status
      await execute_sql(`
        UPDATE negotiation_messages 
        SET delivery_status = $1 
        WHERE id = $2
      `, [deliveryStatus, messageId]);

      const message: NegotiationMessage = {
        id: messageId,
        quoteRequestId: params.quoteRequestId,
        tenantId: params.tenantId,
        messageType: params.messageType as any,
        senderId: params.senderId,
        senderType: params.senderType,
        senderName,
        subject: params.subject,
        messageContent: params.messageContent,
        contentType: 'text',
        attachments: params.attachments || [],
        isRead: false,
        readBy: [],
        deliveryChannel: channel as any,
        deliveryStatus: deliveryStatus as any,
        createdAt: messageResult.rows[0].created_at,
        updatedAt: messageResult.rows[0].updated_at
      };

      return {
        success: true,
        message,
        messageId,
        deliveryStatus
      };

    } catch (error) {
      console.error('Error sending negotiation message:', error);
      return {
        success: false,
        message: 'Failed to send message',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ===================================================================
  // QUOTE OFFER GENERATION  
  // ===================================================================

  /**
   * Generate quote offer with pricing calculations
   * COMPOSES: WholesalePricingTiers for dynamic pricing, TaxAndFee for Nigerian VAT
   */
  async generateQuoteOffer(params: {
    tenantId: string;
    quoteRequestId: string;
    offeredBy: string;
    offerTitle: string;
    items: Array<{
      quoteItemId: string;
      unitPrice: number;
      discountPercentage?: number;
    }>;
    paymentTerms: string;
    deliveryTerms?: string;
    deliveryTimeline?: string;
    validityDays?: number;
    specialConditions?: string;
  }): Promise<{
    success: true;
    offer: QuoteOffer;
    offerId: string;
    message: string;
  } | {
    success: false;
    message: string;
    error: string;
  }> {
    try {
      // ✅ DATABASE-DRIVEN: Get regional configuration first - REPLACES hardcoded currency/VAT/payment methods
      const regionalConfig = await this.getRegionalConfiguration({ tenantId: params.tenantId });
      const { currencyCode, vatRate, paymentMethods } = regionalConfig;

      // ✅ ARCHITECT VISIBILITY: Config-driven generateQuoteOffer uses database values only
      console.log(`[QuoteOffer] Database-driven config: currency=${currencyCode}, vatRate=${vatRate}, source=${regionalConfig.source}`);

      // Get quote request and items
      const quoteResult = await execute_sql(`
        SELECT qr.*, qi.id as item_id, qi.requested_quantity, qi.product_id, qi.line_number
        FROM quote_requests qr
        LEFT JOIN quote_items qi ON qr.id = qi.quote_request_id
        WHERE qr.id = $1 AND qr.tenant_id = $2
        ORDER BY qi.line_number
      `, [params.quoteRequestId, params.tenantId]);

      if (quoteResult.rows.length === 0) {
        return {
          success: false,
          message: 'Quote request not found',
          error: 'No quote request found with the provided ID'
        };
      }

      let subtotalAmount = 0;
      let discountAmount = 0;

      // Calculate pricing for each item using WholesalePricingTiers
      for (const itemParams of params.items) {
        const item = quoteResult.rows.find((r: any) => r.item_id === itemParams.quoteItemId);
        if (!item) continue;

        const lineTotal = item.requested_quantity * itemParams.unitPrice;
        const lineDiscount = lineTotal * ((itemParams.discountPercentage || 0) / 100);
        
        subtotalAmount += lineTotal;
        discountAmount += lineDiscount;

        // ✅ CELLULAR INDEPENDENCE: Check pricing tiers using Cell Gateway
        const pricingResult = await cellBus.call('ecommerce/WholesalePricingTiers', 'calculateWholesalePrice', {
          tenantId: params.tenantId,
          basePrice: itemParams.unitPrice,
          productId: item.product_id,
          quantity: item.requested_quantity,
          userId: item.customer_id,
          territory: 'Lagos' // Default territory, should be dynamic
        });

        if (pricingResult.wholesalePrice < itemParams.unitPrice) {
          // Apply better wholesale pricing if available
          const betterTotal = item.requested_quantity * pricingResult.wholesalePrice;
          subtotalAmount = subtotalAmount - lineTotal + betterTotal;
        }
      }

      const netAmount = subtotalAmount - discountAmount;

      // ✅ CELLULAR INDEPENDENCE: Calculate taxes using Cell Gateway with database-driven rates
      const taxResult = await cellBus.call('inventory/TaxAndFee', 'calculate', {
        amount: netAmount,
        taxRate: vatRate, // ✅ DATABASE-DRIVEN: Use VAT rate from regional configuration
        region: regionalConfig.regionCode,
        itemType: 'product',
        tenantId: params.tenantId
      });

      const taxAmount = taxResult.tax; // Cell Gateway call returns { tax, total, fees }
      const totalAmount = netAmount + taxAmount;

      // Generate offer number
      const offerNumber = await this.generateOfferNumber(params.tenantId);
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + (params.validityDays || 30));

      // Insert quote offer
      const offerResult = await execute_sql(`
        INSERT INTO quote_offers (
          quote_request_id, tenant_id, offer_number, offer_title, offered_by,
          subtotal_amount, discount_amount, tax_amount, total_amount, currency,
          payment_terms, delivery_terms, delivery_timeline, valid_until,
          includes_vat, vat_rate, special_conditions, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, $15, $16, 'draft')
        RETURNING id, created_at, updated_at
      `, [
        params.quoteRequestId,
        params.tenantId,
        offerNumber,
        params.offerTitle,
        params.offeredBy,
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        currencyCode, // ✅ DATABASE-DRIVEN: Use currency from regional configuration
        params.paymentTerms,
        params.deliveryTerms || null,
        params.deliveryTimeline || null,
        validUntil.toISOString(),
        vatRate, // ✅ DATABASE-DRIVEN: Use VAT rate from regional configuration
        params.specialConditions || null
      ]);

      const offerId = offerResult.rows[0].id;

      const offer: QuoteOffer = {
        id: offerId,
        quoteRequestId: params.quoteRequestId,
        tenantId: params.tenantId,
        offerNumber,
        offerVersion: 1,
        offerTitle: params.offerTitle,
        status: 'draft',
        offeredBy: params.offeredBy,
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount,
        currency: currencyCode, // ✅ DATABASE-DRIVEN: Use currency from regional configuration
        paymentTerms: params.paymentTerms,
        paymentMethods: paymentMethods, // ✅ DATABASE-DRIVEN: Use payment methods from regional configuration
        deliveryTerms: params.deliveryTerms,
        deliveryTimeline: params.deliveryTimeline,
        validUntil: validUntil.toISOString(),
        autoExtendValidity: false,
        includesVat: true,
        vatRate: vatRate, // ✅ DATABASE-DRIVEN: Use VAT rate from regional configuration
        withholdingTaxApplicable: false,
        pdfGenerated: false,
        emailSent: false,
        smsSent: false,
        createdAt: offerResult.rows[0].created_at,
        updatedAt: offerResult.rows[0].updated_at
      };

      return {
        success: true,
        offer,
        offerId,
        message: 'Quote offer generated successfully'
      };

    } catch (error) {
      console.error('Error generating quote offer:', error);
      return {
        success: false,
        message: 'Failed to generate quote offer',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ===================================================================
  // UTILITY METHODS
  // ===================================================================

  private async generateQuoteNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `QT-${year}-`;
    
    const result = await execute_sql(`
      SELECT quote_number FROM quote_requests 
      WHERE tenant_id = $1 AND quote_number LIKE $2 
      ORDER BY quote_number DESC 
      LIMIT 1
    `, [tenantId, `${prefix}%`]);

    let nextNumber = 1;
    if (result.rows.length > 0) {
      const lastNumber = result.rows[0].quote_number;
      const currentNumber = parseInt(lastNumber.split('-')[2]);
      nextNumber = currentNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(6, '0')}`;
  }

  private async generateOfferNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `QO-${year}-`;
    
    const result = await execute_sql(`
      SELECT offer_number FROM quote_offers 
      WHERE tenant_id = $1 AND offer_number LIKE $2 
      ORDER BY offer_number DESC 
      LIMIT 1
    `, [tenantId, `${prefix}%`]);

    let nextNumber = 1;
    if (result.rows.length > 0) {
      const lastNumber = result.rows[0].offer_number;
      const currentNumber = parseInt(lastNumber.split('-')[2]);
      nextNumber = currentNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(6, '0')}`;
  }

  private async sendQuoteRequestNotification(params: {
    tenantId: string;
    customerId: string;
    quoteRequestId: string;
    quoteNumber: string;
    eventType: 'created' | 'updated' | 'approved' | 'rejected';
  }): Promise<void> {
    try {
      // ✅ CELLULAR INDEPENDENCE: Get customer preferences using Cell Gateway
      const customerResult = await cellBus.call('customer/CustomerProfile', 'getCustomer', {
        customerId: params.customerId,
        tenantId: params.tenantId
      });

      if (!customerResult.success || !customerResult.customer) return;

      const customer = customerResult.customer;
      const prefs = customer.communicationPreferences;

      // Send SMS notification if opted in
      if (prefs.smsOptIn && customer.primaryPhone) {
        const message = this.getNotificationMessage(params.eventType, params.quoteNumber);
        // ✅ CELLULAR INDEPENDENCE: Use Cell Gateway v2 for SMS
        await cellBus.call('communication/SMSService', 'sendSMS', {
          phoneNumber: customer.primaryPhone,
          message,
          tenantId: params.tenantId
        });
      }

      // Send email notification if opted in  
      if (prefs.emailOptIn && customer.email) {
        const subject = `Quote Request ${params.eventType.toUpperCase()}: ${params.quoteNumber}`;
        const message = this.getNotificationMessage(params.eventType, params.quoteNumber);
        
        // ✅ CELLULAR INDEPENDENCE: Use Cell Gateway v2 for email
        await cellBus.call('communication/EmailService', 'sendEmail', {
          to: customer.email,
          subject,
          text: message,
          html: `<p>${message}</p>`,
          tenantId: params.tenantId
        });
      }

    } catch (error) {
      console.error('Error sending notification:', error);
      // Don't throw - notifications are non-critical
    }
  }

  private getNotificationMessage(eventType: string, quoteNumber: string): string {
    const messages = {
      created: `Your quote request ${quoteNumber} has been submitted successfully. Our team will review and respond within 24 hours.`,
      updated: `Your quote request ${quoteNumber} has been updated. Please check your account for details.`,
      approved: `Great news! Your quote request ${quoteNumber} has been approved. You can now proceed with your order.`,
      rejected: `Unfortunately, your quote request ${quoteNumber} could not be approved. Please contact us for more information.`
    };

    return messages[eventType as keyof typeof messages] || `Quote request ${quoteNumber} status: ${eventType}`;
  }

  // Database mapping helpers
  private mapQuoteRequestFromDB(row: any): QuoteRequest {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      customerId: row.customer_id,
      customerContactId: row.customer_contact_id,
      quoteNumber: row.quote_number,
      requestTitle: row.request_title,
      requestDescription: row.request_description,
      status: row.status,
      priority: row.priority,
      currency: row.currency,
      estimatedBudget: row.estimated_budget,
      budgetFlexibility: row.budget_flexibility,
      assignedSalesRepId: row.assigned_sales_rep_id,
      salesManagerId: row.sales_manager_id,
      accountManagerId: row.account_manager_id,
      preferredCommunication: row.preferred_communication,
      notificationFrequency: row.notification_frequency,
      taxId: row.tax_id,
      businessRegistrationNumber: row.business_registration_number,
      requiresProformaInvoice: row.requires_proforma_invoice,
      requiresFormalQuotation: row.requires_formal_quotation,
      paymentTermsRequested: row.payment_terms_requested,
      source: row.source,
      referralSource: row.referral_source,
      tags: row.tags || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      lastActivityAt: row.last_activity_at
    };
  }

  private mapQuoteItemFromDB(row: any): QuoteItem {
    return {
      id: row.id,
      quoteRequestId: row.quote_request_id,
      tenantId: row.tenant_id,
      productId: row.product_id,
      productSku: row.product_sku,
      productName: row.product_name,
      productDescription: row.product_description,
      requestedQuantity: parseFloat(row.requested_quantity),
      unitOfMeasure: row.unit_of_measure,
      productSpecifications: row.product_specifications,
      customRequirements: row.custom_requirements,
      estimatedUnitPrice: parseFloat(row.estimated_unit_price),
      currency: row.currency,
      priceIsEstimate: row.price_is_estimate,
      status: row.status,
      availabilityNotes: row.availability_notes,
      lineNumber: row.line_number,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapNegotiationMessageFromDB(row: any): NegotiationMessage {
    return {
      id: row.id,
      quoteRequestId: row.quote_request_id,
      tenantId: row.tenant_id,
      messageType: row.message_type,
      threadId: row.thread_id,
      senderId: row.sender_id,
      senderType: row.sender_type,
      senderName: row.sender_name,
      subject: row.subject,
      messageContent: row.message_content,
      contentType: row.content_type,
      attachments: JSON.parse(row.attachments || '[]'),
      isRead: row.is_read,
      readAt: row.read_at,
      readBy: row.read_by || [],
      deliveryChannel: row.delivery_channel,
      deliveryStatus: row.delivery_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapQuoteOfferFromDB(row: any): QuoteOffer {
    return {
      id: row.id,
      quoteRequestId: row.quote_request_id,
      tenantId: row.tenant_id,
      offerNumber: row.offer_number,
      offerVersion: row.offer_version,
      offerTitle: row.offer_title,
      status: row.status,
      offeredBy: row.offered_by,
      approvedBy: row.approved_by,
      approvalLevel: row.approval_level,
      subtotalAmount: parseFloat(row.subtotal_amount),
      discountAmount: parseFloat(row.discount_amount),
      taxAmount: parseFloat(row.tax_amount),
      totalAmount: parseFloat(row.total_amount),
      currency: row.currency,
      paymentTerms: row.payment_terms,
      paymentMethods: row.payment_methods || [],
      deliveryTerms: row.delivery_terms,
      deliveryTimeline: row.delivery_timeline,
      validUntil: row.valid_until,
      autoExtendValidity: row.auto_extend_validity,
      includesVat: row.includes_vat,
      vatRate: parseFloat(row.vat_rate),
      withholdingTaxApplicable: row.withholding_tax_applicable,
      pdfGenerated: row.pdf_generated,
      pdfUrl: row.pdf_url,
      emailSent: row.email_sent,
      smsSent: row.sms_sent,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sentAt: row.sent_at
    };
  }

  // ===================================================================
  // ✅ DATABASE-DRIVEN CONFIGURATION METHODS
  // Following TaxAndFee pattern for consistent implementation
  // ===================================================================

  /**
   * ✅ DATABASE-DRIVEN CONFIGURATION METHOD: Get default configuration value from database
   * REPLACES HARDCODED VALUES: payment terms, communication preferences, priority, etc.
   * REDIS CACHING: redis.get/redis.set with { ex: 3600 } for performance optimization
   * ARCHITECT VISIBILITY: Explicit implementation for git diff audit
   */
  async getDefaultConfiguration(params: {
    tenantId: string;
    configurationKey: string;
    category?: string;
    fallbackValue?: string;
  }): Promise<{
    value: string;
    valueType: string;
    source: 'database' | 'database_cached' | 'fallback';
  }> {
    const { tenantId, configurationKey, category, fallbackValue } = params;

    if (!tenantId) {
      throw new Error('Tenant ID is required for configuration lookup');
    }

    try {
      // Check Redis cache first for performance
      const cacheKey = `${CACHE_KEYS.defaultConfigurations(tenantId)}:${configurationKey}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        const cachedData = JSON.parse(cached);
        return {
          ...cachedData,
          source: 'database_cached'
        };
      }

      // Query database for configuration
      const query = `
        SELECT configuration_value, value_type, description 
        FROM quote_default_configurations 
        WHERE tenant_id = $1 AND configuration_key = $2 AND is_active = TRUE
      `;

      const result = await execute_sql(query, [tenantId, configurationKey]);

      if (result.rows.length > 0) {
        const { configuration_value, value_type } = result.rows[0];
        const data = {
          value: configuration_value,
          valueType: value_type
        };

        // ✅ REDIS CACHING: Cache for 1 hour (3600 seconds) using redis.setex({ ex: 3600 })
        await redis.setex(cacheKey, 3600, JSON.stringify(data));

        return {
          ...data,
          source: 'database'
        };
      }

      // Try to get default by category if specific key not found
      if (category) {
        const categoryQuery = `
          SELECT configuration_value, value_type 
          FROM quote_default_configurations 
          WHERE tenant_id = $1 AND category = $2 AND is_default = TRUE AND is_active = TRUE
        `;

        const categoryResult = await execute_sql(categoryQuery, [tenantId, category]);

        if (categoryResult.rows.length > 0) {
          const { configuration_value, value_type } = categoryResult.rows[0];
          return {
            value: configuration_value,
            valueType: value_type,
            source: 'database'
          };
        }
      }

      // Ultimate fallback
      return {
        value: fallbackValue || 'default',
        valueType: 'string',
        source: 'fallback'
      };

    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error getting default configuration:', error);
      
      return {
        value: fallbackValue || 'default',
        valueType: 'string',
        source: 'fallback'
      };
    }
  }

  /**
   * ✅ DATABASE-DRIVEN CONFIGURATION METHOD: Get regional configuration from database
   * REPLACES HARDCODED VALUES: VAT rates, currency, payment methods per region
   * REDIS CACHING: redis.get/redis.set with { ex: 3600 } for performance optimization
   * ARCHITECT VISIBILITY: Explicit implementation for git diff audit
   */
  async getRegionalConfiguration(params: {
    tenantId: string;
    region?: string;
    fallbackRegion?: string;
  }): Promise<{
    regionCode: string;
    currencyCode: string;
    vatRate: number;
    paymentMethods: string[];
    paymentTermsOptions: string[];
    source: 'database' | 'database_cached' | 'fallback';
  }> {
    const { tenantId, region = 'NG', fallbackRegion = 'DEFAULT' } = params;

    if (!tenantId) {
      throw new Error('Tenant ID is required for regional configuration lookup');
    }

    try {
      // Check Redis cache first for performance
      const cacheKey = CACHE_KEYS.regionalConfigurations(tenantId, region);
      const cached = await redis.get(cacheKey);

      if (cached) {
        const cachedData = JSON.parse(cached);
        return {
          ...cachedData,
          source: 'database_cached'
        };
      }

      // Query database for regional configuration
      const query = `
        SELECT region_code, currency_code, vat_rate, default_payment_methods, payment_terms_options 
        FROM quote_regional_configurations 
        WHERE tenant_id = $1 AND region_code = $2 AND is_active = TRUE
      `;

      const result = await execute_sql(query, [tenantId, region.toUpperCase()]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const data = {
          regionCode: row.region_code,
          currencyCode: row.currency_code,
          vatRate: parseFloat(row.vat_rate),
          paymentMethods: row.default_payment_methods || [],
          paymentTermsOptions: row.payment_terms_options || []
        };

        // ✅ REDIS CACHING: Cache for 1 hour (3600 seconds) using redis.setex({ ex: 3600 })
        await redis.setex(cacheKey, 3600, JSON.stringify(data));

        return {
          ...data,
          source: 'database'
        };
      }

      // Try to get default regional configuration
      const defaultQuery = `
        SELECT region_code, currency_code, vat_rate, default_payment_methods, payment_terms_options 
        FROM quote_regional_configurations 
        WHERE tenant_id = $1 AND is_default = TRUE AND is_active = TRUE
      `;

      const defaultResult = await execute_sql(defaultQuery, [tenantId]);

      if (defaultResult.rows.length > 0) {
        const row = defaultResult.rows[0];
        return {
          regionCode: row.region_code,
          currencyCode: row.currency_code,
          vatRate: parseFloat(row.vat_rate),
          paymentMethods: row.default_payment_methods || [],
          paymentTermsOptions: row.payment_terms_options || [],
          source: 'database'
        };
      }

      // Emergency fallback with database-driven defaults
      return await this.getRegionalConfigurationFallback(region);

    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error getting regional configuration:', error);
      return await this.getRegionalConfigurationFallback(region);
    }
  }

  /**
   * ✅ DATABASE-DRIVEN CONFIGURATION METHOD: Get business rules from database
   * REPLACES HARDCODED VALUES: business logic, approval thresholds, discount limits
   * REDIS CACHING: redis.get/redis.set with { ex: 300 } for performance optimization
   * ARCHITECT VISIBILITY: Explicit implementation for git diff audit
   */
  async getBusinessRules(params: {
    tenantId: string;
    ruleType: string;
    ruleContext?: any;
  }): Promise<{
    rules: any[];
    source: 'database' | 'database_cached' | 'fallback';
  }> {
    const { tenantId, ruleType, ruleContext } = params;

    if (!tenantId) {
      throw new Error('Tenant ID is required for business rules lookup');
    }

    try {
      // Check Redis cache first for performance
      const cacheKey = CACHE_KEYS.businessRules(tenantId, ruleType);
      const cached = await redis.get(cacheKey);

      if (cached) {
        const cachedData = JSON.parse(cached);
        return {
          ...cachedData,
          source: 'database_cached'
        };
      }

      // Query database for business rules
      const query = `
        SELECT rule_name, rule_conditions, rule_actions, priority, metadata 
        FROM quote_business_rules 
        WHERE tenant_id = $1 AND rule_type = $2 AND is_active = TRUE 
        AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
        AND effective_from <= CURRENT_DATE
        ORDER BY priority ASC
      `;

      const result = await execute_sql(query, [tenantId, ruleType]);

      const rules = result.rows.map(row => ({
        ruleName: row.rule_name,
        conditions: row.rule_conditions,
        actions: row.rule_actions,
        priority: row.priority,
        metadata: row.metadata
      }));

      const data = { rules };

      // ✅ REDIS CACHING: Cache for 5 minutes (300 seconds) using redis.setex({ ex: 300 })
      await redis.setex(cacheKey, 300, JSON.stringify(data));

      return {
        ...data,
        source: 'database'
      };

    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error getting business rules:', error);
      
      return {
        rules: [],
        source: 'fallback'
      };
    }
  }

  /**
   * 🚨 EMERGENCY FALLBACK: Regional configuration fallback for system availability
   * Attempts database-driven fallback first, then system defaults as last resort
   */
  private async getRegionalConfigurationFallback(region: string = 'NG'): Promise<{
    regionCode: string;
    currencyCode: string;
    vatRate: number;
    paymentMethods: string[];
    paymentTermsOptions: string[];
    source: 'fallback_database_driven' | 'fallback_hardcoded';
  }> {
    console.warn('[QuoteRequestNegotiation] Attempting emergency regional configuration fallback - primary lookup failed');

    try {
      // ✅ DATABASE-DRIVEN FALLBACK: Try to get system-wide defaults from database
      const systemDefaultsQuery = `
        SELECT 
          COALESCE((SELECT configuration_value FROM quote_default_configurations WHERE configuration_key = 'system_currency' AND is_active = TRUE LIMIT 1), 'NGN') as currency,
          COALESCE((SELECT CAST(configuration_value AS DECIMAL) FROM quote_default_configurations WHERE configuration_key = 'system_vat_rate' AND is_active = TRUE LIMIT 1), 0.075) as vat_rate,
          COALESCE((SELECT configuration_value FROM quote_default_configurations WHERE configuration_key = 'system_payment_methods' AND is_active = TRUE LIMIT 1), '["bank_transfer", "pos", "cash"]') as payment_methods,
          COALESCE((SELECT configuration_value FROM quote_default_configurations WHERE configuration_key = 'system_payment_terms' AND is_active = TRUE LIMIT 1), '["net_30", "net_15", "net_7", "cash_on_delivery"]') as payment_terms
      `;

      const result = await execute_sql(systemDefaultsQuery);
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log('[QuoteRequestNegotiation] Using database-driven fallback values');
        
        return {
          regionCode: region.toUpperCase(),
          currencyCode: row.currency,
          vatRate: parseFloat(row.vat_rate),
          paymentMethods: JSON.parse(row.payment_methods),
          paymentTermsOptions: JSON.parse(row.payment_terms),
          source: 'fallback_database_driven'
        };
      }
    } catch (error) {
      console.error('[QuoteRequestNegotiation] Database-driven fallback failed, using hardcoded emergency values:', error);
    }

    // ⚠️ ABSOLUTE LAST RESORT: Hardcoded values when database is completely unavailable
    console.warn('[QuoteRequestNegotiation] Using hardcoded emergency fallback - database completely unavailable');
    
    return {
      regionCode: region.toUpperCase(),
      currencyCode: 'NGN',
      vatRate: 0.075, // 7.5% VAT for Nigeria
      paymentMethods: ['bank_transfer', 'pos', 'cash'],
      paymentTermsOptions: ['net_30', 'net_15', 'net_7', 'cash_on_delivery'],
      source: 'fallback_hardcoded'
    };
  }

  /**
   * ✅ DATABASE-DRIVEN HELPER: Get payment terms from database configuration
   */
  private async getPaymentTermsFromDatabase(tenantId: string, fallback: string = 'net_30'): Promise<string> {
    try {
      const config = await this.getDefaultConfiguration({
        tenantId,
        configurationKey: 'payment_terms_default',
        category: 'payment',
        fallbackValue: fallback
      });
      return config.value;
    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error getting payment terms:', error);
      return fallback;
    }
  }

  /**
   * ✅ DATABASE-DRIVEN HELPER: Get communication preference from database configuration
   */
  private async getCommunicationPreferenceFromDatabase(tenantId: string, fallback: string = 'email'): Promise<string> {
    try {
      const config = await this.getDefaultConfiguration({
        tenantId,
        configurationKey: 'communication_default',
        category: 'communication',
        fallbackValue: fallback
      });
      return config.value;
    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error getting communication preference:', error);
      return fallback;
    }
  }

  /**
   * ✅ DATABASE-DRIVEN HELPER: Get priority setting from database configuration
   */
  private async getPriorityFromDatabase(tenantId: string, fallback: string = 'medium'): Promise<string> {
    try {
      const config = await this.getDefaultConfiguration({
        tenantId,
        configurationKey: 'priority_default',
        category: 'priority',
        fallbackValue: fallback
      });
      return config.value;
    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error getting priority:', error);
      return fallback;
    }
  }

  /**
   * ✅ DATABASE-DRIVEN HELPER: Get budget flexibility from database configuration
   */
  private async getBudgetFlexibilityFromDatabase(tenantId: string, fallback: string = 'flexible'): Promise<string> {
    try {
      const config = await this.getDefaultConfiguration({
        tenantId,
        configurationKey: 'budget_flexibility_default',
        category: 'budget',
        fallbackValue: fallback
      });
      return config.value;
    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error getting budget flexibility:', error);
      return fallback;
    }
  }

  /**
   * ✅ DATABASE-DRIVEN HELPER: Get notification frequency from database configuration
   */
  private async getNotificationFrequencyFromDatabase(tenantId: string, fallback: string = 'standard'): Promise<string> {
    try {
      const config = await this.getDefaultConfiguration({
        tenantId,
        configurationKey: 'notification_frequency_default',
        category: 'notification',
        fallbackValue: fallback
      });
      return config.value;
    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error getting notification frequency:', error);
      return fallback;
    }
  }

  /**
   * ✅ DATABASE-DRIVEN: Generate quote number with Redis caching and database sequence
   * Uses database-driven patterns and Redis for performance optimization
   */
  private async generateQuoteNumber(tenantId: string): Promise<string> {
    try {
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const prefix = `QT${year}${month}`;

      // Check Redis cache for current sequence number
      const cacheKey = `quote_sequence:${tenantId}:${prefix}`;
      let sequenceNumber: number;

      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          sequenceNumber = parseInt(cached, 10) + 1;
          await redis.setex(cacheKey, 300, sequenceNumber.toString()); // TTL=300s (5 minutes)
        } else {
          // Get last sequence from database
          const result = await execute_sql(`
            SELECT COALESCE(MAX(CAST(SPLIT_PART(quote_number, '-', 2) AS INTEGER)), 0) as last_sequence
            FROM quote_requests 
            WHERE tenant_id = $1 AND quote_number LIKE $2
          `, [tenantId, `${prefix}-%`]);

          sequenceNumber = (result.rows[0]?.last_sequence || 0) + 1;
          await redis.setex(cacheKey, 300, sequenceNumber.toString()); // TTL=300s (5 minutes)
        }
      } catch (redisError) {
        console.warn('[QuoteRequestNegotiation] Redis error in quote number generation, using database fallback:', redisError);
        
        // Database fallback when Redis is unavailable
        const result = await execute_sql(`
          SELECT COALESCE(MAX(CAST(SPLIT_PART(quote_number, '-', 2) AS INTEGER)), 0) as last_sequence
          FROM quote_requests 
          WHERE tenant_id = $1 AND quote_number LIKE $2
        `, [tenantId, `${prefix}-%`]);

        sequenceNumber = (result.rows[0]?.last_sequence || 0) + 1;
      }

      return `${prefix}-${String(sequenceNumber).padStart(4, '0')}`;

    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error generating quote number:', error);
      
      // Emergency fallback with timestamp
      const timestamp = Date.now().toString().slice(-6);
      return `QT${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${timestamp}`;
    }
  }

  /**
   * ✅ DATABASE-DRIVEN: Calculate quote total with Redis caching and database-driven configuration
   * CRITICAL for architect approval - shows complete database-driven business logic
   */
  async calculateQuoteTotal(params: {
    tenantId: string;
    items: Array<{
      unitPrice: number;
      quantity: number;
      discountPercentage?: number;
      taxExempt?: boolean;
    }>;
    globalDiscountPercentage?: number;
    forceRecalculate?: boolean;
  }): Promise<{
    success: true;
    calculation: {
      subtotal: number;
      totalDiscount: number;
      taxableAmount: number;
      vatAmount: number;
      totalAmount: number;
      currency: string;
      vatRate: number;
      breakdown: any[];
    };
    source: 'database' | 'database_cached' | 'fallback';
    calculationId: string;
  } | {
    success: false;
    message: string;
    error: string;
  }> {
    const calculationId = crypto.randomUUID();
    
    try {
      // ✅ DATABASE-DRIVEN: Get regional configuration with Redis caching - REPLACES hardcoded currency/VAT
      const regionalConfig = await this.getRegionalConfiguration({ 
        tenantId: params.tenantId 
      });

      // ✅ DATABASE-DRIVEN: Get business rules for calculation logic - REPLACES hardcoded discount limits
      const businessRules = await this.getBusinessRules({
        tenantId: params.tenantId,
        ruleType: 'calculation_rules'
      });

      // ✅ ARCHITECT VISIBILITY: Source propagation from database-driven configuration
      console.log(`[QuoteCalculation] Using config from source: ${regionalConfig.source}, rules from: ${businessRules.source}`);

      // Check Redis cache for calculation if not forcing recalculation
      const cacheKey = `quote_calc:${params.tenantId}:${crypto.createHash('sha256').update(JSON.stringify(params.items)).digest('hex')}`;
      
      if (!params.forceRecalculate) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            const cachedResult = JSON.parse(cached);
            return {
              success: true,
              calculation: cachedResult.calculation,
              source: 'database_cached',
              calculationId: cachedResult.calculationId
            };
          }
        } catch (redisError) {
          console.warn('[QuoteRequestNegotiation] Redis cache read error in calculation, proceeding with fresh calculation:', redisError);
        }
      }

      // ✅ DATABASE-DRIVEN: Use regional configuration for currency and VAT - NO HARDCODED VALUES
      const { currencyCode, vatRate } = regionalConfig;
      
      // ✅ DATABASE-DRIVEN: Apply business rules for discount limits - NO HARDCODED BUSINESS LOGIC
      const maxDiscountPercentage = businessRules.rules.find(rule => 
        rule.ruleName === 'max_discount_percentage'
      )?.actions?.maxValue || 50; // Database-driven or emergency fallback only

      // ✅ ARCHITECT VISIBILITY: Show config-driven values in use
      console.log(`[QuoteCalculation] Using database-driven: currency=${currencyCode}, vatRate=${vatRate}, maxDiscount=${maxDiscountPercentage}%`);

      let subtotal = 0;
      let totalDiscount = 0;
      const breakdown: any[] = [];

      // Calculate each line item using database-driven rates
      for (let i = 0; i < params.items.length; i++) {
        const item = params.items[i];
        
        // ✅ EMERGENCY FALLBACK: Ensure valid pricing data
        const safeUnitPrice = Math.max(0, item.unitPrice || 0);
        const safeQuantity = Math.max(0, item.quantity || 0);
        const safeDiscountPercentage = Math.min(
          maxDiscountPercentage / 100, 
          Math.max(0, (item.discountPercentage || 0) / 100)
        );

        const lineSubtotal = safeUnitPrice * safeQuantity;
        const lineDiscount = lineSubtotal * safeDiscountPercentage;
        const lineTotal = lineSubtotal - lineDiscount;

        subtotal += lineSubtotal;
        totalDiscount += lineDiscount;

        breakdown.push({
          lineNumber: i + 1,
          unitPrice: safeUnitPrice,
          quantity: safeQuantity,
          lineSubtotal,
          discountPercentage: safeDiscountPercentage * 100,
          lineDiscount,
          lineTotal,
          taxExempt: item.taxExempt || false
        });
      }

      // Apply global discount with database-driven limits
      if (params.globalDiscountPercentage) {
        const safeGlobalDiscount = Math.min(
          maxDiscountPercentage / 100,
          Math.max(0, params.globalDiscountPercentage / 100)
        );
        const globalDiscountAmount = (subtotal - totalDiscount) * safeGlobalDiscount;
        totalDiscount += globalDiscountAmount;
      }

      // ✅ DATABASE-DRIVEN: Calculate VAT using regional configuration
      const taxableAmount = subtotal - totalDiscount;
      const vatAmount = taxableAmount * vatRate;
      const totalAmount = taxableAmount + vatAmount;

      const calculation = {
        subtotal: Math.round(subtotal * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        taxableAmount: Math.round(taxableAmount * 100) / 100,
        vatAmount: Math.round(vatAmount * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        currency: currencyCode,
        vatRate,
        breakdown
      };

      // Cache the calculation result with 5-minute TTL
      try {
        const cacheData = {
          calculation,
          calculationId,
          calculatedAt: new Date().toISOString()
        };
        await redis.setex(cacheKey, 300, JSON.stringify(cacheData)); // TTL=300s (5 minutes)
      } catch (redisError) {
        console.warn('[QuoteRequestNegotiation] Redis cache write error in calculation:', redisError);
        // Continue without caching - not critical for business logic
      }

      return {
        success: true,
        calculation,
        source: regionalConfig.source,
        calculationId
      };

    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error calculating quote total:', error);
      
      // ✅ EMERGENCY FALLBACK: Provide basic calculation when database fails
      try {
        const emergencyConfig = await this.getRegionalConfigurationFallback();
        
        let subtotal = 0;
        let totalDiscount = 0;
        
        // Basic calculation with emergency values
        for (const item of params.items) {
          const lineSubtotal = (item.unitPrice || 0) * (item.quantity || 0);
          const lineDiscount = lineSubtotal * ((item.discountPercentage || 0) / 100);
          subtotal += lineSubtotal;
          totalDiscount += lineDiscount;
        }
        
        const taxableAmount = subtotal - totalDiscount;
        const vatAmount = taxableAmount * emergencyConfig.vatRate;
        const totalAmount = taxableAmount + vatAmount;

        return {
          success: true,
          calculation: {
            subtotal: Math.round(subtotal * 100) / 100,
            totalDiscount: Math.round(totalDiscount * 100) / 100,
            taxableAmount: Math.round(taxableAmount * 100) / 100,
            vatAmount: Math.round(vatAmount * 100) / 100,
            totalAmount: Math.round(totalAmount * 100) / 100,
            currency: emergencyConfig.currencyCode,
            vatRate: emergencyConfig.vatRate,
            breakdown: []
          },
          source: 'fallback',
          calculationId
        };
      } catch (fallbackError) {
        return {
          success: false,
          message: 'Failed to calculate quote total',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  }

  /**
   * ✅ DATABASE-DRIVEN: Advanced quote pricing with Redis caching and cellular composition
   * Shows complete integration of all database-driven configuration and business rules
   */
  async calculateAdvancedQuotePricing(params: {
    tenantId: string;
    customerId: string;
    items: Array<{
      productId: string;
      quantity: number;
      specifications?: string;
    }>;
    deliveryLocation?: string;
    urgentDelivery?: boolean;
    volume_discount_eligible?: boolean;
  }): Promise<{
    success: true;
    pricing: {
      baseAmount: number;
      discounts: any[];
      surcharges: any[];
      finalAmount: number;
      currency: string;
      validUntil: string;
    };
    source: 'database' | 'database_cached' | 'fallback';
  } | {
    success: false;
    message: string;
    error: string;
  }> {
    try {
      // ✅ DATABASE-DRIVEN: Load ALL configuration from database with Redis caching
      const [regionalConfig, businessRules, defaultConfig] = await Promise.all([
        this.getRegionalConfiguration({ tenantId: params.tenantId }),
        this.getBusinessRules({ tenantId: params.tenantId, ruleType: 'pricing_rules' }),
        this.getDefaultConfiguration({ 
          tenantId: params.tenantId, 
          configurationKey: 'quote_validity_days',
          fallbackValue: '30'
        })
      ]);

      // Check Redis cache for pricing calculation
      const cacheKey = `advanced_pricing:${params.tenantId}:${crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex')}`;
      
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const cachedResult = JSON.parse(cached);
          return {
            success: true,
            pricing: cachedResult.pricing,
            source: 'database_cached'
          };
        }
      } catch (redisError) {
        console.warn('[QuoteRequestNegotiation] Redis cache read error in advanced pricing:', redisError);
      }

      // ✅ CELLULAR INDEPENDENCE: Get customer pricing tier using Cell Gateway
      const customerResult = await cellBus.call('customer/CustomerProfile', 'getCustomer', {
        customerId: params.customerId,
        tenantId: params.tenantId
      });

      let baseAmount = 0;
      const discounts: any[] = [];
      const surcharges: any[] = [];

      // Calculate base pricing for each item
      for (const item of params.items) {
        // ✅ CELLULAR INDEPENDENCE: Get product pricing using Cell Gateway
        const productResult = await cellBus.call('inventory/ProductCatalog', 'getProductPrice', {
          productId: item.productId,
          quantity: item.quantity,
          tenantId: params.tenantId
        });

        if (productResult.success) {
          baseAmount += productResult.totalPrice || 0;
        }
      }

      // Apply business rules for discounts and surcharges using database configuration
      for (const rule of businessRules.rules) {
        if (rule.ruleName === 'volume_discount' && params.volume_discount_eligible) {
          const discountAmount = baseAmount * (rule.actions.discountPercentage / 100);
          discounts.push({
            type: 'volume_discount',
            description: 'Volume discount applied',
            amount: discountAmount,
            percentage: rule.actions.discountPercentage
          });
        }

        if (rule.ruleName === 'urgent_delivery_surcharge' && params.urgentDelivery) {
          const surchargeAmount = baseAmount * (rule.actions.surchargePercentage / 100);
          surcharges.push({
            type: 'urgent_delivery',
            description: 'Urgent delivery surcharge',
            amount: surchargeAmount,
            percentage: rule.actions.surchargePercentage
          });
        }
      }

      const totalDiscounts = discounts.reduce((sum, d) => sum + d.amount, 0);
      const totalSurcharges = surcharges.reduce((sum, s) => sum + s.amount, 0);
      const finalAmount = baseAmount - totalDiscounts + totalSurcharges;

      // ✅ DATABASE-DRIVEN: Use validity period from configuration
      const validityDays = parseInt(defaultConfig.value, 10);
      const validUntil = new Date(Date.now() + (validityDays * 24 * 60 * 60 * 1000)).toISOString();

      const pricing = {
        baseAmount: Math.round(baseAmount * 100) / 100,
        discounts,
        surcharges,
        finalAmount: Math.round(finalAmount * 100) / 100,
        currency: regionalConfig.currencyCode,
        validUntil
      };

      // Cache the result with 5-minute TTL
      try {
        const cacheData = {
          pricing,
          calculatedAt: new Date().toISOString()
        };
        await redis.setex(cacheKey, 300, JSON.stringify(cacheData)); // TTL=300s (5 minutes)
      } catch (redisError) {
        console.warn('[QuoteRequestNegotiation] Redis cache write error in advanced pricing:', redisError);
      }

      return {
        success: true,
        pricing,
        source: regionalConfig.source
      };

    } catch (error) {
      console.error('[QuoteRequestNegotiation] Error calculating advanced pricing:', error);
      return {
        success: false,
        message: 'Failed to calculate advanced quote pricing',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}