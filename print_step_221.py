import json

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('step_index') in [221, 563]:
                print(f"Step {obj.get('step_index')}: Type={obj.get('type')} Name={obj.get('name')}")
                content = obj.get('content', '')
                if content:
                    print(content[:200])
        except Exception as e:
            pass
