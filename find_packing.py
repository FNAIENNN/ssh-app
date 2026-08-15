import json

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'VIEW_FILE' and obj.get('content') and 'SeedStocking.jsx' in obj['content'] and 'seedMode === \'packing\'' in obj['content']:
                print("Found it!")
                lines = obj['content'].split('\n')
                actual_lines = []
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
                            actual_lines.append(l.split(': ', 1)[1])
                        else:
                            actual_lines.append(l)
                with open('SeedStocking_snippet.jsx', 'w') as out:
                    out.write('\n'.join(actual_lines))
        except Exception as e:
            pass
