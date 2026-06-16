renderer_path = r"c:\Users\sck03\AXIOS CLI\connect-ai-src-extracted\src\renderer\renderer.ts"
with open(renderer_path, 'r', encoding='utf-8') as f:
    content = f.read()

import re
pos = content.find('const API_SERVICES')
if pos != -1:
    print(content[pos:pos+1000])
else:
    print("API_SERVICES not found")
