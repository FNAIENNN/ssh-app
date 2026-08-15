import json
import re

view_step = -1

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'PLANNER_RESPONSE':
                for tc in obj.get('tool_calls', []):
                    if 'view_file' in tc.get('name', ''):
                        args = tc['args']
                        if type(args) == str:
                            args = json.loads(args)
                        if 'PackingSummary.jsx' in args.get('AbsolutePath', ''):
                            view_step = obj.get('step_index')
                            print(f"Tool call at step {view_step}")
            elif obj.get('type') == 'TOOL_RESPONSE' and obj.get('step_index') == view_step + 1:
                content = obj.get('content', '')
                print(f"Response at step {obj.get('step_index')}")
                lines = content.split('\n')
                code_lines = []
                for l in lines:
                    if re.match(r'^\d+:', l):
                        code_lines.append(l.split(':', 1)[1][1:])
                if code_lines:
                    with open('/home/user/Downloads/ssh-app/ssh-app/src/features/seed/payments/packing/PackingSummary.jsx', 'w') as out:
                        out.write('\n'.join(code_lines))
                    print("Extracted to PackingSummary.jsx")
                    break
        except Exception as e:
            pass
