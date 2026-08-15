with open('FULL_PackingPage.jsx', 'r') as f:
    lines = f.readlines()
fixed = [l for l in lines if 'The above content shows the entire' not in l and not l.strip() == '']
with open('/home/user/Downloads/ssh-app/ssh-app/src/features/seed/payments/packing/PackingPage.jsx', 'w') as f:
    f.writelines(fixed)
