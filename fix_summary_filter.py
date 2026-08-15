import re

with open('src/features/seed/payments/packing/PackingSummary.jsx', 'r') as f:
    content = f.read()

# Filter finalTanks to exclude fully empty tanks
old_final = """  const finalTanks = selectedTanks
    .map(t => {
      if (t.status === 'Transferred') {
        return t; // Source tank fully transferred. Keep as is so status='Transferred' handles '-' display
      }
      return t;
    });"""

new_final = """  const finalTanks = selectedTanks
    .filter(t => {
      const isFullyEmpty = t.quantity <= 0 && t.numberOfPackets <= 0;
      // If a tank is completely returned or transferred (0 quantity), it should not be displayed 
      // as normal packet stock or meaningless 0 quantity rows per requirements.
      if (isFullyEmpty && (t.status === 'Returned' || t.status === 'Transferred')) {
        return false;
      }
      return true;
    });"""

content = content.replace(old_final, new_final)

with open('src/features/seed/payments/packing/PackingSummary.jsx', 'w') as f:
    f.write(content)
