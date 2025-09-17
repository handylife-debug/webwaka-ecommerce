import { execute_sql, withTransaction } from '@/lib/database';
import { redis } from '@/lib/redis';
import { z } from 'zod';
import crypto from 'crypto';

// Nigerian market specific imports (REUSES existing infrastructure)
import { createSMSService, createCustomerCommunicationService } from '@/lib/sms-service';
import { sendEmail } from '@/lib/replitmail';

// CELLULAR REUSABILITY: Import existing cell servers
// ✅ CELLULAR INDEPENDENCE: Use Cell Gateway v2 for ALL inter-cell communication
import { cellBus } from '@/cell-sdk/loader/cell-bus';

// Initialize communication services
const smsService = createSMSService();
const customerComService = createCustomerCommunicationService();

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

      return await withTransaction(async (client) => {
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
          params.preferredCommunication || 'email',
          params.paymentTermsRequested || 'net_30',
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
            item.currency || 'NGN',
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
          priority: 'medium',
          currency: 'NGN',
          estimatedBudget: params.estimatedBudget,
          budgetFlexibility: 'flexible',
          preferredCommunication: (params.preferredCommunication as any) || 'email',
          notificationFrequency: 'standard',
          requiresProformaInvoice: true,
          requiresFormalQuotation: true,
          paymentTermsRequested: params.paymentTermsRequested || 'net_30',
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
        const smsResult = await smsService.sendSMS(
          sender.primary_phone,
          `Quote Update: ${params.messageContent.substring(0, 140)}...`
        );
        deliveryStatus = smsResult.success ? 'sent' : 'failed';
      } else if (channel === 'email' && sender.email) {
        try {
          await sendEmail({
            to: sender.email,
            subject: params.subject || 'Quote Negotiation Update',
            text: params.messageContent,
            html: `<p>${params.messageContent}</p>`
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

      // ✅ CELLULAR INDEPENDENCE: Calculate taxes using Cell Gateway
      const taxResult = await cellBus.call('inventory/TaxAndFee', 'calculate', {
        amount: netAmount,
        taxRate: 0.075, // 7.5% VAT for Nigeria
        region: 'NG',
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'NGN', $10, $11, $12, $13, true, 0.075, $14, 'draft')
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
        params.paymentTerms,
        params.deliveryTerms || null,
        params.deliveryTimeline || null,
        validUntil.toISOString(),
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
        currency: 'NGN',
        paymentTerms: params.paymentTerms,
        paymentMethods: ['bank_transfer', 'pos'], // Default Nigerian payment methods
        deliveryTerms: params.deliveryTerms,
        deliveryTimeline: params.deliveryTimeline,
        validUntil: validUntil.toISOString(),
        autoExtendValidity: false,
        includesVat: true,
        vatRate: 0.075,
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
        await smsService.sendSMS(customer.primaryPhone, message);
      }

      // Send email notification if opted in  
      if (prefs.emailOptIn && customer.email) {
        const subject = `Quote Request ${params.eventType.toUpperCase()}: ${params.quoteNumber}`;
        const message = this.getNotificationMessage(params.eventType, params.quoteNumber);
        
        await sendEmail({
          to: customer.email,
          subject,
          text: message,
          html: `<p>${message}</p>`
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
}