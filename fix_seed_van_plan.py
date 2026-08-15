import re

with open('src/features/seed/payments/seedStocking/SeedVanPlanStep1.jsx', 'r') as f:
    content = f.read()

old_logic = """    if (selectedVehicle) {
      const assignedIds = selectedVehicle.tank_ids || [];
      return orderTanks.filter((t) => assignedIds.includes(t.id));
    }"""

new_logic = """    if (selectedVehicle) {
      const assignedIds = selectedVehicle.tank_ids || [];
      return orderTanks.filter((t) => assignedIds.some(id => String(id) === String(t.id)));
    }"""

content = content.replace(old_logic, new_logic)

with open('src/features/seed/payments/seedStocking/SeedVanPlanStep1.jsx', 'w') as f:
    f.write(content)
