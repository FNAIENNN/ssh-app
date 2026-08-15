import re

with open('src/features/seed/payments/seedStocking/OutsideWorkersStep3.jsx', 'r') as f:
    content = f.read()

old_rp = """        <RequestPayment 
          type="outside_worker" 
          siteId={siteId} 
          billId={activeOrder?.id || null} 
          totalOrderPrice={grandTotal}
          supplierSection={supplierSection}
          relatedTankId={vehicle.tank_ids?.[0] || null} // Primary tank
        />"""

new_rp = """        <RequestPayment 
          type="outside_worker" 
          siteId={siteId} 
          billId={activeOrder?.id || null} 
          totalOrderPrice={grandTotal}
          supplierSection={supplierSection}
          relatedTankId={vehicle.tank_ids?.[0] || null} // Primary tank
          workSource={workSource}
        />"""

content = content.replace(old_rp, new_rp)

with open('src/features/seed/payments/seedStocking/OutsideWorkersStep3.jsx', 'w') as f:
    f.write(content)
