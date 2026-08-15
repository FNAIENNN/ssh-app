with open('SeedStocking_rebuilt.jsx', 'r') as f:
    lines = f.readlines()
    for i in range(240, 260):
        print(f"{i+1}: {lines[i]}", end='')
