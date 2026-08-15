import json

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'TOOL_RESPONSE' and 'view_file' in obj.get('name', ''):
                content = obj.get('content', '')
                if 'PackingSummary.jsx' in content:
                    print("FOUND!")
                    with open('summary_content.txt', 'w') as out:
                        out.write(content)
                    break
        except Exception as e:
            pass
