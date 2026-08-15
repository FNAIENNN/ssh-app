import json

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'PLANNER_RESPONSE':
                for tc in obj.get('tool_calls', []):
                    if tc['name'] == 'multi_replace_file_content':
                        args = tc['args']
                        if type(args) == str:
                            args = json.loads(args)
                        if 'SeedStocking.jsx' in args.get('TargetFile', ''):
                            chunks = args.get('ReplacementChunks', [])
                            if len(chunks) == 4:
                                with open('SeedStocking_Target2.jsx', 'w') as out:
                                    out.write(chunks[2]['TargetContent'])
                                with open('SeedStocking_Target3.jsx', 'w') as out:
                                    out.write(chunks[3]['TargetContent'])
                                print("Targets dumped!")
                                break
        except Exception as e:
            pass
