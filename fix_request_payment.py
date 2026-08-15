import re

with open('src/components/payments/RequestPayment.jsx', 'r') as f:
    content = f.read()

# Add workSource to props
content = content.replace(
    "hideMachineIdBook = false, // eslint-disable-line no-unused-vars\n}) {",
    "hideMachineIdBook = false, // eslint-disable-line no-unused-vars\n  workSource = null,\n}) {"
)

# Update cash payload
old_cash_payload = """    const payload = {
      site_id: siteId,
      type,
      method: 'cash',
      amount,
      status: 'requested', // Submit request to payments module (Requirement #5)
      remaining_balance: sharedRemainingBalance,
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      created_by: user?.id,
    };"""

new_cash_payload = """    const payload = {
      site_id: siteId,
      type,
      method: 'cash',
      amount,
      status: 'requested', // Submit request to payments module (Requirement #5)
      remaining_balance: sharedRemainingBalance,
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      created_by: user?.id,
      note: workSource ? `Work Source: ${workSource}` : null,
    };"""
content = content.replace(old_cash_payload, new_cash_payload)

# Update advance payload
old_adv_payload = """    const payload = {
      site_id: siteId,
      type,
      method: 'advance',
      advance_mode: advanceMode,
      amount: advAmount,
      status: 'requested',
      remaining_balance: sharedRemainingBalance,
      upi_id: upiIdVal,
      bank_account_id: bankAccountId,
      hatchery_id: selectedHatchery?.id || null,
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      created_by: user?.id,
      photo_url: photoPreview || null,
      voice_url: audioUrl || null,
    };"""

new_adv_payload = """    const payload = {
      site_id: siteId,
      type,
      method: 'advance',
      advance_mode: advanceMode,
      amount: advAmount,
      status: 'requested',
      remaining_balance: sharedRemainingBalance,
      upi_id: upiIdVal,
      bank_account_id: bankAccountId,
      hatchery_id: selectedHatchery?.id || null,
      related_tank_id: relatedTankId,
      related_section_id: relatedSectionId,
      bill_id: billId,
      created_by: user?.id,
      photo_url: photoPreview || null,
      voice_url: audioUrl || null,
      note: workSource ? `Work Source: ${workSource}` : null,
    };"""
content = content.replace(old_adv_payload, new_adv_payload)

with open('src/components/payments/RequestPayment.jsx', 'w') as f:
    f.write(content)
