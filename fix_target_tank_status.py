import re

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'r') as f:
    content = f.read()

old_target_push = """        } else {
          next.push({
            id: 'tank-' + Date.now(),
            name: transferTarget.toUpperCase().trim(),
            numberOfPackets: packets,
            quantity: transferQty, 
            status: '',
            selected: false,
            isTransferTarget: true
          });
        }"""

new_target_push = """        } else {
          next.push({
            id: 'tank-' + Date.now(),
            name: transferTarget.toUpperCase().trim(),
            numberOfPackets: packets,
            quantity: transferQty, 
            status: 'Transferred',
            selected: true,
            isTransferTarget: true
          });
        }"""
content = content.replace(old_target_push, new_target_push)

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'w') as f:
    f.write(content)
