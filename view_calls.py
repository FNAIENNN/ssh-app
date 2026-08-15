import json

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'PLANNER_RESPONSE':
                for tc in obj.get('tool_calls', []):
                    if tc['name'] == 'view_file':
                        args = tc['args']
                        if type(args) == str:
                            args = json.loads(args)
                        if 'SeedStocking.jsx' in args.get('AbsolutePath', ''):
                            print(f"VIEW_FILE SeedStocking.jsx: Start={args.get('StartLine')} End={args.get('EndLine')}")
        except Exception as e:
            pass
