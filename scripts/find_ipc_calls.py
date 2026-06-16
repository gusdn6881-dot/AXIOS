import re

extracted_renderer = r"c:\Users\sck03\AXIOS CLI\connect-ai-src-extracted\src\renderer\renderer.ts"
with open(extracted_renderer, 'r', encoding='utf-8') as f:
    extracted_content = f.read()

local_renderer = r"c:\Users\sck03\AXIOS CLI\desktop\src\renderer\renderer.ts"
with open(local_renderer, 'r', encoding='utf-8') as f:
    local_content = f.read()

# Find all connect.* calls
pattern = r'connect\.([a-zA-Z0-9_]+)'
extracted_calls = set(re.findall(pattern, extracted_content))
local_calls = set(re.findall(pattern, local_content))

print("Extracted (v0.3.3) Connect calls:", sorted(list(extracted_calls)))
print("Local (v0.2.0) Connect calls:", sorted(list(local_calls)))
print("New calls in v0.3.3:", sorted(list(extracted_calls - local_calls)))
