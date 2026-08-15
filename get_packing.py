import json

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            obj = json.loads(line)
            if obj.get('type') == 'VIEW_FILE' and obj.get('content'):
                content = obj['content']
                if 'PackingPage.jsx' in content:
                    if 'The above content does NOT show the entire file' not in content:
                        print(f"Found FULL PackingPage.jsx! Length: {len(content)}")
                        with open('FULL_PackingPage.jsx', 'w') as out:
                            # format: <line_number>: <original_line>
                            lines = content.split('\n')
                            actual_lines = []
                            is_code = False
                            for l in lines:
                                if l.startswith('The following code has been modified'):
                                    is_code = True
                                    continue
                                if is_code:
                                    if ': ' in l:
                                        actual_lines.append(l.split(': ', 1)[1])
                                    else:
                                        actual_lines.append(l)
                            out.write('\n'.join(actual_lines))
        except Exception as e:
            pass
