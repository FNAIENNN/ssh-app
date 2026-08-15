import re

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'r') as f:
    content = f.read()

# Fix confirmReturn status setting
old_return_status = """      const remainingQty = activeTank.quantity - qty;
      const remainingPackets = activeTank.numberOfPackets - qty; // Using qty as packets fallback if proportional isn't strictly requested, but wait, let's use proportional
      const finalRemainingPackets = activeTank.numberOfPackets - returnedPackets;
      const newStatus = finalRemainingPackets <= 0 && remainingQty <= 0 ? 'Returned' : activeTank.status;"""

new_return_status = """      const remainingQty = activeTank.quantity - qty;
      const finalRemainingPackets = activeTank.numberOfPackets - returnedPackets;
      const newStatus = 'Returned'; // Status always becomes Returned, tank retains remaining quantity per requirement"""

content = content.replace(old_return_status, new_return_status)

with open('src/features/seed/payments/packing/PackingSelection.jsx', 'w') as f:
    f.write(content)
