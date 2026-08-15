import json

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'VIEW_FILE' and obj.get('content') and 'SeedStocking.jsx' in obj['content'] and 'seedMode === \'packing\'' in obj['content']:
                print("Found raw!")
                with open('raw_SeedStocking.txt', 'w') as out:
                    out.write(obj['content'])
                break
        except Exception as e:
            pass
