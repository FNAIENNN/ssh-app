import json

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'PLANNER_RESPONSE':
                for tc in obj.get('tool_calls', []):
                    if tc['name'] in ['multi_replace_file_content', 'replace_file_content']:
                        args = tc['args']
                        if type(args) == str:
                            args = json.loads(args)
                        target = args.get('TargetFile', '')
                        if 'SeedStocking.jsx' in target:
                            chunks = args.get('ReplacementChunks', [args])
                            print(f"SeedStocking.jsx edit. Chunks: {len(chunks)}")
                            for i, c in enumerate(chunks):
                                print(f"  Chunk {i}: Lines {c.get('StartLine')} to {c.get('EndLine')}. Target length: {len(c.get('TargetContent', ''))}")
                        elif 'PackingPage.jsx' in target:
                            chunks = args.get('ReplacementChunks', [args])
                            print(f"PackingPage.jsx edit. Chunks: {len(chunks)}")
                            for i, c in enumerate(chunks):
                                print(f"  Chunk {i}: Lines {c.get('StartLine')} to {c.get('EndLine')}. Target length: {len(c.get('TargetContent', ''))}")
                        elif 'OutsideWorkersStep3.jsx' in target:
                            chunks = args.get('ReplacementChunks', [args])
                            print(f"OutsideWorkersStep3.jsx edit. Chunks: {len(chunks)}")
                            for i, c in enumerate(chunks):
                                print(f"  Chunk {i}: Lines {c.get('StartLine')} to {c.get('EndLine')}. Target length: {len(c.get('TargetContent', ''))}")
        except Exception as e:
            pass
