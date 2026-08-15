import re

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'r') as f:
    content = f.read()

old_push = """          next.push({
            id: 'tank-' + Date.now(),
            name: transferTarget.toUpperCase().trim(),
            numberOfPackets: packets,
            quantity: transferQty, 
            status: 'Transferred',
            selected: true,
            isTransferTarget: true
          });"""

new_push = """          next.push({
            id: 'tank-' + Date.now(),
            name: transferTarget.toUpperCase().trim(),
            numberOfPackets: packets,
            quantity: transferQty, 
            status: 'Transferred',
            selected: true,
            isTransferTarget: true,
            sourceTankId: activeTank.id
          });"""
content = content.replace(old_push, new_push)

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'w') as f:
    f.write(content)
