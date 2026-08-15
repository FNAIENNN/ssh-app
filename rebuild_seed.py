import json

lines_dict_seed = {}
lines_dict_outside = {}

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            
            # Stop if we hit our first edit
            if obj.get('type') == 'PLANNER_RESPONSE':
                for tc in obj.get('tool_calls', []):
                    if tc['name'] in ['multi_replace_file_content', 'replace_file_content']:
                        args = tc['args']
                        if type(args) == str:
                            args = json.loads(args)
                        target = args.get('TargetFile', '')
                        if 'SeedStocking.jsx' in target:
                            print("Hit edit on SeedStocking, stopping SeedStocking parsing!")
                            break # Wait, we can't break the outer loop easily in python without a flag
            
            if obj.get('type') == 'VIEW_FILE' and obj.get('content'):
                content = obj['content']
                if 'SeedStocking.jsx' in content:
                    lines = content.split('\n')
                    is_code = False
                    for l in lines:
                        if l.startswith('The following code has been modified'):
                            is_code = True
                            continue
                        if 'The above content does NOT show the entire' in l or 'The above content shows the entire' in l:
                            is_code = False
                            continue
                        if is_code:
                            if ': ' in l:
                                parts = l.split(': ', 1)
                                try:
                                    num = int(parts[0])
                                    lines_dict_seed[num] = parts[1]
                                except:
                                    pass
                elif 'OutsideWorkersStep3.jsx' in content:
                    lines = content.split('\n')
                    is_code = False
                    for l in lines:
                        if l.startswith('The following code has been modified'):
                            is_code = True
                            continue
                        if 'The above content does NOT show the entire' in l or 'The above content shows the entire' in l:
                            is_code = False
                            continue
                        if is_code:
                            if ': ' in l:
                                parts = l.split(': ', 1)
                                try:
                                    num = int(parts[0])
                                    lines_dict_outside[num] = parts[1]
                                except:
                                    pass
        except Exception as e:
            pass

print(f"Seed lines extracted: {len(lines_dict_seed)}")
print(f"Outside lines extracted: {len(lines_dict_outside)}")

with open('SeedStocking_rebuilt.jsx', 'w') as out:
    for i in range(1, max(lines_dict_seed.keys()) + 1):
        out.write(lines_dict_seed.get(i, f"// MISSING LINE {i}") + '\n')

with open('OutsideWorkersStep3_rebuilt.jsx', 'w') as out:
    for i in range(1, max(lines_dict_outside.keys()) + 1):
        out.write(lines_dict_outside.get(i, f"// MISSING LINE {i}") + '\n')

