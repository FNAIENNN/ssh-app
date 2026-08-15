import json

files_content = {
    'SeedStocking.jsx': [],
    'PackingPage.jsx': [],
    'OutsideWorkersStep3.jsx': []
}

with open('/home/user/.gemini/antigravity-ide/brain/c69681dd-917b-4697-91d4-3aeba311abe4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'VIEW_FILE' and data.get('content'):
                content = data['content']
                if 'File Path:' in content:
                    lines = content.split('\n')
                    actual_lines = []
                    is_code = False
                    for l in lines:
                        if l.startswith('The following code has been modified'):
                            is_code = True
                            continue
                        if l.startswith('The above content does NOT show'):
                            is_code = False
                            continue
                        if is_code:
                            # format: <line_number>: <original_line>
                            if ': ' in l:
                                actual_lines.append(l.split(': ', 1)[1])
                            else:
                                actual_lines.append(l)
                    
                    full_text = '\n'.join(actual_lines)
                    
                    if 'SeedStocking.jsx' in content:
                        files_content['SeedStocking.jsx'].append(full_text)
                    elif 'PackingPage.jsx' in content:
                        files_content['PackingPage.jsx'].append(full_text)
                    elif 'OutsideWorkersStep3.jsx' in content:
                        files_content['OutsideWorkersStep3.jsx'].append(full_text)
        except Exception as e:
            pass

for k, v in files_content.items():
    if v:
        with open('original_' + k, 'w') as out:
            out.write(v[0])
        print(f"Saved {k} ({len(v)} versions found)")
