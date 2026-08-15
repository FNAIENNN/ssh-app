import json
import re

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'TOOL_RESPONSE' and obj.get('name') in ['default_api:view_file', 'view_file']:
                content = obj.get('content', '')
                if 'PackingSummary.jsx' in content and 'File Path:' in content:
                    lines = content.split('\n')
                    code_lines = []
                    for l in lines:
                        if re.match(r'^\d+:', l):
                            code_lines.append(l.split(':', 1)[1][1:])
                    
                    if code_lines:
                        with open('/home/user/Downloads/ssh-app/ssh-app/src/features/seed/payments/packing/PackingSummary.jsx', 'w') as out:
                            out.write('\n'.join(code_lines))
                        print("Extracted PackingSummary.jsx")
                        break
        except Exception as e:
            pass
