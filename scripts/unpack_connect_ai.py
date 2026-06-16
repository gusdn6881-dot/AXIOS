import os
import urllib.request
import zipfile
import subprocess
import shutil

URL = "https://github.com/wonseokjung/connect-ai/releases/download/desktop-v0.3.3/Connect-AI-0.3.3-arm64-mac.zip"
ZIP_PATH = r"c:\Users\sck03\AXIOS CLI\connect-ai-temp.zip"
# Use \\?\ to bypass MAX_PATH limit on Windows
EXTRACT_DIR = r"\\?\c:\Users\sck03\AXIOS CLI\connect-ai-temp-extracted"
ASAR_DIR = r"\\?\c:\Users\sck03\AXIOS CLI\connect-ai-src-extracted"

def download_file(url, dest):
    if os.path.exists(dest):
        print(f"File already exists: {dest}")
        return
    print(f"Downloading {url} to {dest}...")
    urllib.request.urlretrieve(url, dest)
    print("Download completed.")

def extract_asar_and_unpacked(zip_path, dest_dir):
    print(f"Opening zip {zip_path}...")
    prefix_to_find = "Connect AI.app/Contents/Resources/app.asar"
    
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        members_to_extract = [
            m for m in zip_ref.namelist()
            if m.startswith(prefix_to_find)
        ]
        
        print(f"Extracting files to bypass path limits (total candidates: {len(members_to_extract)})...")
        
        count = 0
        for member in members_to_extract:
            # Calculate the relative path from Resources/
            rel_path = member[len("Connect AI.app/Contents/Resources/"):].strip().replace('/', '\\')
            if not rel_path:
                continue
                
            dest_file = os.path.join(dest_dir, rel_path)
            
            if member.endswith('/'):
                # It's a directory, just make it and continue
                dest_dir_cleaned = dest_file.rstrip('\\')
                os.makedirs(dest_dir_cleaned, exist_ok=True)
                continue
                
            # Make sure parent directory exists (using \\?\ prepended path)
            os.makedirs(os.path.dirname(dest_file).rstrip('\\'), exist_ok=True)
            
            # Extract file
            with zip_ref.open(member) as source, open(dest_file, "wb") as target:
                shutil.copyfileobj(source, target)
            count += 1
            if count % 1000 == 0:
                print(f"Extracted {count} files...")
                
    print(f"Extraction of {count} files (app.asar and app.asar.unpacked) completed successfully.")
    return os.path.join(dest_dir, "app.asar")

def main():
    download_file(URL, ZIP_PATH)
    
    try:
        asar_path = extract_asar_and_unpacked(ZIP_PATH, EXTRACT_DIR)
    except Exception as e:
        print("ERROR extracting files:", e)
        return
        
    if os.path.exists(ASAR_DIR):
        shutil.rmtree(ASAR_DIR)
        
    os.makedirs(ASAR_DIR, exist_ok=True)
    
    # Extract asar using npx asar
    print(f"Extracting asar using npx asar to {ASAR_DIR}...")
    local_asar_path = r"c:\Users\sck03\AXIOS CLI\connect-ai-temp-extracted\app.asar"
    local_asar_dir = r"c:\Users\sck03\AXIOS CLI\connect-ai-src-extracted"
    
    # Run the command
    subprocess.run(f'npx asar extract "{local_asar_path}" "{local_asar_dir}"', shell=True, check=True)
    print("ASAR extraction complete! Source code is ready at:", local_asar_dir)

if __name__ == "__main__":
    main()
