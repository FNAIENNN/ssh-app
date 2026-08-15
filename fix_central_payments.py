import re

with open('src/features/seed/payments/CentralPayments.jsx', 'r') as f:
    content = f.read()

old_logic = """        } else if (typeStr === 'outside_worker' || typeStr === 'outside_workers') {
          module = 'seed_stock';
          processName = 'Seed Van Plan';
          paymentType = 'Outside Worker Payment';
          partyName = p.supplier_id ? (supMap[p.supplier_id] || p.holder_name) : (p.supervisor_name || p.holder_name || p.note || 'Outside Workers');
        } else {"""

new_logic = """        } else if (typeStr === 'outside_worker' || typeStr === 'outside_workers') {
          module = 'seed_stock';
          
          let parsedSource = 'Outside Workers';
          if (p.note && p.note.includes('Work Source: Packing')) {
            parsedSource = 'Packing';
          } else if (p.note && p.note.includes('Work Source: Seed Stocking')) {
            parsedSource = 'Seed Stocking';
          }
          processName = parsedSource;
          
          paymentType = 'Outside Worker Payment';
          partyName = p.supplier_id ? (supMap[p.supplier_id] || p.holder_name) : (p.supervisor_name || p.holder_name || p.note || 'Outside Workers');
          
          // Clean up the partyName if it contains Work Source
          if (partyName && partyName.includes('Work Source:')) {
             partyName = 'Outside Workers';
          }
        } else {"""

content = content.replace(old_logic, new_logic)

with open('src/features/seed/payments/CentralPayments.jsx', 'w') as f:
    f.write(content)
