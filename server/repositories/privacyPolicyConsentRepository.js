async function insertPrivacyPolicyConsent(db, consent) {
  const result = await db.run(`
    INSERT INTO privacy_policy_consents (
      user_id,
      policy_version,
      consent_type,
      consent_source
    ) VALUES (?, ?, ?, ?)
    RETURNING id
  `, [
    consent.userId,
    consent.policyVersion,
    consent.consentType,
    consent.consentSource
  ]);

  return result.lastID;
}

module.exports = {
  insertPrivacyPolicyConsent
};