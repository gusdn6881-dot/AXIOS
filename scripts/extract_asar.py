import os
import json
import struct
import shutil

def extract_asar(asar_path, dest_dir):
    # Use \\?\ for dest_dir to bypass path limit on Windows
    dest_dir = r"\\?\\" + os.path.abspath(dest_dir).replace('/', '\\')
    if dest_dir.startswith(r"\\?\\\\?\\"):
        dest_dir = dest_dir[4:] # prevent duplicate prefix
        
    print(f"Parsing ASAR: {asar_path}")
    print(f"Destination: {dest_dir}")
    
    with open(asar_path, 'rb') as f:
        d = f.read(16)
        if len(d) < 16:
            raise ValueError("Invalid ASAR header (too short)")
        
        c, size_plus_8, size_plus_4, json_size = struct.unpack('<IIII', d)
        print(f"ASAR Header metadata: const={c}, json_size={json_size}")
        
        json_data = f.read(json_size)
        header = json.loads(json_data.decode('utf-8'))
        
        base_offset = 16 + json_size
        if base_offset % 4 != 0:
            base_offset += 4 - (base_offset % 4)
            
        print(f"JSON header parsed. Base offset for files: {base_offset}")
        
        unpacked_dir = r"\\?\\" + os.path.abspath(asar_path + ".unpacked").replace('/', '\\')
        if unpacked_dir.startswith(r"\\?\\\\?\\"):
            unpacked_dir = unpacked_dir[4:]
            
        def extract_node(node, current_path):
            if 'files' in node:
                # Directory
                dir_path = os.path.join(dest_dir, current_path)
                os.makedirs(dir_path, exist_ok=True)
                for name, child in node['files'].items():
                    extract_node(child, os.path.join(current_path, name))
            else:
                # File
                file_path = os.path.join(dest_dir, current_path)
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                
                if node.get('unpacked'):
                    # Copy from .unpacked directory
                    src_file = os.path.join(unpacked_dir, current_path)
                    if os.path.exists(src_file):
                        shutil.copy2(src_file, file_path)
                else:
                    if 'offset' in node:
                        offset = int(node['offset'])
                        size = int(node['size'])
                        
                        f.seek(base_offset + offset)
                        data = f.read(size)
                        
                        with open(file_path, 'wb') as out_f:
                            out_f.write(data)
                    elif 'link' in node:
                        # Link / symlink, skip or create empty placeholder
                        pass
                    else:
                        # Empty file
                        with open(file_path, 'wb') as out_f:
                            pass
                        
        extract_node(header, '')
        print("Extraction completed successfully!")

if __name__ == '__main__':
    asar_path = r"c:\Users\sck03\AXIOS CLI\connect-ai-temp-extracted\app.asar"
    dest_dir = r"c:\Users\sck03\AXIOS CLI\connect-ai-src-extracted"
    extract_asar(asar_path, dest_dir)
