import json
import re

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('step_index') == 221:
                content = obj.get('content', '')
                lines = content.split('\n')
                code_lines = []
                for l in lines:
                    if re.match(r'^\d+:', l):
                        code_lines.append(l.split(':', 1)[1][1:])
                # But wait, step 221 is PackingSummary.jsx
                pass
        except Exception as e:
            pass

    # Let's find PackingPage.jsx in step 219 or something
    f.seek(0)
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'VIEW_FILE':
                content = obj.get('content', '')
                if 'PackingPage.jsx' in content and 'File Path:' in content:
                    lines = content.split('\n')
                    code_lines = []
                    for l in lines:
                        if re.match(r'^\d+:', l):
                            code_lines.append(l.split(':', 1)[1][1:])
                    if code_lines:
                        with open('/home/user/Downloads/ssh-app/ssh-app/src/features/seed/payments/packing/PackingPage_original.jsx', 'w') as out:
                            out.write('\n'.join(code_lines))
                        print("Extracted to PackingPage_original.jsx")
                        break
        except Exception as e:
            pass
