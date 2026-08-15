import json
import os

files_to_restore = [
    '/home/user/Downloads/ssh-app/ssh-app/src/features/seed/payments/seedStocking/SeedStocking.jsx',
    '/home/user/Downloads/ssh-app/ssh-app/src/features/seed/payments/seedStocking/OutsideWorkersStep3.jsx',
    '/home/user/Downloads/ssh-app/ssh-app/src/features/seed/payments/packing/PackingPage.jsx'
]

edits = []

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
                        
                        target_file = args.get('TargetFile')
                        if target_file in files_to_restore:
                            if tc['name'] == 'multi_replace_file_content':
                                chunks = args.get('ReplacementChunks', [])
                            else:
                                chunks = [args] # single replace
                                
                            edits.append({
                                'file': target_file,
                                'chunks': chunks
                            })
        except Exception as e:
            pass

print(f"Found {len(edits)} tool calls modifying our files.")

# Apply in reverse order
for edit_call in reversed(edits):
    target_file = edit_call['file']
    if not os.path.exists(target_file):
        continue
        
    with open(target_file, 'r') as f:
        content = f.read()
        
    print(f"Reversing edit on {target_file}")
    
    # Within a single call, chunks are usually applied in order or reverse order.
    # To be safe, we just string-replace ReplacementContent with TargetContent.
    # We must do this carefully.
    
    success_count = 0
    for chunk in edit_call['chunks']:
        rep = chunk.get('ReplacementContent', '')
        tar = chunk.get('TargetContent', '')
        
        # We want to replace 'rep' back to 'tar'.
        # Note: if rep is empty, it means we deleted tar. Reversing a deletion means inserting tar where rep was.
        # But if rep is empty, content.replace('', tar) is invalid!
        # This string-replace method is flawed if rep is empty.
        
        if not rep:
             print("Warning: ReplacementContent is empty. Need line numbers to restore.")
             # We can't easily string-replace an empty string. 
        else:
             if rep in content:
                 content = content.replace(rep, tar)
                 success_count += 1
             else:
                 print("Warning: ReplacementContent not found in file!")
                 
    with open(target_file, 'w') as f:
        f.write(content)
    print(f"  Successfully reversed {success_count} chunks.")

