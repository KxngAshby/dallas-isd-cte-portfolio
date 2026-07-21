/** Single source of truth for tab names and column headers (mirrors Data.gs). */
export const SCHEMA: Record<string, string[]> = {
  KitTemplates: ['template_id', 'name', 'career', 'notes', 'active'],
  TemplateItems: ['template_id', 'type_id', 'qty', 'reorder_threshold'],
  Campuses: ['campus_id', 'name', 'region', 'principal_name', 'principal_email', 'active'],
  Kits: [
    'kit_id',
    'name',
    'kit_barcode',
    'template_id',
    'tipweb_tag',
    'location',
    'loan_status',
    'notes',
    'active',
  ],
  ItemTypes: ['type_id', 'name', 'reorder_threshold', 'is_consumable', 'notes'],
  KitItems: ['barcode', 'kit_id', 'type_id', 'status', 'last_updated', 'updated_by', 'notes'],
  AuditLog: [
    'timestamp',
    'barcode',
    'kit_id',
    'action',
    'old_status',
    'new_status',
    'user',
    'notes',
  ],
  Audits: ['audit_id', 'kit_id', 'started', 'completed', 'scanned_count', 'missing_count'],
  Loans: [
    'loan_id',
    'kit_id',
    'campus_id',
    'campus_name',
    'region',
    'tipweb_tag',
    'teacher_name',
    'counselor_eid',
    'counselor_email',
    'checked_out_at',
    'checked_out_by',
    'due_date',
    'checked_in_at',
    'checked_in_by',
    'return_type',
    'notes',
    'status',
  ],
  CheckoutItems: ['loan_id', 'barcode', 'type_id', 'status_at_checkout', 'confirmed'],
  CheckinIssues: ['loan_id', 'barcode', 'issue_type', 'notes', 'reported_at', 'reported_by'],
  Counselors: ['eid', 'name', 'email', 'campus_id', 'campus_name', 'first_seen', 'last_seen', 'active'],
  EmailTemplates: ['template_id', 'name', 'subject', 'body', 'active'],
  Settings: ['key', 'value'],
};

/** Dallas ISD Director Regions */
export const REGIONS = [
  'Region I',
  'Region II',
  'Region III',
  'Region IV',
  'Region V',
  'Region VI',
  'Magnets & Montessori',
  'Transformation',
] as const;

export const STATUS = {
  AVAILABLE: 'Available',
  NEEDS_REPLACEMENT: 'Needs Replacement',
  DEAD: 'Dead',
} as const;

export const ISSUE_TYPES = [
  'Needs Replacement',
  'Does Not Work',
  'Needs Batteries',
  'Missing',
  'Other',
] as const;

export const LOAN_ST = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

export const KIT_LOAN_ST = {
  AVAILABLE: 'available',
  CHECKED_OUT: 'checked_out',
} as const;

export type SheetRow = Record<string, unknown> & { _row: number };
