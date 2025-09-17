/**
 * Partner Management Database Schema
 * 
 * This schema implements a secure, multi-tenant partner management system with:
 * - Proper tenant isolation with tenant_id foreign keys
 * - Comprehensive unique constraints scoped by tenant
 * - Data integrity constraints and business rule validation
 * - Proper foreign key behaviors for data consistency
 * - Automatic timestamp updates via triggers
 */

// Core tenants table - foundation for multi-tenant architecture
export const TENANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subdomain VARCHAR(100) NOT NULL UNIQUE,
    tenant_name VARCHAR(200) NOT NULL,
    emoji VARCHAR(10) DEFAULT '🏢',
    subscription_plan VARCHAR(50) DEFAULT 'Free' CHECK (subscription_plan IN ('Free', 'Pro', 'Enterprise')),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended', 'Archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Data integrity constraints
    CONSTRAINT check_subdomain_format CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
    CONSTRAINT check_subdomain_length CHECK (char_length(subdomain) >= 2 AND char_length(subdomain) <= 50)
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
  CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
  
  -- Trigger for automatic updated_at
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ language 'plpgsql';
  
  CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

// SQL schema definitions for Partner Management tables

export const PARTNER_LEVELS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partner_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    level_code VARCHAR(50) NOT NULL,
    level_name VARCHAR(100) NOT NULL,
    level_order INTEGER NOT NULL,
    description TEXT,
    min_commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    default_commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    max_commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    min_downline_count INTEGER DEFAULT 0,
    min_volume_requirement DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    benefits JSONB DEFAULT '[]'::jsonb,
    requirements JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_partner_levels_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_level_code_per_tenant UNIQUE (tenant_id, level_code),
    CONSTRAINT unique_level_order_per_tenant UNIQUE (tenant_id, level_order),
    
    -- Data integrity constraints
    CONSTRAINT check_commission_rates_range CHECK (
      min_commission_rate >= 0 AND min_commission_rate <= 1 AND
      default_commission_rate >= 0 AND default_commission_rate <= 1 AND
      max_commission_rate >= 0 AND max_commission_rate <= 1
    ),
    CONSTRAINT check_commission_rates_order CHECK (
      min_commission_rate <= default_commission_rate AND 
      default_commission_rate <= max_commission_rate
    ),
    CONSTRAINT check_level_order_positive CHECK (level_order > 0),
    CONSTRAINT check_min_counts_non_negative CHECK (
      min_downline_count >= 0 AND min_volume_requirement >= 0
    )
  );
`;

export const PARTNERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    partner_code VARCHAR(50) NOT NULL,
    user_id UUID,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    partner_level_id UUID NOT NULL,
    sponsor_id UUID,
    enrollment_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'terminated')),
    commission_rate DECIMAL(5,4),
    total_downline_count INTEGER DEFAULT 0,
    direct_downline_count INTEGER DEFAULT 0,
    lifetime_volume DECIMAL(15,2) DEFAULT 0,
    current_month_volume DECIMAL(15,2) DEFAULT 0,
    last_activity_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_partners_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_partners_level FOREIGN KEY (partner_level_id) REFERENCES partner_levels(id) ON DELETE RESTRICT,
    CONSTRAINT fk_partners_sponsor FOREIGN KEY (sponsor_id) REFERENCES partners(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_partner_code_per_tenant UNIQUE (tenant_id, partner_code),
    CONSTRAINT unique_user_id_per_tenant UNIQUE (tenant_id, user_id),
    CONSTRAINT unique_email_per_tenant UNIQUE (tenant_id, email),
    
    -- Data integrity constraints
    CONSTRAINT check_commission_rate_range CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1)),
    CONSTRAINT check_downline_counts_non_negative CHECK (
      total_downline_count >= 0 AND 
      direct_downline_count >= 0 AND
      total_downline_count >= direct_downline_count
    ),
    CONSTRAINT check_volumes_non_negative CHECK (
      lifetime_volume >= 0 AND current_month_volume >= 0
    ),
    CONSTRAINT check_no_self_sponsorship CHECK (id != sponsor_id),
    CONSTRAINT check_enrollment_date_not_future CHECK (enrollment_date <= CURRENT_DATE)
  );
`;

export const PARTNER_RELATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partner_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    parent_partner_id UUID NOT NULL,
    child_partner_id UUID NOT NULL,
    depth INTEGER NOT NULL,
    path TEXT NOT NULL,
    relationship_type VARCHAR(20) DEFAULT 'sponsorship' CHECK (relationship_type IN ('sponsorship', 'mentorship', 'team')),
    established_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'severed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_partner_relations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_partner_relations_parent FOREIGN KEY (parent_partner_id) REFERENCES partners(id) ON DELETE CASCADE,
    CONSTRAINT fk_partner_relations_child FOREIGN KEY (child_partner_id) REFERENCES partners(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant - prevent duplicate relationships
    CONSTRAINT unique_partner_relationship_per_tenant UNIQUE (tenant_id, parent_partner_id, child_partner_id, relationship_type),
    
    -- Data integrity constraints
    CONSTRAINT check_no_self_relationship CHECK (parent_partner_id != child_partner_id),
    CONSTRAINT check_depth_positive CHECK (depth > 0),
    CONSTRAINT check_established_date_not_future CHECK (established_date <= CURRENT_DATE)
  );
`;

export const PARTNER_APPLICATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partner_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    company_name VARCHAR(200),
    company_website VARCHAR(255),
    experience_level VARCHAR(50),
    marketing_experience TEXT,
    why_partner TEXT,
    referral_methods TEXT,
    sponsor_email VARCHAR(255),
    sponsor_id UUID,
    requested_partner_level_id UUID,
    application_status VARCHAR(20) DEFAULT 'pending' CHECK (application_status IN ('pending', 'approved', 'rejected', 'withdrawn')),
    application_date DATE DEFAULT CURRENT_DATE,
    reviewed_date DATE,
    reviewed_by UUID,
    approval_notes TEXT,
    rejection_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_partner_applications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_partner_applications_sponsor FOREIGN KEY (sponsor_id) REFERENCES partners(id) ON DELETE SET NULL,
    CONSTRAINT fk_partner_applications_level FOREIGN KEY (requested_partner_level_id) REFERENCES partner_levels(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_application_email_per_tenant UNIQUE (tenant_id, email),
    
    -- Data integrity constraints
    CONSTRAINT check_application_date_not_future CHECK (application_date <= CURRENT_DATE),
    CONSTRAINT check_reviewed_date_after_application CHECK (reviewed_date IS NULL OR reviewed_date >= application_date),
    CONSTRAINT check_reviewed_status_consistency CHECK (
      (application_status = 'pending' AND reviewed_date IS NULL AND reviewed_by IS NULL) OR
      (application_status IN ('approved', 'rejected') AND reviewed_date IS NOT NULL AND reviewed_by IS NOT NULL) OR
      (application_status = 'withdrawn')
    )
  );
`;

// Indexes for performance optimization
export const PARTNER_LEVELS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_partner_levels_tenant_id ON partner_levels(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_levels_status ON partner_levels(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_partner_levels_order ON partner_levels(tenant_id, level_order);
  CREATE INDEX IF NOT EXISTS idx_partner_levels_created_at ON partner_levels(created_at);
`;

export const PARTNERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_partners_tenant_id ON partners(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partners_level_id ON partners(partner_level_id);
  CREATE INDEX IF NOT EXISTS idx_partners_sponsor_id ON partners(sponsor_id);
  CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_partners_email ON partners(tenant_id, email);
  CREATE INDEX IF NOT EXISTS idx_partners_enrollment_date ON partners(enrollment_date);
  CREATE INDEX IF NOT EXISTS idx_partners_last_activity ON partners(last_activity_date);
  CREATE INDEX IF NOT EXISTS idx_partners_created_at ON partners(created_at);
`;

export const PARTNER_RELATIONS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_partner_relations_tenant_id ON partner_relations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_parent ON partner_relations(parent_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_child ON partner_relations(child_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_depth ON partner_relations(tenant_id, depth);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_type ON partner_relations(tenant_id, relationship_type);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_status ON partner_relations(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_partner_relations_path_gin ON partner_relations USING GIN (to_tsvector('english', path));
`;

export const PARTNER_APPLICATIONS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_partner_applications_tenant_id ON partner_applications(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON partner_applications(tenant_id, application_status);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_email ON partner_applications(tenant_id, email);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_sponsor ON partner_applications(sponsor_id);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_level ON partner_applications(requested_partner_level_id);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_date ON partner_applications(application_date);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_reviewed ON partner_applications(reviewed_date);
  CREATE INDEX IF NOT EXISTS idx_partner_applications_created_at ON partner_applications(created_at);
`;

// Triggers for automatic updated_at timestamp updates
export const UPDATED_AT_TRIGGER_FUNCTION_SQL = `
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ language 'plpgsql';
`;

export const PARTNER_LEVELS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_partner_levels_updated_at ON partner_levels;
  CREATE TRIGGER trigger_update_partner_levels_updated_at
    BEFORE UPDATE ON partner_levels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PARTNERS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_partners_updated_at ON partners;
  CREATE TRIGGER trigger_update_partners_updated_at
    BEFORE UPDATE ON partners
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PARTNER_RELATIONS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_partner_relations_updated_at ON partner_relations;
  CREATE TRIGGER trigger_update_partner_relations_updated_at
    BEFORE UPDATE ON partner_relations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PARTNER_APPLICATIONS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_partner_applications_updated_at ON partner_applications;
  CREATE TRIGGER trigger_update_partner_applications_updated_at
    BEFORE UPDATE ON partner_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

// Partner Commissions table for Commission Engine
export const PARTNER_COMMISSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS partner_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    transaction_id VARCHAR(255) NOT NULL,
    transaction_amount DECIMAL(15,2) NOT NULL,
    transaction_type VARCHAR(50) DEFAULT 'payment' CHECK (transaction_type IN ('payment', 'signup', 'recurring', 'bonus')),
    
    -- Who receives the commission
    beneficiary_partner_id UUID NOT NULL,
    beneficiary_partner_code VARCHAR(50) NOT NULL,
    
    -- Who made the original sale/transaction
    source_partner_id UUID NOT NULL,
    source_partner_code VARCHAR(50) NOT NULL,
    
    -- Commission calculation details
    commission_level INTEGER NOT NULL DEFAULT 1,
    levels_from_source INTEGER NOT NULL DEFAULT 1,
    commission_percentage DECIMAL(5,4) NOT NULL,
    commission_amount DECIMAL(15,2) NOT NULL,
    
    -- Partner level information at time of calculation
    beneficiary_partner_level_id UUID NOT NULL,
    beneficiary_partner_level_name VARCHAR(100) NOT NULL,
    
    -- Commission status and tracking
    calculation_status VARCHAR(20) DEFAULT 'calculated' CHECK (calculation_status IN ('calculated', 'approved', 'paid', 'cancelled', 'disputed')),
    payout_status VARCHAR(20) DEFAULT 'pending' CHECK (payout_status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
    
    -- Dates and timestamps
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    calculation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_date TIMESTAMP WITH TIME ZONE,
    paid_date TIMESTAMP WITH TIME ZONE,
    
    -- Additional tracking
    commission_engine_version VARCHAR(20) DEFAULT '1.0',
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints with ON DELETE RESTRICT for data integrity
    CONSTRAINT fk_partner_commissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_partner_commissions_level FOREIGN KEY (beneficiary_partner_level_id) REFERENCES partner_levels(id) ON DELETE RESTRICT,
    
    -- Business logic constraints
    CONSTRAINT check_commission_amounts_positive CHECK (
      transaction_amount > 0 AND commission_amount >= 0
    ),
    CONSTRAINT check_commission_percentage_valid CHECK (
      commission_percentage >= 0 AND commission_percentage <= 1
    ),
    CONSTRAINT check_levels_positive CHECK (
      commission_level > 0 AND levels_from_source > 0
    ),
    CONSTRAINT check_calculation_before_approval CHECK (
      approved_date IS NULL OR approved_date >= calculation_date
    ),
    CONSTRAINT check_approval_before_payment CHECK (
      paid_date IS NULL OR (approved_date IS NOT NULL AND paid_date >= approved_date)
    ),
    
    -- Unique constraint to prevent duplicate commission calculations
    CONSTRAINT unique_commission_per_transaction_beneficiary UNIQUE (tenant_id, transaction_id, beneficiary_partner_id, commission_level),
    CONSTRAINT unique_commission_per_transaction_source UNIQUE (tenant_id, transaction_id, beneficiary_partner_id, levels_from_source)
  );
`;

export const PARTNER_COMMISSIONS_INDEXES_SQL = `
  -- Performance indexes for partner commissions
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_id ON partner_commissions(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_transaction_id ON partner_commissions(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_beneficiary ON partner_commissions(beneficiary_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_source ON partner_commissions(source_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_calculation_status ON partner_commissions(calculation_status);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_payout_status ON partner_commissions(payout_status);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_transaction_date ON partner_commissions(transaction_date);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_calculation_date ON partner_commissions(calculation_date);
  
  -- Critical composite indexes for multi-tenant performance optimization
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_beneficiary ON partner_commissions(tenant_id, beneficiary_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_source ON partner_commissions(tenant_id, source_partner_id);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_payout_status ON partner_commissions(tenant_id, payout_status);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_transaction_date ON partner_commissions(tenant_id, transaction_date);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_transaction_id ON partner_commissions(tenant_id, transaction_id);
  
  -- Additional composite indexes for common query patterns
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_beneficiary_status ON partner_commissions(beneficiary_partner_id, payout_status);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_source_date ON partner_commissions(source_partner_id, transaction_date);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_pending_payouts ON partner_commissions(tenant_id, payout_status, calculation_date) 
    WHERE payout_status = 'pending';
  
  -- Covering indexes for high-performance tenant-scoped queries
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_beneficiary_covering ON partner_commissions(tenant_id, beneficiary_partner_id) 
    INCLUDE (commission_amount, payout_status, transaction_date);
  CREATE INDEX IF NOT EXISTS idx_partner_commissions_tenant_transaction_covering ON partner_commissions(tenant_id, transaction_id) 
    INCLUDE (beneficiary_partner_id, source_partner_id, commission_amount);
`;

export const PARTNER_COMMISSIONS_TRIGGERS_SQL = `
  -- Security validation function for cross-tenant reference prevention
  CREATE OR REPLACE FUNCTION validate_partner_commissions_tenant_references()
  RETURNS TRIGGER AS $$
  DECLARE
    beneficiary_tenant_id UUID;
    source_tenant_id UUID;
    level_tenant_id UUID;
  BEGIN
    -- Validate beneficiary partner exists and belongs to same tenant
    SELECT tenant_id INTO beneficiary_tenant_id
    FROM partners 
    WHERE id = NEW.beneficiary_partner_id;
    
    IF beneficiary_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Beneficiary partner ID % does not exist', NEW.beneficiary_partner_id;
    END IF;
    
    IF beneficiary_tenant_id != NEW.tenant_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Beneficiary partner % belongs to tenant % but commission is for tenant %', 
        NEW.beneficiary_partner_id, beneficiary_tenant_id, NEW.tenant_id;
    END IF;
    
    -- Validate source partner exists and belongs to same tenant  
    SELECT tenant_id INTO source_tenant_id
    FROM partners 
    WHERE id = NEW.source_partner_id;
    
    IF source_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Source partner ID % does not exist', NEW.source_partner_id;
    END IF;
    
    IF source_tenant_id != NEW.tenant_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Source partner % belongs to tenant % but commission is for tenant %', 
        NEW.source_partner_id, source_tenant_id, NEW.tenant_id;
    END IF;
    
    -- Validate partner level exists and belongs to same tenant
    SELECT tenant_id INTO level_tenant_id
    FROM partner_levels 
    WHERE id = NEW.beneficiary_partner_level_id;
    
    IF level_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Partner level ID % does not exist', NEW.beneficiary_partner_level_id;
    END IF;
    
    IF level_tenant_id != NEW.tenant_id THEN
      RAISE EXCEPTION 'SECURITY VIOLATION: Partner level % belongs to tenant % but commission is for tenant %', 
        NEW.beneficiary_partner_level_id, level_tenant_id, NEW.tenant_id;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  -- Create security validation trigger for INSERT
  DROP TRIGGER IF EXISTS trigger_validate_partner_commissions_tenant_refs_insert ON partner_commissions;
  CREATE TRIGGER trigger_validate_partner_commissions_tenant_refs_insert
    BEFORE INSERT ON partner_commissions
    FOR EACH ROW
    EXECUTE FUNCTION validate_partner_commissions_tenant_references();

  -- Create security validation trigger for UPDATE
  DROP TRIGGER IF EXISTS trigger_validate_partner_commissions_tenant_refs_update ON partner_commissions;
  CREATE TRIGGER trigger_validate_partner_commissions_tenant_refs_update
    BEFORE UPDATE ON partner_commissions
    FOR EACH ROW
    EXECUTE FUNCTION validate_partner_commissions_tenant_references();

  -- Standard updated_at trigger
  DROP TRIGGER IF EXISTS trigger_update_partner_commissions_updated_at ON partner_commissions;
  CREATE TRIGGER trigger_update_partner_commissions_updated_at
    BEFORE UPDATE ON partner_commissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

// Additional business logic triggers
export const PARTNER_COMMISSION_RATE_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION validate_partner_commission_rate()
  RETURNS TRIGGER AS $$
  DECLARE
    level_min_rate DECIMAL(5,4);
    level_max_rate DECIMAL(5,4);
  BEGIN
    -- Get the commission rate limits for the partner's level
    SELECT min_commission_rate, max_commission_rate
    INTO level_min_rate, level_max_rate
    FROM partner_levels
    WHERE id = NEW.partner_level_id;
    
    -- If commission rate is not explicitly set, use the default from the level
    IF NEW.commission_rate IS NULL THEN
      SELECT default_commission_rate INTO NEW.commission_rate
      FROM partner_levels
      WHERE id = NEW.partner_level_id;
    END IF;
    
    -- Validate commission rate is within level bounds
    IF NEW.commission_rate < level_min_rate OR NEW.commission_rate > level_max_rate THEN
      RAISE EXCEPTION 'Commission rate %.4f is outside the allowed range [%.4f, %.4f] for this partner level',
        NEW.commission_rate, level_min_rate, level_max_rate;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_validate_partner_commission_rate ON partners;
  CREATE TRIGGER trigger_validate_partner_commission_rate
    BEFORE INSERT OR UPDATE ON partners
    FOR EACH ROW
    EXECUTE FUNCTION validate_partner_commission_rate();
`;

// Aggregate table creation SQL
export const ALL_PARTNER_TABLES_SQL = [
  PARTNER_LEVELS_TABLE_SQL,
  PARTNERS_TABLE_SQL,
  PARTNER_RELATIONS_TABLE_SQL,
  PARTNER_APPLICATIONS_TABLE_SQL,
  PARTNER_COMMISSIONS_TABLE_SQL
].join('\n\n');

export const ALL_PARTNER_INDEXES_SQL = [
  PARTNER_LEVELS_INDEXES_SQL,
  PARTNERS_INDEXES_SQL,
  PARTNER_RELATIONS_INDEXES_SQL,
  PARTNER_APPLICATIONS_INDEXES_SQL,
  PARTNER_COMMISSIONS_INDEXES_SQL
].join('\n\n');

export const ALL_PARTNER_TRIGGERS_SQL = [
  UPDATED_AT_TRIGGER_FUNCTION_SQL,
  PARTNER_LEVELS_TRIGGERS_SQL,
  PARTNERS_TRIGGERS_SQL,
  PARTNER_RELATIONS_TRIGGERS_SQL,
  PARTNER_APPLICATIONS_TRIGGERS_SQL,
  PARTNER_COMMISSIONS_TRIGGERS_SQL,
  PARTNER_COMMISSION_RATE_TRIGGER_SQL
].join('\n\n');

/**
 * Inventory Management Database Schema
 * 
 * This schema extends the POS system with comprehensive inventory management:
 * - Product Catalog with variants and categorization
 * - Multi-location inventory tracking
 * - Supplier management and purchase orders
 * - Stock movements and audit trails
 * - Automated reordering and alerts
 * - Serialized and lot tracking
 */

// Enhanced Product Categories table
export const PRODUCT_CATEGORIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    category_code VARCHAR(50) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    parent_category_id UUID,
    description TEXT,
    tax_rate DECIMAL(5,4) DEFAULT 0.0000,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_product_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_categories_parent FOREIGN KEY (parent_category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_category_code_per_tenant UNIQUE (tenant_id, category_code),
    CONSTRAINT unique_category_name_per_tenant UNIQUE (tenant_id, category_name),
    
    -- Data integrity constraints
    CONSTRAINT check_no_self_parent CHECK (id != parent_category_id),
    CONSTRAINT check_tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 1)
  );
`;

// Suppliers table for supplier management
export const SUPPLIERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    supplier_code VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    tax_id VARCHAR(50),
    payment_terms VARCHAR(100),
    credit_limit DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_supplier_code_per_tenant UNIQUE (tenant_id, supplier_code),
    CONSTRAINT unique_supplier_name_per_tenant UNIQUE (tenant_id, supplier_name),
    
    -- Data integrity constraints
    CONSTRAINT check_credit_limit_non_negative CHECK (credit_limit >= 0)
  );
`;

// Locations table for multi-location support
export const LOCATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    location_code VARCHAR(50) NOT NULL,
    location_name VARCHAR(200) NOT NULL,
    location_type VARCHAR(50) DEFAULT 'store' CHECK (location_type IN ('store', 'warehouse', 'outlet', 'online')),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    manager_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_locations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_location_code_per_tenant UNIQUE (tenant_id, location_code),
    CONSTRAINT unique_location_name_per_tenant UNIQUE (tenant_id, location_name)
  );
`;

// Enhanced Products table with full inventory features
export const INVENTORY_PRODUCTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS inventory_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(100),
    category_id UUID,
    supplier_id UUID,
    brand VARCHAR(100),
    unit_of_measure VARCHAR(50) DEFAULT 'each',
    cost_price DECIMAL(15,2) DEFAULT 0,
    selling_price DECIMAL(15,2) NOT NULL,
    min_stock_level INTEGER DEFAULT 0,
    max_stock_level INTEGER DEFAULT 1000,
    reorder_point INTEGER DEFAULT 10,
    reorder_quantity INTEGER DEFAULT 50,
    track_serial_numbers BOOLEAN DEFAULT false,
    track_lots BOOLEAN DEFAULT false,
    description TEXT,
    image_url VARCHAR(500),
    weight DECIMAL(10,3),
    dimensions VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    is_taxable BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_inventory_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_inventory_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_product_code_per_tenant UNIQUE (tenant_id, product_code),
    CONSTRAINT unique_sku_per_tenant UNIQUE (tenant_id, sku),
    CONSTRAINT unique_barcode_per_tenant UNIQUE (tenant_id, barcode),
    
    -- Data integrity constraints
    CONSTRAINT check_prices_non_negative CHECK (cost_price >= 0 AND selling_price >= 0),
    CONSTRAINT check_stock_levels_valid CHECK (
      min_stock_level >= 0 AND 
      max_stock_level >= min_stock_level AND
      reorder_point >= 0 AND 
      reorder_quantity > 0
    ),
    CONSTRAINT check_weight_non_negative CHECK (weight IS NULL OR weight >= 0)
  );
`;

// Product Variants table for size, color, style variations
export const PRODUCT_VARIANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_code VARCHAR(100) NOT NULL,
    variant_name VARCHAR(200) NOT NULL,
    sku VARCHAR(100),
    barcode VARCHAR(100),
    variant_type VARCHAR(50) NOT NULL CHECK (variant_type IN ('size', 'color', 'style', 'material', 'flavor', 'other')),
    variant_value VARCHAR(100) NOT NULL,
    cost_price DECIMAL(15,2) DEFAULT 0,
    selling_price DECIMAL(15,2),
    weight DECIMAL(10,3),
    dimensions VARCHAR(100),
    image_url VARCHAR(500),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_product_variants_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_variant_code_per_tenant UNIQUE (tenant_id, variant_code),
    CONSTRAINT unique_variant_sku_per_tenant UNIQUE (tenant_id, sku),
    CONSTRAINT unique_variant_barcode_per_tenant UNIQUE (tenant_id, barcode),
    CONSTRAINT unique_variant_type_value_per_product UNIQUE (tenant_id, product_id, variant_type, variant_value),
    
    -- Data integrity constraints
    CONSTRAINT check_variant_prices_non_negative CHECK (cost_price >= 0 AND (selling_price IS NULL OR selling_price >= 0)),
    CONSTRAINT check_variant_weight_non_negative CHECK (weight IS NULL OR weight >= 0)
  );
`;

// Stock levels table for multi-location inventory tracking
export const STOCK_LEVELS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER DEFAULT 0,
    available_stock INTEGER GENERATED ALWAYS AS (current_stock - reserved_stock) STORED,
    cost_per_unit DECIMAL(15,2) DEFAULT 0,
    last_counted_at TIMESTAMP WITH TIME ZONE,
    last_movement_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_levels_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_levels_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    
    -- Unique constraints - one stock level per product/variant/location combination
    CONSTRAINT unique_stock_per_product_location UNIQUE (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id),
    
    -- Data integrity constraints
    CONSTRAINT check_stock_levels_non_negative CHECK (
      current_stock >= 0 AND 
      reserved_stock >= 0 AND
      reserved_stock <= current_stock
    ),
    CONSTRAINT check_cost_per_unit_non_negative CHECK (cost_per_unit >= 0)
  );
`;

// Purchase Orders table
export const PURCHASE_ORDERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    po_number VARCHAR(100) NOT NULL,
    supplier_id UUID NOT NULL,
    location_id UUID NOT NULL,
    order_date DATE DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'partial', 'completed', 'cancelled')),
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    shipping_cost DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    payment_terms VARCHAR(100),
    notes TEXT,
    created_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_purchase_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    CONSTRAINT fk_purchase_orders_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_po_number_per_tenant UNIQUE (tenant_id, po_number),
    
    -- Data integrity constraints
    CONSTRAINT check_po_amounts_non_negative CHECK (
      subtotal >= 0 AND tax_amount >= 0 AND shipping_cost >= 0 AND 
      discount_amount >= 0 AND total_amount >= 0
    ),
    CONSTRAINT check_delivery_dates CHECK (
      expected_delivery_date IS NULL OR expected_delivery_date >= order_date
    ),
    CONSTRAINT check_approval_consistency CHECK (
      (approved_by IS NULL AND approved_at IS NULL) OR
      (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
  );
`;

// Purchase Order Items table
export const PURCHASE_ORDER_ITEMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    purchase_order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_cost DECIMAL(15,2) NOT NULL,
    line_total DECIMAL(15,2) GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_po_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_po_items_purchase_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_po_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
    
    -- Unique constraints - one line item per product/variant per PO
    CONSTRAINT unique_po_item_per_product_variant UNIQUE (tenant_id, purchase_order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID)),
    
    -- Data integrity constraints
    CONSTRAINT check_po_item_quantities_positive CHECK (
      quantity_ordered > 0 AND 
      quantity_received >= 0 AND
      quantity_received <= quantity_ordered
    ),
    CONSTRAINT check_po_item_unit_cost_positive CHECK (unit_cost > 0)
  );
`;

// Stock Movements table for tracking all inventory changes
export const STOCK_MOVEMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment', 'audit')),
    movement_reason VARCHAR(50) NOT NULL CHECK (movement_reason IN (
      'purchase', 'sale', 'return', 'transfer_in', 'transfer_out', 
      'adjustment_positive', 'adjustment_negative', 'audit_correction', 
      'damaged', 'expired', 'theft', 'promotion', 'sample'
    )),
    quantity_change INTEGER NOT NULL,
    cost_per_unit DECIMAL(15,2) DEFAULT 0,
    reference_type VARCHAR(50),
    reference_id UUID,
    batch_id UUID,
    serial_number VARCHAR(100),
    expiry_date DATE,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_movements_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_stock_movements_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_stock_movements_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Data integrity constraints
    CONSTRAINT check_quantity_change_not_zero CHECK (quantity_change != 0),
    CONSTRAINT check_cost_per_unit_non_negative CHECK (cost_per_unit >= 0),
    CONSTRAINT check_movement_direction CHECK (
      (movement_type = 'in' AND quantity_change > 0) OR
      (movement_type = 'out' AND quantity_change < 0) OR
      (movement_type IN ('transfer', 'adjustment', 'audit'))
    )
  );
`;

// Stock Audits table for audit functionality
export const STOCK_AUDITS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS stock_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    audit_number VARCHAR(100) NOT NULL,
    location_id UUID NOT NULL,
    audit_type VARCHAR(20) DEFAULT 'full' CHECK (audit_type IN ('full', 'partial', 'cycle')),
    status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    planned_date DATE DEFAULT CURRENT_DATE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_items_planned INTEGER DEFAULT 0,
    total_items_counted INTEGER DEFAULT 0,
    discrepancy_count INTEGER DEFAULT 0,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_stock_audits_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_audits_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_audit_number_per_tenant UNIQUE (tenant_id, audit_number),
    
    -- Data integrity constraints
    CONSTRAINT check_audit_counts_non_negative CHECK (
      total_items_planned >= 0 AND total_items_counted >= 0 AND discrepancy_count >= 0
    ),
    CONSTRAINT check_audit_date_sequence CHECK (
      started_at IS NULL OR started_at >= planned_date::timestamp
    )
  );
`;

// Product Serial Numbers table for individual item tracking
export const PRODUCT_SERIAL_NUMBERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS product_serial_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    serial_number VARCHAR(100) NOT NULL,
    batch_number VARCHAR(100),
    manufacture_date DATE,
    expiry_date DATE,
    cost_price DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'damaged', 'expired', 'returned')),
    purchase_order_id UUID,
    transaction_id VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_serial_numbers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_serial_numbers_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_serial_numbers_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_serial_number_per_tenant UNIQUE (tenant_id, serial_number),
    
    -- Data integrity constraints
    CONSTRAINT check_serial_cost_non_negative CHECK (cost_price >= 0),
    CONSTRAINT check_expiry_after_manufacture CHECK (
      expiry_date IS NULL OR manufacture_date IS NULL OR expiry_date > manufacture_date
    )
  );
`;

// Low Stock Alerts table for alert configuration
export const LOW_STOCK_ALERTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS low_stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    location_id UUID NOT NULL,
    alert_threshold INTEGER NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    last_alerted_at TIMESTAMP WITH TIME ZONE,
    alert_frequency_hours INTEGER DEFAULT 24,
    notification_emails TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_low_stock_alerts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_low_stock_alerts_product FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_low_stock_alerts_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_low_stock_alerts_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    
    -- Unique constraints - one alert per product/variant/location combination
    CONSTRAINT unique_alert_per_product_location UNIQUE (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id),
    
    -- Data integrity constraints
    CONSTRAINT check_alert_threshold_positive CHECK (alert_threshold > 0),
    CONSTRAINT check_current_stock_non_negative CHECK (current_stock >= 0),
    CONSTRAINT check_alert_frequency_positive CHECK (alert_frequency_hours > 0)
  );
`;

// Indexes for performance optimization

export const PRODUCT_CATEGORIES_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_id ON product_categories(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_category_id);
  CREATE INDEX IF NOT EXISTS idx_product_categories_active ON product_categories(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_product_categories_sort_order ON product_categories(tenant_id, sort_order);
`;

export const SUPPLIERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(tenant_id, supplier_name);
  CREATE INDEX IF NOT EXISTS idx_suppliers_email ON suppliers(email);
`;

export const LOCATIONS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_locations_tenant_id ON locations(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(tenant_id, location_type);
  CREATE INDEX IF NOT EXISTS idx_locations_default ON locations(tenant_id, is_default);
`;

export const INVENTORY_PRODUCTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_inventory_products_tenant_id ON inventory_products(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_category ON inventory_products(category_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_supplier ON inventory_products(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_active ON inventory_products(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_brand ON inventory_products(tenant_id, brand);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_barcode ON inventory_products(barcode);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_sku ON inventory_products(sku);
  CREATE INDEX IF NOT EXISTS idx_inventory_products_name_search ON inventory_products USING GIN (to_tsvector('english', product_name));
`;

export const PRODUCT_VARIANTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_id ON product_variants(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
  CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_product_variants_type ON product_variants(tenant_id, variant_type);
  CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode);
  CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
`;

export const STOCK_LEVELS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_stock_levels_tenant_id ON stock_levels(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_product ON stock_levels(product_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_variant ON stock_levels(variant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_location ON stock_levels(location_id);
  CREATE INDEX IF NOT EXISTS idx_stock_levels_low_stock ON stock_levels(tenant_id, current_stock) WHERE current_stock <= 10;
  CREATE INDEX IF NOT EXISTS idx_stock_levels_product_location ON stock_levels(tenant_id, product_id, location_id);
`;

export const PURCHASE_ORDERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_id ON purchase_orders(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_location ON purchase_orders(location_id);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);
  CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(po_number);
`;

export const PURCHASE_ORDER_ITEMS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_po_items_tenant_id ON purchase_order_items(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_po_items_purchase_order ON purchase_order_items(purchase_order_id);
  CREATE INDEX IF NOT EXISTS idx_po_items_product ON purchase_order_items(product_id);
  CREATE INDEX IF NOT EXISTS idx_po_items_variant ON purchase_order_items(variant_id);
`;

export const STOCK_MOVEMENTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_id ON stock_movements(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_location ON stock_movements(location_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(tenant_id, movement_type);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_reason ON stock_movements(tenant_id, movement_reason);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
  CREATE INDEX IF NOT EXISTS idx_stock_movements_serial ON stock_movements(serial_number);
`;

export const STOCK_AUDITS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_stock_audits_tenant_id ON stock_audits(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_stock_audits_location ON stock_audits(location_id);
  CREATE INDEX IF NOT EXISTS idx_stock_audits_status ON stock_audits(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_stock_audits_date ON stock_audits(planned_date);
  CREATE INDEX IF NOT EXISTS idx_stock_audits_number ON stock_audits(audit_number);
`;

export const PRODUCT_SERIAL_NUMBERS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_tenant_id ON product_serial_numbers(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_product ON product_serial_numbers(product_id);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_variant ON product_serial_numbers(variant_id);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_location ON product_serial_numbers(location_id);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_status ON product_serial_numbers(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_batch ON product_serial_numbers(batch_number);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_expiry ON product_serial_numbers(expiry_date);
  CREATE INDEX IF NOT EXISTS idx_serial_numbers_po ON product_serial_numbers(purchase_order_id);
`;

export const LOW_STOCK_ALERTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_tenant_id ON low_stock_alerts(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_product ON low_stock_alerts(product_id);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_variant ON low_stock_alerts(variant_id);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_location ON low_stock_alerts(location_id);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_active ON low_stock_alerts(tenant_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_low_stock_alerts_triggered ON low_stock_alerts(tenant_id, is_active) WHERE current_stock <= alert_threshold;
`;

// Triggers for automatic updated_at timestamp updates

export const PRODUCT_CATEGORIES_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_product_categories_updated_at ON product_categories;
  CREATE TRIGGER trigger_update_product_categories_updated_at
    BEFORE UPDATE ON product_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const SUPPLIERS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_suppliers_updated_at ON suppliers;
  CREATE TRIGGER trigger_update_suppliers_updated_at
    BEFORE UPDATE ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const LOCATIONS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_locations_updated_at ON locations;
  CREATE TRIGGER trigger_update_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const INVENTORY_PRODUCTS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_inventory_products_updated_at ON inventory_products;
  CREATE TRIGGER trigger_update_inventory_products_updated_at
    BEFORE UPDATE ON inventory_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PRODUCT_VARIANTS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_product_variants_updated_at ON product_variants;
  CREATE TRIGGER trigger_update_product_variants_updated_at
    BEFORE UPDATE ON product_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const STOCK_LEVELS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_stock_levels_updated_at ON stock_levels;
  CREATE TRIGGER trigger_update_stock_levels_updated_at
    BEFORE UPDATE ON stock_levels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PURCHASE_ORDERS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_purchase_orders_updated_at ON purchase_orders;
  CREATE TRIGGER trigger_update_purchase_orders_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PURCHASE_ORDER_ITEMS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_purchase_order_items_updated_at ON purchase_order_items;
  CREATE TRIGGER trigger_update_purchase_order_items_updated_at
    BEFORE UPDATE ON purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const STOCK_AUDITS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_stock_audits_updated_at ON stock_audits;
  CREATE TRIGGER trigger_update_stock_audits_updated_at
    BEFORE UPDATE ON stock_audits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const PRODUCT_SERIAL_NUMBERS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_product_serial_numbers_updated_at ON product_serial_numbers;
  CREATE TRIGGER trigger_update_product_serial_numbers_updated_at
    BEFORE UPDATE ON product_serial_numbers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

export const LOW_STOCK_ALERTS_TRIGGERS_SQL = `
  DROP TRIGGER IF EXISTS trigger_update_low_stock_alerts_updated_at ON low_stock_alerts;
  CREATE TRIGGER trigger_update_low_stock_alerts_updated_at
    BEFORE UPDATE ON low_stock_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

// Business logic triggers for inventory management

// Concurrency-safe stock movement trigger with row-level locking
export const STOCK_MOVEMENT_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION update_stock_levels_on_movement()
  RETURNS TRIGGER AS $$
  DECLARE
    stock_record RECORD;
    current_stock_val INTEGER;
    alert_record RECORD;
  BEGIN
    -- Use row-level locking to prevent concurrent updates
    SELECT id, current_stock INTO stock_record
    FROM stock_levels
    WHERE tenant_id = NEW.tenant_id
      AND product_id = NEW.product_id
      AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
      AND location_id = NEW.location_id
    FOR UPDATE;
    
    IF FOUND THEN
      -- Calculate new stock level and prevent negative stock
      current_stock_val := stock_record.current_stock + NEW.quantity_change;
      
      -- Prevent negative stock unless it's an adjustment or audit movement
      IF current_stock_val < 0 AND NEW.movement_type NOT IN ('adjustment', 'audit', 'loss') THEN
        RAISE EXCEPTION 'STOCK_INSUFFICIENT: Cannot reduce stock below zero. Current: %, Requested change: %, Product ID: %', 
          stock_record.current_stock, NEW.quantity_change, NEW.product_id;
      END IF;
      
      -- Update existing stock level with atomic operation
      UPDATE stock_levels
      SET current_stock = GREATEST(0, current_stock_val),
          last_movement_at = NEW.created_at,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = stock_record.id;
      
      current_stock_val := GREATEST(0, current_stock_val);
    ELSE
      -- Create new stock level record if it doesn't exist (UPSERT pattern)
      current_stock_val := GREATEST(0, NEW.quantity_change);
      
      INSERT INTO stock_levels (
        tenant_id, product_id, variant_id, location_id,
        current_stock, cost_per_unit, last_movement_at
      ) VALUES (
        NEW.tenant_id, NEW.product_id, NEW.variant_id, NEW.location_id,
        current_stock_val, COALESCE(NEW.cost_per_unit, 0.00), NEW.created_at
      )
      ON CONFLICT (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id)
      DO UPDATE SET
        current_stock = GREATEST(0, stock_levels.current_stock + NEW.quantity_change),
        last_movement_at = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE (stock_levels.current_stock + NEW.quantity_change) >= 0 OR NEW.movement_type IN ('adjustment', 'audit', 'loss');
      
      -- Check if the upsert succeeded or failed due to negative stock constraint
      IF NOT FOUND THEN
        -- Get current stock for error message
        SELECT current_stock INTO current_stock_val
        FROM stock_levels
        WHERE tenant_id = NEW.tenant_id
          AND product_id = NEW.product_id
          AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
          AND location_id = NEW.location_id;
        
        -- Throw appropriate error if upsert was blocked by negative stock prevention
        IF current_stock_val + NEW.quantity_change < 0 AND NEW.movement_type NOT IN ('adjustment', 'audit', 'loss') THEN
          RAISE EXCEPTION 'STOCK_INSUFFICIENT: Cannot reduce stock below zero in concurrent operation. Current: %, Requested change: %, Product ID: %', 
            current_stock_val, NEW.quantity_change, NEW.product_id;
        END IF;
      END IF;
      
      -- Set current_stock_val for alert processing
      SELECT current_stock INTO current_stock_val
      FROM stock_levels
      WHERE tenant_id = NEW.tenant_id
        AND product_id = NEW.product_id
        AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
        AND location_id = NEW.location_id;
    END IF;
    
    -- Update low stock alerts with row-level locking
    SELECT id, alert_threshold, is_active INTO alert_record
    FROM low_stock_alerts
    WHERE tenant_id = NEW.tenant_id
      AND product_id = NEW.product_id
      AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
      AND location_id = NEW.location_id
    FOR UPDATE;
    
    IF FOUND THEN
      UPDATE low_stock_alerts
      SET current_stock = current_stock_val,
          last_alerted_at = CASE 
            WHEN current_stock_val <= alert_threshold AND is_active = true 
            THEN CURRENT_TIMESTAMP 
            ELSE last_alerted_at 
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = alert_record.id;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_update_stock_on_movement ON stock_movements;
  CREATE TRIGGER trigger_update_stock_on_movement
    AFTER INSERT ON stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_levels_on_movement();
`;

// Negative stock prevention trigger with consistent movement type policy
export const PREVENT_NEGATIVE_STOCK_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION prevent_negative_stock()
  RETURNS TRIGGER AS $$
  DECLARE
    latest_movement_type VARCHAR(20);
  BEGIN
    -- Only prevent negative stock during UPDATE operations
    IF NEW.current_stock < 0 AND TG_OP = 'UPDATE' THEN
      -- Get the movement type from the most recent stock movement for this product/location
      SELECT movement_type INTO latest_movement_type
      FROM stock_movements
      WHERE tenant_id = NEW.tenant_id
        AND product_id = NEW.product_id
        AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
        AND location_id = NEW.location_id
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- Allow negative stock only for specific administrative movement types
      -- This ensures consistency with the stock movement trigger policy
      IF latest_movement_type IS NULL OR latest_movement_type NOT IN ('adjustment', 'audit', 'loss') THEN
        RAISE EXCEPTION 'NEGATIVE_STOCK_PREVENTED: Stock cannot go below zero. Current attempt: %, Product ID: %, Movement type: %', 
          NEW.current_stock, NEW.product_id, COALESCE(latest_movement_type, 'unknown');
      END IF;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_prevent_negative_stock ON stock_levels;
  CREATE TRIGGER trigger_prevent_negative_stock
    BEFORE UPDATE ON stock_levels
    FOR EACH ROW
    EXECUTE FUNCTION prevent_negative_stock();
`;

// Purchase order status transition validation trigger
export const PO_STATUS_VALIDATION_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION validate_po_status_transitions()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Validate status transitions are logical
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
      -- Define valid status transitions
      CASE OLD.status
        WHEN 'draft' THEN
          IF NEW.status NOT IN ('pending', 'cancelled') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'pending' THEN
          IF NEW.status NOT IN ('approved', 'cancelled') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'approved' THEN
          IF NEW.status NOT IN ('shipped', 'cancelled') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'shipped' THEN
          IF NEW.status NOT IN ('received', 'partially_received') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'partially_received' THEN
          IF NEW.status NOT IN ('received', 'shipped') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'received' THEN
          IF NEW.status NOT IN ('completed') THEN
            RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from % to %', OLD.status, NEW.status;
          END IF;
        WHEN 'cancelled' THEN
          RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from cancelled to %', NEW.status;
        WHEN 'completed' THEN
          RAISE EXCEPTION 'INVALID_PO_TRANSITION: Cannot change status from completed to %', NEW.status;
        ELSE
          RAISE EXCEPTION 'INVALID_PO_STATUS: Unknown status %', OLD.status;
      END CASE;
      
      -- Set completion date when status becomes completed
      IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_date = CURRENT_TIMESTAMP;
      END IF;
      
      -- Set received date when status becomes received
      IF NEW.status = 'received' AND OLD.status != 'received' THEN
        NEW.received_date = CURRENT_TIMESTAMP;
      END IF;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_validate_po_status ON purchase_orders;
  CREATE TRIGGER trigger_validate_po_status
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION validate_po_status_transitions();
`;

// Automatic low stock alert trigger
export const LOW_STOCK_ALERT_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION manage_low_stock_alerts()
  RETURNS TRIGGER AS $$
  DECLARE
    alert_exists BOOLEAN := false;
    should_alert BOOLEAN := false;
  BEGIN
    -- Only process when stock level changes
    IF TG_OP = 'UPDATE' AND OLD.current_stock = NEW.current_stock THEN
      RETURN NEW;
    END IF;
    
    -- Check if alert exists for this product/location combination
    SELECT EXISTS(
      SELECT 1 FROM low_stock_alerts 
      WHERE tenant_id = NEW.tenant_id
        AND product_id = NEW.product_id
        AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
        AND location_id = NEW.location_id
    ) INTO alert_exists;
    
    -- Get product details to determine alert threshold
    WITH product_info AS (
      SELECT 
        ip.product_name,
        ip.minimum_stock_level,
        COALESCE(pv.variant_name, '') as variant_name
      FROM inventory_products ip
      LEFT JOIN product_variants pv ON pv.id = NEW.variant_id
      WHERE ip.id = NEW.product_id
    )
    SELECT NEW.current_stock <= COALESCE(pi.minimum_stock_level, 10) INTO should_alert
    FROM product_info pi;
    
    IF should_alert AND NOT alert_exists THEN
      -- Create new low stock alert
      INSERT INTO low_stock_alerts (
        tenant_id, product_id, variant_id, location_id,
        alert_threshold, current_stock, is_active,
        last_alerted_at, alert_frequency_hours
      )
      SELECT 
        NEW.tenant_id, NEW.product_id, NEW.variant_id, NEW.location_id,
        COALESCE(ip.minimum_stock_level, 10), NEW.current_stock, true,
        CURRENT_TIMESTAMP, 24
      FROM inventory_products ip
      WHERE ip.id = NEW.product_id
      ON CONFLICT (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id)
      DO UPDATE SET
        current_stock = NEW.current_stock,
        is_active = true,
        last_alerted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP;
        
    ELSIF alert_exists THEN
      -- Update existing alert
      UPDATE low_stock_alerts
      SET current_stock = NEW.current_stock,
          is_active = should_alert,
          last_alerted_at = CASE 
            WHEN should_alert AND is_active = false THEN CURRENT_TIMESTAMP
            WHEN should_alert THEN last_alerted_at
            ELSE last_alerted_at
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = NEW.tenant_id
        AND product_id = NEW.product_id
        AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL))
        AND location_id = NEW.location_id;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_manage_low_stock_alerts ON stock_levels;
  CREATE TRIGGER trigger_manage_low_stock_alerts
    AFTER INSERT OR UPDATE ON stock_levels
    FOR EACH ROW
    EXECUTE FUNCTION manage_low_stock_alerts();
`;

// Purchase order receipt stock adjustment trigger
export const PO_RECEIPT_STOCK_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION update_stock_on_po_receipt()
  RETURNS TRIGGER AS $$
  DECLARE
    po_record RECORD;
    item_record RECORD;
  BEGIN
    -- Only process when PO status changes to received or partially_received
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('received', 'partially_received') THEN
      
      SELECT tenant_id, location_id INTO po_record
      FROM purchase_orders
      WHERE id = NEW.id;
      
      -- Process all items in the purchase order
      FOR item_record IN 
        SELECT product_id, variant_id, quantity_ordered, quantity_received, cost_per_unit
        FROM purchase_order_items
        WHERE purchase_order_id = NEW.id AND quantity_received > 0
      LOOP
        -- Create stock movement for received items
        INSERT INTO stock_movements (
          tenant_id, product_id, variant_id, location_id,
          movement_type, movement_reason, quantity_change,
          cost_per_unit, reference_type, reference_id,
          notes, created_at
        ) VALUES (
          po_record.tenant_id, item_record.product_id, item_record.variant_id, po_record.location_id,
          'receipt', 'purchase_order_receipt', item_record.quantity_received,
          item_record.cost_per_unit, 'purchase_order', NEW.id,
          'Automatic stock receipt from PO #' || NEW.po_number, CURRENT_TIMESTAMP
        );
      END LOOP;
    END IF;
    
    RETURN NEW;
  END;
  $$ language 'plpgsql';

  DROP TRIGGER IF EXISTS trigger_update_stock_on_po_receipt ON purchase_orders;
  CREATE TRIGGER trigger_update_stock_on_po_receipt
    AFTER UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_on_po_receipt();
`;

// Consolidated SQL exports for inventory management

export const ALL_INVENTORY_TABLES_SQL = [
  TENANTS_TABLE_SQL,
  PRODUCT_CATEGORIES_TABLE_SQL,
  SUPPLIERS_TABLE_SQL,
  LOCATIONS_TABLE_SQL,
  INVENTORY_PRODUCTS_TABLE_SQL,
  PRODUCT_VARIANTS_TABLE_SQL,
  STOCK_LEVELS_TABLE_SQL,
  PURCHASE_ORDERS_TABLE_SQL,
  PURCHASE_ORDER_ITEMS_TABLE_SQL,
  STOCK_MOVEMENTS_TABLE_SQL,
  STOCK_AUDITS_TABLE_SQL,
  PRODUCT_SERIAL_NUMBERS_TABLE_SQL,
  LOW_STOCK_ALERTS_TABLE_SQL
].join('\n\n');

export const ALL_INVENTORY_INDEXES_SQL = [
  PRODUCT_CATEGORIES_INDEXES_SQL,
  SUPPLIERS_INDEXES_SQL,
  LOCATIONS_INDEXES_SQL,
  INVENTORY_PRODUCTS_INDEXES_SQL,
  PRODUCT_VARIANTS_INDEXES_SQL,
  STOCK_LEVELS_INDEXES_SQL,
  PURCHASE_ORDERS_INDEXES_SQL,
  PURCHASE_ORDER_ITEMS_INDEXES_SQL,
  STOCK_MOVEMENTS_INDEXES_SQL,
  STOCK_AUDITS_INDEXES_SQL,
  PRODUCT_SERIAL_NUMBERS_INDEXES_SQL,
  LOW_STOCK_ALERTS_INDEXES_SQL
].join('\n\n');

export const ALL_INVENTORY_TRIGGERS_SQL = [
  UPDATED_AT_TRIGGER_FUNCTION_SQL,
  PRODUCT_CATEGORIES_TRIGGERS_SQL,
  SUPPLIERS_TRIGGERS_SQL,
  LOCATIONS_TRIGGERS_SQL,
  INVENTORY_PRODUCTS_TRIGGERS_SQL,
  PRODUCT_VARIANTS_TRIGGERS_SQL,
  STOCK_LEVELS_TRIGGERS_SQL,
  PURCHASE_ORDERS_TRIGGERS_SQL,
  PURCHASE_ORDER_ITEMS_TRIGGERS_SQL,
  STOCK_AUDITS_TRIGGERS_SQL,
  PRODUCT_SERIAL_NUMBERS_TRIGGERS_SQL,
  LOW_STOCK_ALERTS_TRIGGERS_SQL,
  // Business Logic Triggers for Production-Ready Inventory Management
  STOCK_MOVEMENT_TRIGGER_SQL,
  PREVENT_NEGATIVE_STOCK_TRIGGER_SQL,
  PO_STATUS_VALIDATION_TRIGGER_SQL,
  LOW_STOCK_ALERT_TRIGGER_SQL,
  PO_RECEIPT_STOCK_TRIGGER_SQL
].join('\n\n');

// Comprehensive verification function for inventory business logic
export const VERIFY_INVENTORY_BUSINESS_LOGIC_FUNCTION_SQL = `
  CREATE OR REPLACE FUNCTION verify_inventory_business_logic(
    test_tenant_id UUID DEFAULT gen_random_uuid()
  )
  RETURNS TABLE(
    test_name TEXT,
    status TEXT,
    details TEXT,
    execution_time_ms INTEGER
  ) AS $$
  DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    test_product_id UUID;
    test_variant_id UUID;
    test_location_id UUID;
    test_supplier_id UUID;
    test_category_id UUID;
    test_po_id UUID;
    initial_stock INTEGER;
    updated_stock INTEGER;
    alert_count INTEGER;
    error_caught BOOLEAN;
  BEGIN
    
    -- Test 1: Setup test data
    start_time := clock_timestamp();
    
    -- Create test tenant
    INSERT INTO tenants (id, subdomain, tenant_name) 
    VALUES (test_tenant_id, 'test-inventory-' || extract(epoch from now())::text, 'Test Tenant')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create test category
    INSERT INTO product_categories (id, tenant_id, category_name, is_active)
    VALUES (gen_random_uuid(), test_tenant_id, 'Test Category', true)
    RETURNING id INTO test_category_id;
    
    -- Create test supplier
    INSERT INTO suppliers (id, tenant_id, supplier_name, email, is_active)
    VALUES (gen_random_uuid(), test_tenant_id, 'Test Supplier', 'test@example.com', true)
    RETURNING id INTO test_supplier_id;
    
    -- Create test location
    INSERT INTO locations (id, tenant_id, location_name, location_type, is_active, is_default)
    VALUES (gen_random_uuid(), test_tenant_id, 'Test Warehouse', 'warehouse', true, true)
    RETURNING id INTO test_location_id;
    
    -- Create test product
    INSERT INTO inventory_products (id, tenant_id, product_name, sku, category_id, supplier_id, minimum_stock_level, is_active)
    VALUES (gen_random_uuid(), test_tenant_id, 'Test Product', 'TEST-001', test_category_id, test_supplier_id, 5, true)
    RETURNING id INTO test_product_id;
    
    -- Create test variant
    INSERT INTO product_variants (id, tenant_id, product_id, variant_name, variant_type, sku, is_active)
    VALUES (gen_random_uuid(), test_tenant_id, test_product_id, 'Test Variant', 'size', 'TEST-001-L', true)
    RETURNING id INTO test_variant_id;
    
    end_time := clock_timestamp();
    RETURN QUERY SELECT 
      'Setup test data'::TEXT,
      'PASSED'::TEXT,
      'Created test tenant, category, supplier, location, product, and variant'::TEXT,
      extract(milliseconds from (end_time - start_time))::INTEGER;
    
    -- Test 2: Stock movement creates stock level record
    start_time := clock_timestamp();
    BEGIN
      INSERT INTO stock_movements (
        tenant_id, product_id, variant_id, location_id,
        movement_type, movement_reason, quantity_change, cost_per_unit
      ) VALUES (
        test_tenant_id, test_product_id, test_variant_id, test_location_id,
        'receipt', 'initial_stock', 100, 10.50
      );
      
      SELECT current_stock INTO initial_stock
      FROM stock_levels
      WHERE tenant_id = test_tenant_id 
        AND product_id = test_product_id
        AND variant_id = test_variant_id 
        AND location_id = test_location_id;
      
      IF initial_stock = 100 THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Stock movement trigger'::TEXT,
          'PASSED'::TEXT,
          format('Stock level correctly created with quantity %s', initial_stock)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      ELSE
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Stock movement trigger'::TEXT,
          'FAILED'::TEXT,
          format('Expected stock 100, got %s', COALESCE(initial_stock::TEXT, 'NULL'))::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Stock movement trigger'::TEXT,
          'FAILED'::TEXT,
          format('Exception: %s', SQLERRM)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
    END;
    
    -- Test 3: Low stock alert creation
    start_time := clock_timestamp();
    BEGIN
      -- Reduce stock below minimum threshold (5)
      INSERT INTO stock_movements (
        tenant_id, product_id, variant_id, location_id,
        movement_type, movement_reason, quantity_change, cost_per_unit
      ) VALUES (
        test_tenant_id, test_product_id, test_variant_id, test_location_id,
        'shipment', 'sale', -97, 10.50
      );
      
      SELECT COUNT(*) INTO alert_count
      FROM low_stock_alerts
      WHERE tenant_id = test_tenant_id 
        AND product_id = test_product_id
        AND variant_id = test_variant_id 
        AND location_id = test_location_id
        AND is_active = true;
      
      IF alert_count > 0 THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Low stock alert trigger'::TEXT,
          'PASSED'::TEXT,
          format('Low stock alert created when stock dropped below threshold')::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      ELSE
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Low stock alert trigger'::TEXT,
          'FAILED'::TEXT,
          format('Low stock alert not created')::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Low stock alert trigger'::TEXT,
          'FAILED'::TEXT,
          format('Exception: %s', SQLERRM)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
    END;
    
    -- Test 4: Negative stock prevention
    start_time := clock_timestamp();
    BEGIN
      error_caught := false;
      
      -- Try to reduce stock below zero
      INSERT INTO stock_movements (
        tenant_id, product_id, variant_id, location_id,
        movement_type, movement_reason, quantity_change, cost_per_unit
      ) VALUES (
        test_tenant_id, test_product_id, test_variant_id, test_location_id,
        'shipment', 'sale', -10, 10.50
      );
      
      end_time := clock_timestamp();
      RETURN QUERY SELECT 
        'Negative stock prevention'::TEXT,
        'FAILED'::TEXT,
        'Negative stock was allowed when it should have been prevented'::TEXT,
        extract(milliseconds from (end_time - start_time))::INTEGER;
        
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%STOCK_INSUFFICIENT%' THEN
          error_caught := true;
          end_time := clock_timestamp();
          RETURN QUERY SELECT 
            'Negative stock prevention'::TEXT,
            'PASSED'::TEXT,
            'Correctly prevented negative stock with proper error message'::TEXT,
            extract(milliseconds from (end_time - start_time))::INTEGER;
        ELSE
          end_time := clock_timestamp();
          RETURN QUERY SELECT 
            'Negative stock prevention'::TEXT,
            'FAILED'::TEXT,
            format('Unexpected exception: %s', SQLERRM)::TEXT,
            extract(milliseconds from (end_time - start_time))::INTEGER;
        END IF;
    END;
    
    -- Test 5: Purchase order status transitions
    start_time := clock_timestamp();
    BEGIN
      -- Create purchase order
      INSERT INTO purchase_orders (id, tenant_id, supplier_id, location_id, po_number, status)
      VALUES (gen_random_uuid(), test_tenant_id, test_supplier_id, test_location_id, 'PO-TEST-001', 'draft')
      RETURNING id INTO test_po_id;
      
      -- Valid transition: draft -> pending
      UPDATE purchase_orders SET status = 'pending' WHERE id = test_po_id;
      
      -- Valid transition: pending -> approved
      UPDATE purchase_orders SET status = 'approved' WHERE id = test_po_id;
      
      -- Try invalid transition: approved -> completed (should fail)
      error_caught := false;
      BEGIN
        UPDATE purchase_orders SET status = 'completed' WHERE id = test_po_id;
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLERRM LIKE '%INVALID_PO_TRANSITION%' THEN
            error_caught := true;
          END IF;
      END;
      
      IF error_caught THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'PO status validation'::TEXT,
          'PASSED'::TEXT,
          'Correctly prevented invalid status transition'::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      ELSE
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'PO status validation'::TEXT,
          'FAILED'::TEXT,
          'Invalid status transition was allowed'::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'PO status validation'::TEXT,
          'FAILED'::TEXT,
          format('Exception: %s', SQLERRM)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
    END;
    
    -- Test 6: Concurrency safety test
    start_time := clock_timestamp();
    BEGIN
      -- This would be better tested with actual concurrent connections
      -- For now, we test the UPSERT functionality
      
      -- Try to create duplicate stock level (should use ON CONFLICT)
      INSERT INTO stock_levels (
        tenant_id, product_id, variant_id, location_id,
        current_stock, cost_per_unit
      ) VALUES (
        test_tenant_id, test_product_id, test_variant_id, test_location_id,
        50, 12.00
      )
      ON CONFLICT (tenant_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), location_id)
      DO UPDATE SET current_stock = stock_levels.current_stock + EXCLUDED.current_stock;
      
      SELECT current_stock INTO updated_stock
      FROM stock_levels
      WHERE tenant_id = test_tenant_id 
        AND product_id = test_product_id
        AND variant_id = test_variant_id 
        AND location_id = test_location_id;
      
      -- Should be 3 (from previous test) + 50 = 53
      IF updated_stock = 53 THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Concurrency safety (UPSERT)'::TEXT,
          'PASSED'::TEXT,
          format('UPSERT worked correctly, stock level: %s', updated_stock)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      ELSE
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Concurrency safety (UPSERT)'::TEXT,
          'FAILED'::TEXT,
          format('Expected stock 53, got %s', updated_stock)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT 
          'Concurrency safety (UPSERT)'::TEXT,
          'FAILED'::TEXT,
          format('Exception: %s', SQLERRM)::TEXT,
          extract(milliseconds from (end_time - start_time))::INTEGER;
    END;
    
    -- Cleanup test data
    start_time := clock_timestamp();
    DELETE FROM low_stock_alerts WHERE tenant_id = test_tenant_id;
    DELETE FROM stock_movements WHERE tenant_id = test_tenant_id;
    DELETE FROM stock_levels WHERE tenant_id = test_tenant_id;
    DELETE FROM purchase_order_items WHERE tenant_id = test_tenant_id;
    DELETE FROM purchase_orders WHERE tenant_id = test_tenant_id;
    DELETE FROM product_serial_numbers WHERE tenant_id = test_tenant_id;
    DELETE FROM product_variants WHERE tenant_id = test_tenant_id;
    DELETE FROM inventory_products WHERE tenant_id = test_tenant_id;
    DELETE FROM locations WHERE tenant_id = test_tenant_id;
    DELETE FROM suppliers WHERE tenant_id = test_tenant_id;
    DELETE FROM product_categories WHERE tenant_id = test_tenant_id;
    DELETE FROM tenants WHERE id = test_tenant_id;
    
    end_time := clock_timestamp();
    RETURN QUERY SELECT 
      'Cleanup test data'::TEXT,
      'PASSED'::TEXT,
      'Test data cleaned up successfully'::TEXT,
      extract(milliseconds from (end_time - start_time))::INTEGER;
      
  END;
  $$ language 'plpgsql';
`;

// =======================================================================
// SECURITY AND COMPLIANCE SCHEMAS
// =======================================================================

// Tenant-specific security configuration for PCI compliance
export const TENANT_SECURITY_SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tenant_security_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    -- PCI Compliance Configuration
    pci_compliance_enabled BOOLEAN DEFAULT false,
    pci_compliance_level VARCHAR(20) DEFAULT 'pci_dss_level_4' CHECK (pci_compliance_level IN ('pci_dss_level_1', 'pci_dss_level_2', 'pci_dss_level_3', 'pci_dss_level_4', 'non_compliant')),
    
    -- Encryption Configuration
    data_encryption_enabled BOOLEAN DEFAULT false,
    encryption_algorithm VARCHAR(50) DEFAULT 'aes-256-gcm',
    key_rotation_enabled BOOLEAN DEFAULT false,
    key_rotation_frequency_days INTEGER DEFAULT 90,
    last_key_rotation TIMESTAMP WITH TIME ZONE,
    
    -- Audit Logging Configuration
    audit_logging_enabled BOOLEAN DEFAULT false,
    audit_retention_days INTEGER DEFAULT 365,
    audit_log_encryption BOOLEAN DEFAULT true,
    
    -- Compliance Assessment
    last_assessment_date TIMESTAMP WITH TIME ZONE,
    next_assessment_due TIMESTAMP WITH TIME ZONE,
    compliance_status VARCHAR(20) DEFAULT 'not_assessed' CHECK (compliance_status IN ('compliant', 'non_compliant', 'needs_review', 'not_assessed')),
    
    -- Security Metadata
    security_contact_email VARCHAR(255),
    security_incidents_count INTEGER DEFAULT 0,
    last_incident_date TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    -- Constraints
    CONSTRAINT fk_tenant_security_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT unique_security_settings_per_tenant UNIQUE (tenant_id),
    CONSTRAINT check_rotation_frequency_positive CHECK (key_rotation_frequency_days > 0),
    CONSTRAINT check_retention_days_positive CHECK (audit_retention_days > 0)
  );
`;

// Per-tenant encryption key management with envelope encryption
export const TENANT_ENCRYPTION_KEYS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tenant_encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    -- Key Hierarchy
    key_type VARCHAR(20) NOT NULL CHECK (key_type IN ('dek', 'kek')), -- DEK = Data Encryption Key, KEK = Key Encryption Key
    key_purpose VARCHAR(50) NOT NULL, -- 'payment_data', 'customer_pii', 'transaction_data', etc.
    
    -- Key Material (encrypted for DEKs, reference for KEKs)
    encrypted_key_material TEXT NOT NULL, -- DEK encrypted by KEK, or KEK reference/ID from KMS
    key_derivation_salt BYTEA, -- Salt used for key derivation
    initialization_vector BYTEA, -- IV for key encryption
    auth_tag BYTEA, -- Authentication tag for GCM mode
    
    -- Key Metadata
    key_version INTEGER DEFAULT 1,
    algorithm VARCHAR(50) DEFAULT 'aes-256-gcm',
    key_size_bits INTEGER DEFAULT 256,
    
    -- Key Lifecycle
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'rotated', 'revoked', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    rotated_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    -- Security Tracking
    usage_count BIGINT DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    rotated_by UUID,
    
    -- Constraints
    CONSTRAINT fk_tenant_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT unique_active_key_per_purpose UNIQUE (tenant_id, key_purpose, key_version) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT check_key_size_valid CHECK (key_size_bits IN (128, 192, 256)),
    CONSTRAINT check_expiry_after_creation CHECK (expires_at IS NULL OR expires_at > created_at)
  );
`;

// Tamper-evident audit log with hash chaining for PCI DSS Requirement 10
export const SECURITY_AUDIT_LOGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    -- Audit Event Information
    event_type VARCHAR(100) NOT NULL, -- 'data_encryption', 'key_rotation', 'access_granted', etc.
    event_action VARCHAR(50) NOT NULL, -- 'create', 'read', 'update', 'delete', 'access', 'decrypt'
    event_result VARCHAR(20) NOT NULL CHECK (event_result IN ('success', 'failure', 'error')),
    
    -- Actor Information
    user_id UUID,
    user_role VARCHAR(50),
    user_email VARCHAR(255),
    
    -- Request Context
    ip_address INET NOT NULL,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    
    -- Resource Information
    resource_type VARCHAR(50) NOT NULL, -- 'payment_card', 'transaction', 'encryption_key', 'customer_data'
    resource_id VARCHAR(255),
    
    -- Event Details
    event_details JSONB DEFAULT '{}'::jsonb,
    risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    pci_relevant BOOLEAN DEFAULT false,
    
    -- Tamper Detection
    event_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of event data
    previous_hash VARCHAR(64), -- Hash of previous audit log entry for chain integrity
    hash_chain_position BIGINT NOT NULL, -- Sequential position in hash chain
    
    -- Timestamps
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Immutability (no updates allowed after creation)
    is_immutable BOOLEAN DEFAULT true,
    
    -- Constraints
    CONSTRAINT fk_audit_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT check_hash_chain_position_positive CHECK (hash_chain_position > 0)
  );
  
  -- Create partial index for hash chain integrity verification
  CREATE INDEX IF NOT EXISTS idx_audit_logs_hash_chain ON security_audit_logs(tenant_id, hash_chain_position);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_pci_relevant ON security_audit_logs(tenant_id, pci_relevant, event_timestamp) WHERE pci_relevant = true;
`;

// PCI compliance vulnerability assessments
export const PCI_VULNERABILITY_ASSESSMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS pci_vulnerability_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    -- Assessment Information
    assessment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assessment_type VARCHAR(50) NOT NULL CHECK (assessment_type IN ('automated', 'manual', 'penetration_test', 'compliance_audit')),
    assessor_id UUID,
    
    -- Compliance Status
    overall_compliance_level VARCHAR(20) NOT NULL,
    card_data_exposure_risk VARCHAR(20) NOT NULL,
    total_vulnerabilities INTEGER DEFAULT 0,
    critical_vulnerabilities INTEGER DEFAULT 0,
    high_vulnerabilities INTEGER DEFAULT 0,
    
    -- Assessment Results
    vulnerabilities JSONB DEFAULT '[]'::jsonb,
    compliance_requirements JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    
    -- Follow-up
    next_assessment_due TIMESTAMP WITH TIME ZONE,
    remediation_deadline TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed', 'failed', 'cancelled')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_pci_assessments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT check_vulnerabilities_non_negative CHECK (
      total_vulnerabilities >= 0 AND 
      critical_vulnerabilities >= 0 AND 
      high_vulnerabilities >= 0 AND
      critical_vulnerabilities <= total_vulnerabilities AND
      high_vulnerabilities <= total_vulnerabilities
    )
  );
`;

// =======================================================================
// SECURITY TRIGGERS AND FUNCTIONS
// =======================================================================

// Trigger to prevent modification of immutable audit logs
export const IMMUTABLE_AUDIT_LOG_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Prevent any updates or deletes on audit logs
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Audit logs are immutable and cannot be modified. Log ID: %', OLD.id;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
      -- Only allow deletion for retention policy cleanup by system
      IF current_user != 'postgres' AND current_user != 'system_cleanup' THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Audit logs cannot be deleted manually. Log ID: %', OLD.id;
      END IF;
    END IF;
    
    RETURN COALESCE(OLD, NEW);
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS trigger_immutable_audit_logs ON security_audit_logs;
  CREATE TRIGGER trigger_immutable_audit_logs
    BEFORE UPDATE OR DELETE ON security_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modification();
`;

// Function to calculate hash chain for audit log integrity
export const AUDIT_LOG_HASH_CHAIN_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION calculate_audit_log_hash()
  RETURNS TRIGGER AS $$
  DECLARE
    event_data_text TEXT;
    previous_log_hash VARCHAR(64);
    chain_position BIGINT;
  BEGIN
    -- Get the previous hash and calculate next chain position
    SELECT 
      COALESCE(event_hash, ''),
      COALESCE(MAX(hash_chain_position), 0) + 1
    INTO previous_log_hash, chain_position
    FROM security_audit_logs 
    WHERE tenant_id = NEW.tenant_id
    ORDER BY hash_chain_position DESC
    LIMIT 1;
    
    -- Set chain position
    NEW.hash_chain_position = chain_position;
    NEW.previous_hash = previous_log_hash;
    
    -- Create standardized event data for hashing
    event_data_text = NEW.tenant_id::text || '|' ||
                     NEW.event_type || '|' ||
                     NEW.event_action || '|' ||
                     NEW.event_result || '|' ||
                     COALESCE(NEW.user_id::text, '') || '|' ||
                     NEW.ip_address::text || '|' ||
                     NEW.resource_type || '|' ||
                     COALESCE(NEW.resource_id, '') || '|' ||
                     NEW.event_timestamp::text || '|' ||
                     previous_log_hash || '|' ||
                     chain_position::text;
    
    -- Calculate SHA-256 hash
    NEW.event_hash = encode(digest(event_data_text, 'sha256'), 'hex');
    
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trigger_audit_log_hash_chain ON security_audit_logs;
  CREATE TRIGGER trigger_audit_log_hash_chain
    BEFORE INSERT ON security_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION calculate_audit_log_hash();
`;

// Function to validate tenant encryption key management
export const TENANT_KEY_VALIDATION_TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION validate_tenant_encryption_keys()
  RETURNS TRIGGER AS $$
  DECLARE
    active_key_count INTEGER;
  BEGIN
    -- Ensure only one active key per tenant per purpose
    IF NEW.status = 'active' THEN
      SELECT COUNT(*) INTO active_key_count
      FROM tenant_encryption_keys
      WHERE tenant_id = NEW.tenant_id
        AND key_purpose = NEW.key_purpose
        AND status = 'active'
        AND id != NEW.id;
      
      IF active_key_count > 0 THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Only one active encryption key allowed per tenant per purpose. Tenant: %, Purpose: %', 
          NEW.tenant_id, NEW.key_purpose;
      END IF;
    END IF;
    
    -- Validate key material is not empty
    IF NEW.encrypted_key_material IS NULL OR length(NEW.encrypted_key_material) < 32 THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Encryption key material cannot be empty or too short. Minimum 32 characters required.';
    END IF;
    
    -- Auto-set expiry for DEKs if not provided
    IF NEW.key_type = 'dek' AND NEW.expires_at IS NULL THEN
      NEW.expires_at = NEW.created_at + INTERVAL '90 days';
    END IF;
    
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trigger_validate_tenant_keys ON tenant_encryption_keys;
  CREATE TRIGGER trigger_validate_tenant_keys
    BEFORE INSERT OR UPDATE ON tenant_encryption_keys
    FOR EACH ROW
    EXECUTE FUNCTION validate_tenant_encryption_keys();
`;

// ==============================================================================
// SPLIT PAYMENT CELL (CC-002-2) DATABASE SCHEMA
// ==============================================================================
// Comprehensive schema for split payments, installments, and layaway system
// Supports multi-party transactions, partial payments, and product reservation
// Integrates with PaymentGatewayCore Cell for Nigerian payment processing

// Main split payments table - tracks multi-party payment transactions
export const SPLIT_PAYMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS split_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    reference VARCHAR(100) NOT NULL,
    
    -- Payment details
    total_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('paystack', 'flutterwave', 'interswitch')),
    
    -- Customer and merchant information
    customer_id VARCHAR(255) NOT NULL,
    merchant_id VARCHAR(255),
    
    -- Payment status and tracking
    status VARCHAR(20) DEFAULT 'initialized' CHECK (status IN ('initialized', 'pending', 'processing', 'completed', 'failed', 'cancelled', 'disputed', 'refunded', 'partially_refunded')),
    payment_url TEXT,
    gateway_reference VARCHAR(255),
    gateway_response JSONB,
    
    -- Split configuration
    total_parties INTEGER NOT NULL CHECK (total_parties >= 2 AND total_parties <= 10),
    split_calculation JSONB NOT NULL, -- Stores calculated split amounts and metadata
    rounding_adjustment DECIMAL(10,4) DEFAULT 0,
    
    -- Tracking and audit
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    
    -- User context
    created_by UUID NOT NULL,
    updated_by UUID,
    
    -- Additional data
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_split_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_split_payment_reference_per_tenant UNIQUE (tenant_id, reference),
    
    -- Data integrity constraints
    CONSTRAINT check_total_amount_positive CHECK (total_amount > 0),
    CONSTRAINT check_currency_format CHECK (char_length(currency) = 3),
    CONSTRAINT check_reference_format CHECK (reference ~ '^SPLIT_[A-Z0-9_]+$'),
    CONSTRAINT check_completion_logic CHECK (
      (status = 'completed' AND completed_at IS NOT NULL) OR
      (status != 'completed' AND completed_at IS NULL)
    ),
    CONSTRAINT check_failure_logic CHECK (
      (status = 'failed' AND failed_at IS NOT NULL) OR
      (status != 'failed' AND failed_at IS NULL)
    )
  );
`;

// Split payment recipients/parties table - defines who gets what amount
export const SPLIT_PAYMENT_RECIPIENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS split_payment_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    split_payment_id UUID NOT NULL,
    
    -- Recipient information
    recipient_id VARCHAR(255) NOT NULL,
    recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('merchant', 'partner', 'platform', 'service_fee', 'tax', 'custom')),
    recipient_name VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255),
    
    -- Bank account details for direct transfers
    bank_account_number VARCHAR(20),
    bank_code VARCHAR(10),
    bank_account_name VARCHAR(255),
    
    -- Split configuration
    split_type VARCHAR(20) NOT NULL CHECK (split_type IN ('percentage', 'fixed_amount', 'remaining', 'commission')),
    split_value DECIMAL(15,4) NOT NULL,
    minimum_amount DECIMAL(15,2),
    maximum_amount DECIMAL(15,2),
    
    -- Calculated amounts
    calculated_amount DECIMAL(15,2) NOT NULL,
    rounding_adjustment DECIMAL(10,4) DEFAULT 0,
    
    -- Payment tracking
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    gateway_subaccount_code VARCHAR(100),
    settlement_reference VARCHAR(255),
    settled_at TIMESTAMP WITH TIME ZONE,
    settlement_amount DECIMAL(15,2),
    
    -- Additional data
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_split_recipients_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_split_recipients_payment FOREIGN KEY (split_payment_id) REFERENCES split_payments(id) ON DELETE CASCADE,
    
    -- Data integrity constraints
    CONSTRAINT check_split_value_positive CHECK (split_value >= 0),
    CONSTRAINT check_calculated_amount_positive CHECK (calculated_amount >= 0),
    CONSTRAINT check_percentage_range CHECK (
      split_type != 'percentage' OR (split_value >= 0 AND split_value <= 100)
    ),
    CONSTRAINT check_minimum_maximum_logic CHECK (
      minimum_amount IS NULL OR maximum_amount IS NULL OR minimum_amount <= maximum_amount
    ),
    CONSTRAINT check_settlement_logic CHECK (
      (payment_status = 'completed' AND settled_at IS NOT NULL) OR
      (payment_status != 'completed' AND settled_at IS NULL)
    )
  );
`;

// Installment plans table - defines payment schedule structures
export const INSTALLMENT_PLANS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS installment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    reference VARCHAR(100) NOT NULL,
    
    -- Plan details
    total_amount DECIMAL(15,2) NOT NULL,
    down_payment DECIMAL(15,2) DEFAULT 0,
    financed_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    
    -- Schedule configuration
    number_of_installments INTEGER NOT NULL CHECK (number_of_installments >= 2 AND number_of_installments <= 24),
    payment_frequency VARCHAR(20) NOT NULL CHECK (payment_frequency IN ('weekly', 'bi_weekly', 'monthly', 'custom')),
    frequency_days INTEGER NOT NULL,
    
    -- Interest and fees
    interest_rate DECIMAL(5,4) DEFAULT 0 CHECK (interest_rate >= 0 AND interest_rate <= 0.5), -- Max 50% annually
    late_fee_amount DECIMAL(10,2) DEFAULT 0,
    late_fee_type VARCHAR(20) DEFAULT 'fixed' CHECK (late_fee_type IN ('fixed', 'percentage')),
    early_payment_discount DECIMAL(5,4) DEFAULT 0 CHECK (early_payment_discount >= 0 AND early_payment_discount <= 1),
    
    -- Customer information
    customer_id VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    
    -- Plan status and tracking
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'defaulted', 'suspended')),
    start_date DATE NOT NULL,
    first_payment_date DATE NOT NULL,
    completion_date DATE,
    
    -- Payment tracking
    total_paid_amount DECIMAL(15,2) DEFAULT 0,
    remaining_balance DECIMAL(15,2),
    next_payment_due_date DATE,
    next_payment_amount DECIMAL(15,2),
    overdue_amount DECIMAL(15,2) DEFAULT 0,
    
    -- User context
    created_by UUID NOT NULL,
    updated_by UUID,
    
    -- Additional data
    description TEXT,
    terms_and_conditions TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_installment_plans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_installment_plan_reference_per_tenant UNIQUE (tenant_id, reference),
    
    -- Data integrity constraints
    CONSTRAINT check_amounts_positive CHECK (
      total_amount > 0 AND down_payment >= 0 AND financed_amount > 0
    ),
    CONSTRAINT check_financed_amount_logic CHECK (financed_amount = total_amount - down_payment),
    CONSTRAINT check_frequency_days_positive CHECK (frequency_days > 0),
    CONSTRAINT check_currency_format CHECK (char_length(currency) = 3),
    CONSTRAINT check_reference_format CHECK (reference ~ '^INST_[A-Z0-9_]+$'),
    CONSTRAINT check_payment_tracking_logic CHECK (
      total_paid_amount >= 0 AND 
      remaining_balance >= 0 AND
      overdue_amount >= 0 AND
      total_paid_amount <= total_amount
    ),
    CONSTRAINT check_completion_logic CHECK (
      (status = 'completed' AND completion_date IS NOT NULL) OR
      (status != 'completed' AND completion_date IS NULL)
    ),
    CONSTRAINT check_date_logic CHECK (
      first_payment_date >= start_date AND
      (completion_date IS NULL OR completion_date >= start_date)
    )
  );
`;

// Installment schedules table - individual payment installments
export const INSTALLMENT_SCHEDULES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS installment_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    installment_plan_id UUID NOT NULL,
    
    -- Schedule details
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    
    -- Amount breakdown
    principal_amount DECIMAL(15,2) NOT NULL,
    interest_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    late_fee_amount DECIMAL(15,2) DEFAULT 0,
    
    -- Payment status and tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'partially_paid')),
    paid_amount DECIMAL(15,2) DEFAULT 0,
    remaining_amount DECIMAL(15,2),
    
    -- Payment details
    paid_date TIMESTAMP WITH TIME ZONE,
    payment_method VARCHAR(50),
    payment_provider VARCHAR(50),
    payment_reference VARCHAR(255),
    gateway_reference VARCHAR(255),
    
    -- Late payment tracking
    days_overdue INTEGER DEFAULT 0,
    first_overdue_date DATE,
    late_fees_applied DECIMAL(15,2) DEFAULT 0,
    
    -- Balance tracking
    remaining_balance_after DECIMAL(15,2), -- Remaining balance after this payment
    
    -- Additional data
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_installment_schedules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_installment_schedules_plan FOREIGN KEY (installment_plan_id) REFERENCES installment_plans(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_installment_number_per_plan UNIQUE (installment_plan_id, installment_number),
    
    -- Data integrity constraints
    CONSTRAINT check_installment_number_positive CHECK (installment_number > 0),
    CONSTRAINT check_amounts_non_negative CHECK (
      principal_amount >= 0 AND 
      interest_amount >= 0 AND 
      total_amount >= 0 AND
      late_fee_amount >= 0 AND
      paid_amount >= 0 AND
      late_fees_applied >= 0
    ),
    CONSTRAINT check_total_amount_calculation CHECK (total_amount = principal_amount + interest_amount + late_fee_amount),
    CONSTRAINT check_remaining_amount_logic CHECK (remaining_amount = total_amount - paid_amount),
    CONSTRAINT check_payment_logic CHECK (
      (status IN ('paid', 'partially_paid') AND paid_date IS NOT NULL) OR
      (status NOT IN ('paid', 'partially_paid') AND paid_date IS NULL)
    ),
    CONSTRAINT check_overdue_logic CHECK (
      (status = 'overdue' AND days_overdue > 0) OR
      (status != 'overdue' AND days_overdue = 0)
    )
  );
`;

// Layaway orders table - product reservation system
export const LAYAWAY_ORDERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS layaway_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    reference VARCHAR(100) NOT NULL,
    
    -- Order details
    total_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    
    -- Deposit requirements
    required_deposit DECIMAL(15,2) NOT NULL,
    deposit_percentage DECIMAL(5,2) NOT NULL CHECK (deposit_percentage >= 5 AND deposit_percentage <= 50),
    minimum_deposit DECIMAL(15,2) NOT NULL,
    
    -- Customer and merchant information
    customer_id VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    merchant_id VARCHAR(255),
    merchant_name VARCHAR(255),
    
    -- Layaway configuration
    layaway_period_days INTEGER NOT NULL CHECK (layaway_period_days >= 7 AND layaway_period_days <= 365),
    expiry_date DATE NOT NULL,
    auto_renew BOOLEAN DEFAULT FALSE,
    renewal_period_days INTEGER DEFAULT 30,
    
    -- Payment tracking
    deposit_paid BOOLEAN DEFAULT FALSE,
    deposit_paid_amount DECIMAL(15,2) DEFAULT 0,
    total_paid_amount DECIMAL(15,2) DEFAULT 0,
    remaining_amount DECIMAL(15,2),
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'deposit_pending', 'in_progress', 'completed', 'expired', 'cancelled')),
    
    -- Important dates
    deposit_due_date DATE,
    completion_date TIMESTAMP WITH TIME ZONE,
    expiry_notified_date DATE,
    last_payment_date DATE,
    
    -- Reminder system
    reminder_schedule JSONB DEFAULT '[14, 7, 3, 1]'::jsonb, -- Days before expiry to send reminders
    reminders_sent JSONB DEFAULT '[]'::jsonb,
    
    -- Products data (denormalized for performance)
    products_data JSONB NOT NULL, -- Array of product objects with id, name, price, quantity, sku, category
    total_items INTEGER NOT NULL CHECK (total_items > 0),
    
    -- User context
    created_by UUID NOT NULL,
    updated_by UUID,
    
    -- Additional data
    description TEXT,
    special_instructions TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_layaway_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_layaway_order_reference_per_tenant UNIQUE (tenant_id, reference),
    
    -- Data integrity constraints
    CONSTRAINT check_amounts_positive CHECK (
      total_amount > 0 AND 
      required_deposit > 0 AND 
      minimum_deposit > 0 AND
      deposit_paid_amount >= 0 AND
      total_paid_amount >= 0
    ),
    CONSTRAINT check_deposit_logic CHECK (required_deposit >= minimum_deposit),
    CONSTRAINT check_currency_format CHECK (char_length(currency) = 3),
    CONSTRAINT check_reference_format CHECK (reference ~ '^LAY_[A-Z0-9_]+$'),
    CONSTRAINT check_remaining_amount_logic CHECK (remaining_amount = total_amount - total_paid_amount),
    CONSTRAINT check_deposit_status_logic CHECK (
      (deposit_paid = TRUE AND deposit_paid_amount >= required_deposit) OR
      (deposit_paid = FALSE AND deposit_paid_amount < required_deposit)
    ),
    CONSTRAINT check_completion_logic CHECK (
      (status = 'completed' AND completion_date IS NOT NULL) OR
      (status != 'completed' AND completion_date IS NULL)
    ),
    CONSTRAINT check_expiry_date_logic CHECK (expiry_date > CURRENT_DATE),
    CONSTRAINT check_renewal_period_positive CHECK (
      auto_renew = FALSE OR renewal_period_days > 0
    )
  );
`;

// Layaway payments table - tracks individual payments towards layaway orders
export const LAYAWAY_PAYMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS layaway_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    layaway_order_id UUID NOT NULL,
    
    -- Payment details
    payment_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('deposit', 'installment', 'final_payment', 'additional')),
    
    -- Payment processing
    payment_method VARCHAR(50) NOT NULL,
    payment_provider VARCHAR(50) CHECK (payment_provider IN ('paystack', 'flutterwave', 'interswitch')),
    payment_reference VARCHAR(255) NOT NULL,
    gateway_reference VARCHAR(255),
    
    -- Status and tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
    processed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    
    -- Balance tracking
    balance_before DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    
    -- Gateway response
    gateway_response JSONB,
    
    -- User context
    created_by UUID,
    
    -- Additional data
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_layaway_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_layaway_payments_order FOREIGN KEY (layaway_order_id) REFERENCES layaway_orders(id) ON DELETE CASCADE,
    
    -- Data integrity constraints
    CONSTRAINT check_payment_amount_positive CHECK (payment_amount > 0),
    CONSTRAINT check_currency_format CHECK (char_length(currency) = 3),
    CONSTRAINT check_balance_logic CHECK (
      balance_after = balance_before - payment_amount AND
      balance_before >= 0 AND 
      balance_after >= 0
    ),
    CONSTRAINT check_processing_logic CHECK (
      (status = 'completed' AND processed_at IS NOT NULL) OR
      (status = 'failed' AND failed_at IS NOT NULL) OR
      (status NOT IN ('completed', 'failed'))
    )
  );
`;

// Multi-method payments table - combining multiple payment sources
export const MULTI_METHOD_PAYMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS multi_method_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    reference VARCHAR(100) NOT NULL,
    
    -- Payment details
    total_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    
    -- Customer information
    customer_id VARCHAR(255) NOT NULL,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'initialized' CHECK (status IN ('initialized', 'in_progress', 'completed', 'failed', 'cancelled')),
    
    -- Method tracking
    total_methods INTEGER NOT NULL CHECK (total_methods >= 2 AND total_methods <= 5),
    completed_methods INTEGER DEFAULT 0,
    failed_methods INTEGER DEFAULT 0,
    
    -- Amount tracking
    total_processed_amount DECIMAL(15,2) DEFAULT 0,
    remaining_amount DECIMAL(15,2),
    
    -- Timing
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    timeout_at TIMESTAMP WITH TIME ZONE, -- Payment expires after this time
    
    -- User context
    created_by UUID NOT NULL,
    
    -- Additional data
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_multi_method_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_multi_method_reference_per_tenant UNIQUE (tenant_id, reference),
    
    -- Data integrity constraints
    CONSTRAINT check_total_amount_positive CHECK (total_amount > 0),
    CONSTRAINT check_currency_format CHECK (char_length(currency) = 3),
    CONSTRAINT check_reference_format CHECK (reference ~ '^MULTI_[A-Z0-9_]+$'),
    CONSTRAINT check_method_counts CHECK (
      completed_methods >= 0 AND 
      failed_methods >= 0 AND
      completed_methods + failed_methods <= total_methods
    ),
    CONSTRAINT check_amount_tracking CHECK (
      total_processed_amount >= 0 AND
      remaining_amount = total_amount - total_processed_amount
    ),
    CONSTRAINT check_completion_logic CHECK (
      (status = 'completed' AND completed_at IS NOT NULL) OR
      (status = 'failed' AND failed_at IS NOT NULL) OR
      (status NOT IN ('completed', 'failed'))
    )
  );
`;

// Multi-method payment details table - individual payment methods
export const MULTI_METHOD_PAYMENT_DETAILS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS multi_method_payment_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    multi_method_payment_id UUID NOT NULL,
    
    -- Method details
    method_order INTEGER NOT NULL CHECK (method_order > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('card', 'bank', 'ussd', 'mobile_money', 'wallet', 'credit', 'points', 'gift_card')),
    payment_provider VARCHAR(50),
    
    -- Amount and processing
    allocated_amount DECIMAL(15,2) NOT NULL,
    processed_amount DECIMAL(15,2) DEFAULT 0,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    
    -- Payment processing details
    payment_reference VARCHAR(255),
    gateway_reference VARCHAR(255),
    gateway_response JSONB,
    
    -- Account details (encrypted/tokenized)
    account_details JSONB, -- Method-specific account information
    
    -- Timing
    initiated_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    
    -- Additional data
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_multi_method_details_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_multi_method_details_payment FOREIGN KEY (multi_method_payment_id) REFERENCES multi_method_payments(id) ON DELETE CASCADE,
    
    -- Unique constraints
    CONSTRAINT unique_method_order_per_payment UNIQUE (multi_method_payment_id, method_order),
    
    -- Data integrity constraints
    CONSTRAINT check_allocated_amount_positive CHECK (allocated_amount > 0),
    CONSTRAINT check_processed_amount_valid CHECK (processed_amount >= 0 AND processed_amount <= allocated_amount),
    CONSTRAINT check_processing_logic CHECK (
      (status = 'completed' AND completed_at IS NOT NULL AND processed_amount = allocated_amount) OR
      (status = 'failed' AND failed_at IS NOT NULL) OR
      (status NOT IN ('completed', 'failed'))
    )
  );
`;

// Payment audit logs table - comprehensive transaction logging for compliance
export const PAYMENT_AUDIT_LOGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS payment_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    -- Event identification
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
      'split_payment_created', 'split_payment_completed', 'split_payment_failed',
      'installment_plan_created', 'installment_payment_made', 'installment_overdue',
      'layaway_created', 'layaway_deposit_paid', 'layaway_completed', 'layaway_expired',
      'multi_method_initiated', 'multi_method_completed',
      'refund_processed', 'dispute_created', 'fraud_detected'
    )),
    event_category VARCHAR(30) NOT NULL CHECK (event_category IN ('split_payment', 'installment', 'layaway', 'multi_method', 'security', 'compliance')),
    
    -- Related entity references
    entity_type VARCHAR(50), -- 'split_payment', 'installment_plan', 'layaway_order', etc.
    entity_id UUID,
    reference_number VARCHAR(100),
    
    -- User and session context
    user_id UUID,
    user_role VARCHAR(50),
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    
    -- Event details
    event_description TEXT NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    state_changes JSONB,
    
    -- Amounts and financial data
    amount_before DECIMAL(15,2),
    amount_after DECIMAL(15,2),
    amount_changed DECIMAL(15,2),
    currency VARCHAR(3),
    
    -- Risk and compliance
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
    compliance_flags JSONB DEFAULT '[]'::jsonb,
    requires_review BOOLEAN DEFAULT FALSE,
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional context
    gateway_provider VARCHAR(50),
    gateway_reference VARCHAR(255),
    external_reference VARCHAR(255),
    correlation_id UUID, -- Links related events
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_payment_audit_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Data integrity constraints
    CONSTRAINT check_currency_format CHECK (currency IS NULL OR char_length(currency) = 3),
    CONSTRAINT check_risk_score_range CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
    CONSTRAINT check_amount_consistency CHECK (
      (amount_before IS NULL AND amount_after IS NULL AND amount_changed IS NULL) OR
      (amount_before IS NOT NULL AND amount_after IS NOT NULL AND amount_changed = amount_after - amount_before)
    ),
    CONSTRAINT check_review_logic CHECK (
      (requires_review = FALSE) OR
      (requires_review = TRUE AND (reviewed_by IS NULL OR reviewed_at IS NOT NULL))
    )
  );
`;

// Performance indexes for split payment tables
export const SPLIT_PAYMENTS_INDEXES_SQL = `
  -- Split payments indexes
  CREATE INDEX IF NOT EXISTS idx_split_payments_tenant_id ON split_payments(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_split_payments_reference ON split_payments(tenant_id, reference);
  CREATE INDEX IF NOT EXISTS idx_split_payments_status ON split_payments(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_split_payments_customer ON split_payments(tenant_id, customer_id);
  CREATE INDEX IF NOT EXISTS idx_split_payments_provider ON split_payments(tenant_id, provider);
  CREATE INDEX IF NOT EXISTS idx_split_payments_created_at ON split_payments(created_at);
  CREATE INDEX IF NOT EXISTS idx_split_payments_completed_at ON split_payments(completed_at);
  
  -- Split payment recipients indexes
  CREATE INDEX IF NOT EXISTS idx_split_recipients_tenant_id ON split_payment_recipients(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_split_recipients_payment_id ON split_payment_recipients(split_payment_id);
  CREATE INDEX IF NOT EXISTS idx_split_recipients_recipient ON split_payment_recipients(tenant_id, recipient_id);
  CREATE INDEX IF NOT EXISTS idx_split_recipients_type ON split_payment_recipients(tenant_id, recipient_type);
  CREATE INDEX IF NOT EXISTS idx_split_recipients_status ON split_payment_recipients(payment_status);
  
  -- Installment plans indexes
  CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant_id ON installment_plans(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_installment_plans_reference ON installment_plans(tenant_id, reference);
  CREATE INDEX IF NOT EXISTS idx_installment_plans_customer ON installment_plans(tenant_id, customer_id);
  CREATE INDEX IF NOT EXISTS idx_installment_plans_status ON installment_plans(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_installment_plans_due_date ON installment_plans(next_payment_due_date);
  CREATE INDEX IF NOT EXISTS idx_installment_plans_created_at ON installment_plans(created_at);
  
  -- Installment schedules indexes
  CREATE INDEX IF NOT EXISTS idx_installment_schedules_tenant_id ON installment_schedules(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_installment_schedules_plan_id ON installment_schedules(installment_plan_id);
  CREATE INDEX IF NOT EXISTS idx_installment_schedules_due_date ON installment_schedules(due_date);
  CREATE INDEX IF NOT EXISTS idx_installment_schedules_status ON installment_schedules(status);
  CREATE INDEX IF NOT EXISTS idx_installment_schedules_overdue ON installment_schedules(tenant_id, status, due_date) WHERE status = 'overdue';
  
  -- Layaway orders indexes
  CREATE INDEX IF NOT EXISTS idx_layaway_orders_tenant_id ON layaway_orders(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_layaway_orders_reference ON layaway_orders(tenant_id, reference);
  CREATE INDEX IF NOT EXISTS idx_layaway_orders_customer ON layaway_orders(tenant_id, customer_id);
  CREATE INDEX IF NOT EXISTS idx_layaway_orders_status ON layaway_orders(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_layaway_orders_expiry ON layaway_orders(expiry_date);
  CREATE INDEX IF NOT EXISTS idx_layaway_orders_created_at ON layaway_orders(created_at);
  
  -- Layaway payments indexes
  CREATE INDEX IF NOT EXISTS idx_layaway_payments_tenant_id ON layaway_payments(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_layaway_payments_order_id ON layaway_payments(layaway_order_id);
  CREATE INDEX IF NOT EXISTS idx_layaway_payments_status ON layaway_payments(status);
  CREATE INDEX IF NOT EXISTS idx_layaway_payments_reference ON layaway_payments(payment_reference);
  CREATE INDEX IF NOT EXISTS idx_layaway_payments_created_at ON layaway_payments(created_at);
  
  -- Multi-method payments indexes
  CREATE INDEX IF NOT EXISTS idx_multi_method_payments_tenant_id ON multi_method_payments(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_multi_method_payments_reference ON multi_method_payments(tenant_id, reference);
  CREATE INDEX IF NOT EXISTS idx_multi_method_payments_customer ON multi_method_payments(tenant_id, customer_id);
  CREATE INDEX IF NOT EXISTS idx_multi_method_payments_status ON multi_method_payments(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_multi_method_payments_created_at ON multi_method_payments(created_at);
  
  -- Multi-method payment details indexes
  CREATE INDEX IF NOT EXISTS idx_multi_method_details_tenant_id ON multi_method_payment_details(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_multi_method_details_payment_id ON multi_method_payment_details(multi_method_payment_id);
  CREATE INDEX IF NOT EXISTS idx_multi_method_details_status ON multi_method_payment_details(status);
  CREATE INDEX IF NOT EXISTS idx_multi_method_details_method ON multi_method_payment_details(payment_method);
  
  -- Payment audit logs indexes
  CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_tenant_id ON payment_audit_logs(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_event_type ON payment_audit_logs(tenant_id, event_type);
  CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_entity ON payment_audit_logs(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_user ON payment_audit_logs(tenant_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_created_at ON payment_audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_requires_review ON payment_audit_logs(tenant_id, requires_review) WHERE requires_review = TRUE;
  CREATE INDEX IF NOT EXISTS idx_payment_audit_logs_correlation ON payment_audit_logs(correlation_id) WHERE correlation_id IS NOT NULL;
`;

// Triggers for automatic updated_at timestamp updates
export const SPLIT_PAYMENT_TRIGGERS_SQL = `
  -- Split payments triggers
  DROP TRIGGER IF EXISTS trigger_update_split_payments_updated_at ON split_payments;
  CREATE TRIGGER trigger_update_split_payments_updated_at
    BEFORE UPDATE ON split_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trigger_update_split_recipients_updated_at ON split_payment_recipients;
  CREATE TRIGGER trigger_update_split_recipients_updated_at
    BEFORE UPDATE ON split_payment_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trigger_update_installment_plans_updated_at ON installment_plans;
  CREATE TRIGGER trigger_update_installment_plans_updated_at
    BEFORE UPDATE ON installment_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trigger_update_installment_schedules_updated_at ON installment_schedules;
  CREATE TRIGGER trigger_update_installment_schedules_updated_at
    BEFORE UPDATE ON installment_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trigger_update_layaway_orders_updated_at ON layaway_orders;
  CREATE TRIGGER trigger_update_layaway_orders_updated_at
    BEFORE UPDATE ON layaway_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trigger_update_layaway_payments_updated_at ON layaway_payments;
  CREATE TRIGGER trigger_update_layaway_payments_updated_at
    BEFORE UPDATE ON layaway_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trigger_update_multi_method_payments_updated_at ON multi_method_payments;
  CREATE TRIGGER trigger_update_multi_method_payments_updated_at
    BEFORE UPDATE ON multi_method_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS trigger_update_multi_method_details_updated_at ON multi_method_payment_details;
  CREATE TRIGGER trigger_update_multi_method_details_updated_at
    BEFORE UPDATE ON multi_method_payment_details
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

// =============================================================================
// TAX AND FEE CONFIGURATION SYSTEM SCHEMA
// =============================================================================

/**
 * Tax Region Multipliers Table
 * Configurable regional tax adjustments to replace hardcoded REGION_TAX_MULTIPLIERS
 */
export const TAX_REGION_MULTIPLIERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tax_region_multipliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    region_code VARCHAR(10) NOT NULL,
    region_name VARCHAR(100) NOT NULL,
    tax_multiplier DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_tax_regions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_region_code_per_tenant UNIQUE (tenant_id, region_code),
    
    -- Data integrity constraints
    CONSTRAINT check_tax_multiplier_positive CHECK (tax_multiplier >= 0.0000 AND tax_multiplier <= 5.0000),
    CONSTRAINT check_region_code_format CHECK (region_code ~ '^[A-Z0-9_]{1,10}$'),
    CONSTRAINT check_only_one_default_per_tenant 
      EXCLUDE USING btree (tenant_id WITH =) WHERE (is_default = TRUE)
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_tax_regions_tenant_region ON tax_region_multipliers(tenant_id, region_code);
  CREATE INDEX IF NOT EXISTS idx_tax_regions_active ON tax_region_multipliers(tenant_id, is_active) WHERE is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_tax_regions_default ON tax_region_multipliers(tenant_id, is_default) WHERE is_default = TRUE;
  
  -- Trigger for automatic updated_at
  CREATE TRIGGER trigger_update_tax_regions_updated_at
    BEFORE UPDATE ON tax_region_multipliers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Fee Structure Tiers Table
 * Configurable fee tiers to replace hardcoded FEE_STRUCTURE
 */
export const FEE_STRUCTURE_TIERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS fee_structure_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    tier_name VARCHAR(100) NOT NULL,
    min_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    max_amount DECIMAL(15,2),
    fee_amount DECIMAL(10,2) NOT NULL,
    fee_percentage DECIMAL(5,4),
    tier_order INTEGER NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_fee_tiers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_tier_order_per_tenant UNIQUE (tenant_id, tier_order),
    
    -- Data integrity constraints
    CONSTRAINT check_min_amount_non_negative CHECK (min_amount >= 0),
    CONSTRAINT check_max_amount_greater_than_min 
      CHECK (max_amount IS NULL OR max_amount > min_amount),
    CONSTRAINT check_fee_amount_non_negative CHECK (fee_amount >= 0),
    CONSTRAINT check_fee_percentage_valid 
      CHECK (fee_percentage IS NULL OR (fee_percentage >= 0 AND fee_percentage <= 1)),
    CONSTRAINT check_has_fee_method 
      CHECK (fee_amount > 0 OR (fee_percentage IS NOT NULL AND fee_percentage > 0))
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_fee_tiers_tenant_order ON fee_structure_tiers(tenant_id, tier_order);
  CREATE INDEX IF NOT EXISTS idx_fee_tiers_amount_range ON fee_structure_tiers(tenant_id, min_amount, max_amount) WHERE is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_fee_tiers_active ON fee_structure_tiers(tenant_id, is_active) WHERE is_active = TRUE;
  
  -- Trigger for automatic updated_at
  CREATE TRIGGER trigger_update_fee_tiers_updated_at
    BEFORE UPDATE ON fee_structure_tiers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Item Type Tax Adjustments Table
 * Configurable item-specific tax adjustments to replace hardcoded item type logic
 */
export const ITEM_TYPE_TAX_ADJUSTMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS item_type_tax_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    item_type_code VARCHAR(50) NOT NULL,
    item_type_name VARCHAR(100) NOT NULL,
    tax_adjustment_multiplier DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    exemption_reason VARCHAR(200),
    regulatory_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_item_type_adjustments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_item_type_code_per_tenant UNIQUE (tenant_id, item_type_code),
    
    -- Data integrity constraints
    CONSTRAINT check_tax_adjustment_valid CHECK (tax_adjustment_multiplier >= 0.0000 AND tax_adjustment_multiplier <= 3.0000),
    CONSTRAINT check_item_type_code_format CHECK (item_type_code ~ '^[a-z_]{1,50}$'),
    CONSTRAINT check_only_one_default_per_tenant_item_type 
      EXCLUDE USING btree (tenant_id WITH =) WHERE (is_default = TRUE)
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_item_type_adjustments_tenant_code ON item_type_tax_adjustments(tenant_id, item_type_code);
  CREATE INDEX IF NOT EXISTS idx_item_type_adjustments_active ON item_type_tax_adjustments(tenant_id, is_active) WHERE is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_item_type_adjustments_default ON item_type_tax_adjustments(tenant_id, is_default) WHERE is_default = TRUE;
  
  -- Trigger for automatic updated_at
  CREATE TRIGGER trigger_update_item_type_adjustments_updated_at
    BEFORE UPDATE ON item_type_tax_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Combined TaxAndFee Configuration Tables SQL
 * Creates all tables, indexes, and triggers in the correct order
 */
export const ALL_TAX_FEE_CONFIG_TABLES_SQL = `
  ${TAX_REGION_MULTIPLIERS_TABLE_SQL}
  ${FEE_STRUCTURE_TIERS_TABLE_SQL}
  ${ITEM_TYPE_TAX_ADJUSTMENTS_TABLE_SQL}
`;

/**
 * TaxAndFee Configuration Indexes SQL
 * All indexes for optimal query performance
 */
export const ALL_TAX_FEE_CONFIG_INDEXES_SQL = `
  -- Tax region multipliers indexes (already included in table creation)
  -- Fee structure tiers indexes (already included in table creation)  
  -- Item type tax adjustments indexes (already included in table creation)
`;

/**
 * TaxAndFee Configuration Triggers SQL
 * All triggers for automatic timestamp updates
 */
export const ALL_TAX_FEE_CONFIG_TRIGGERS_SQL = `
  -- Tax region multipliers triggers (already included in table creation)
  -- Fee structure tiers triggers (already included in table creation)
  -- Item type tax adjustments triggers (already included in table creation)
`;

// =============================================================================
// QUOTE REQUEST NEGOTIATION CONFIGURATION SYSTEM SCHEMA
// =============================================================================

/**
 * Quote Default Configurations Table
 * Configurable tenant-level defaults to replace hardcoded values like payment terms,
 * communication preferences, priority settings, budget flexibility, notification frequency
 */
export const QUOTE_DEFAULT_CONFIGURATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS quote_default_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    configuration_key VARCHAR(100) NOT NULL,
    configuration_value VARCHAR(500) NOT NULL,
    value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('payment', 'communication', 'priority', 'budget', 'notification', 'general')),
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    validation_rules JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_quote_defaults_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_config_key_per_tenant UNIQUE (tenant_id, configuration_key),
    
    -- Data integrity constraints
    CONSTRAINT check_config_key_format CHECK (configuration_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT check_configuration_value_not_empty CHECK (char_length(trim(configuration_value)) > 0),
    CONSTRAINT check_only_one_default_per_category_tenant 
      EXCLUDE USING btree (tenant_id WITH =, category WITH =) WHERE (is_default = TRUE)
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_quote_defaults_tenant_key ON quote_default_configurations(tenant_id, configuration_key);
  CREATE INDEX IF NOT EXISTS idx_quote_defaults_category ON quote_default_configurations(tenant_id, category) WHERE is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_quote_defaults_active ON quote_default_configurations(tenant_id, is_active) WHERE is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_quote_defaults_default ON quote_default_configurations(tenant_id, category, is_default) WHERE is_default = TRUE;
  
  -- Trigger for automatic updated_at
  CREATE TRIGGER trigger_update_quote_defaults_updated_at
    BEFORE UPDATE ON quote_default_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Quote Regional Configurations Table
 * Configurable region-specific settings to replace hardcoded values like VAT rates,
 * currency defaults, and payment methods per region
 */
export const QUOTE_REGIONAL_CONFIGURATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS quote_regional_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    region_code VARCHAR(10) NOT NULL,
    region_name VARCHAR(100) NOT NULL,
    currency_code VARCHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    vat_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    default_payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
    payment_terms_options JSONB DEFAULT '[]'::jsonb,
    communication_preferences JSONB DEFAULT '{}' ::jsonb,
    regulatory_requirements JSONB DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_quote_regional_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_region_code_per_tenant_quote UNIQUE (tenant_id, region_code),
    
    -- Data integrity constraints
    CONSTRAINT check_vat_rate_valid CHECK (vat_rate >= 0.0000 AND vat_rate <= 1.0000),
    CONSTRAINT check_region_code_format_quote CHECK (region_code ~ '^[A-Z0-9_]{1,10}$'),
    CONSTRAINT check_only_one_default_region_per_tenant 
      EXCLUDE USING btree (tenant_id WITH =) WHERE (is_default = TRUE),
    CONSTRAINT check_payment_methods_array CHECK (jsonb_typeof(default_payment_methods) = 'array'),
    CONSTRAINT check_currency_code_valid CHECK (currency_code IN ('NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'GHS', 'KES', 'UGX'))
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_quote_regional_tenant_region ON quote_regional_configurations(tenant_id, region_code);
  CREATE INDEX IF NOT EXISTS idx_quote_regional_active ON quote_regional_configurations(tenant_id, is_active) WHERE is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_quote_regional_default ON quote_regional_configurations(tenant_id, is_default) WHERE is_default = TRUE;
  CREATE INDEX IF NOT EXISTS idx_quote_regional_currency ON quote_regional_configurations(tenant_id, currency_code) WHERE is_active = TRUE;
  
  -- Trigger for automatic updated_at
  CREATE TRIGGER trigger_update_quote_regional_updated_at
    BEFORE UPDATE ON quote_regional_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Quote Business Rules Table
 * Configurable business logic settings and approval thresholds to replace hardcoded logic
 */
export const QUOTE_BUSINESS_RULES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS quote_business_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    rule_name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('approval_threshold', 'validation_rule', 'notification_rule', 'escalation_rule', 'pricing_rule')),
    rule_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    rule_actions JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INTEGER NOT NULL DEFAULT 1000,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_until DATE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    
    -- Multi-tenant constraints
    CONSTRAINT fk_quote_business_rules_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Unique constraints scoped by tenant
    CONSTRAINT unique_rule_name_per_tenant UNIQUE (tenant_id, rule_name),
    
    -- Data integrity constraints
    CONSTRAINT check_rule_name_format CHECK (rule_name ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT check_priority_positive CHECK (priority > 0),
    CONSTRAINT check_effective_dates CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT check_rule_conditions_object CHECK (jsonb_typeof(rule_conditions) = 'object'),
    CONSTRAINT check_rule_actions_object CHECK (jsonb_typeof(rule_actions) = 'object'),
    CONSTRAINT check_effective_from_not_future CHECK (effective_from <= CURRENT_DATE + INTERVAL '1 year')
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_quote_business_rules_tenant_type ON quote_business_rules(tenant_id, rule_type);
  CREATE INDEX IF NOT EXISTS idx_quote_business_rules_active ON quote_business_rules(tenant_id, is_active) WHERE is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_quote_business_rules_priority ON quote_business_rules(tenant_id, priority, is_active) WHERE is_active = TRUE;
  CREATE INDEX IF NOT EXISTS idx_quote_business_rules_effective ON quote_business_rules(tenant_id, effective_from, effective_until) WHERE is_active = TRUE;
  
  -- Trigger for automatic updated_at
  CREATE TRIGGER trigger_update_quote_business_rules_updated_at
    BEFORE UPDATE ON quote_business_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Combined Quote Configuration Tables SQL
 * Creates all tables, indexes, and triggers in the correct order
 */
export const ALL_QUOTE_CONFIG_TABLES_SQL = `
  ${QUOTE_DEFAULT_CONFIGURATIONS_TABLE_SQL}
  ${QUOTE_REGIONAL_CONFIGURATIONS_TABLE_SQL}
  ${QUOTE_BUSINESS_RULES_TABLE_SQL}
`;

/**
 * Quote Configuration Indexes SQL
 * All indexes for optimal query performance
 */
export const ALL_QUOTE_CONFIG_INDEXES_SQL = `
  -- Quote default configurations indexes (already included in table creation)
  -- Quote regional configurations indexes (already included in table creation)
  -- Quote business rules indexes (already included in table creation)
`;

/**
 * Quote Configuration Triggers SQL
 * All triggers for automatic timestamp updates
 */
export const ALL_QUOTE_CONFIG_TRIGGERS_SQL = `
  -- Quote default configurations triggers (already included in table creation)
  -- Quote regional configurations triggers (already included in table creation)
  -- Quote business rules triggers (already included in table creation)
`;