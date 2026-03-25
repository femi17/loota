-- ============================================================================
-- Add wallet_topup to transactions.transaction_type (audit trail for add-coins)
-- ============================================================================
-- Run in Supabase SQL Editor. Allows logging Paystack top-ups in transactions.
-- ============================================================================

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN (
    'purchase',
    'rental',
    'refuel',
    'maintenance',
    'rest',
    'rejuvenate',
    'question_reward',
    'hunt_completion',
    'signup_bonus',
    'refund',
    'referral_bonus',
    'wallet_topup'
  ));
