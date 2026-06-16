main_js_path = r"c:\Users\sck03\AXIOS CLI\connect-ai-src-extracted\out\main.js"
with open(main_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Search for getBrainDir or os.homedir() or connect-ai-brain
for line in content.splitlines():
    if 'connect-ai-brain' in line or 'os.homedir()' in line or 'getBrainDir' in line or 'userData' in line:
        if len(line) < 300:
            print(line)
