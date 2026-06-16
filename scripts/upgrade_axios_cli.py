import os
import urllib.request
import zipfile
import subprocess
import shutil
import json
import re
import struct

OWNER = "wonseokjung"
REPO = "connect-ai"
DESKTOP_DIR = r"c:\Users\sck03\AXIOS CLI\desktop"
ZIP_PATH = r"c:\Users\sck03\AXIOS CLI\connect-ai-temp.zip"
EXTRACT_DIR = r"\\?\c:\Users\sck03\AXIOS CLI\connect-ai-temp-extracted"
ASAR_DIR = r"\\?\c:\Users\sck03\AXIOS CLI\connect-ai-src-extracted"

def get_latest_release():
    import json
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/releases/latest"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            data = json.loads(response.read().decode('utf-8'))
            tag_name = data.get("tag_name", "") # e.g. "desktop-v0.3.3"
            
            # Find the mac zip asset URL
            zip_url = None
            for asset in data.get("assets", []):
                if asset.get("name", "").endswith("mac.zip") or "arm64-mac.zip" in asset.get("name", ""):
                    zip_url = asset.get("browser_download_url")
                    break
            return tag_name, zip_url
    except Exception as e:
        print("Failed to fetch latest release from GitHub API:", e)
        return None, None

def copy_dir_contents(src, dest):
    src_clean = r"\\?\\" + os.path.abspath(src)
    dest_clean = r"\\?\\" + os.path.abspath(dest)
    if not os.path.exists(src_clean):
        return
    for root, dirs, files in os.walk(src_clean):
        rel_path = os.path.relpath(root, src_clean)
        dest_dir = dest_clean if rel_path == "." else os.path.join(dest_clean, rel_path)
        os.makedirs(dest_dir, exist_ok=True)
        for file in files:
            shutil.copy2(os.path.join(root, file), os.path.join(dest_dir, file))

def rebrand_file(file_path):
    fp = r"\\?\\" + os.path.abspath(file_path)
    if not os.path.exists(fp):
        return
    try:
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        replacements = [
            ("Connect AI", "AXIOS CLI"),
            ("connect-ai", "axios-cli"),
            ("connect-ai-config.json", "axios-cli-config.json"),
            ("connect-ai-brain.jsonl", "axios-cli-brain.jsonl"),
            ("Connect-AI", "AXIOS-CLI"),
            ("connectAi", "axiosCli"),
            ("connect-ai-brain", "axios-cli-brain"),
            ("EZER AI", "Axios AI Lab"),
            ("https://github.com/wonseokjung/connect-ai", "https://github.com/gusdn6881-dot/AXIOS")
        ]
        changed = False
        new_content = content
        for old, new in replacements:
            if old in new_content:
                new_content = new_content.replace(old, new)
                changed = True
        if changed:
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(new_content)
    except Exception as e:
        print(f"Error rebranding {file_path}: {e}")

def main():
    print("Checking for updates...")
    tag_name, zip_url = get_latest_release()
    if not tag_name or not zip_url:
        print("Could not retrieve latest release info. Aborting.")
        return
        
    version = tag_name.replace("desktop-v", "").strip()
    print(f"Latest Connect AI release tag: {tag_name} (Version: {version})")
    
    # Read local version
    local_pkg_path = os.path.join(DESKTOP_DIR, "package.json")
    with open(local_pkg_path, 'r', encoding='utf-8') as f:
        pkg = json.load(f)
    local_version = pkg.get("version", "0.0.0")
    print(f"Local AXIOS CLI version: {local_version}")
    
    if version == local_version and os.path.exists(os.path.join(DESKTOP_DIR, "out", "main.js")):
        print("AXIOS CLI is already up to date!")
        return

    # Download latest Mac Zip release
    print(f"Downloading release zip from {zip_url}...")
    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    urllib.request.install_opener(opener)
    urllib.request.urlretrieve(zip_url, ZIP_PATH)
    
    # Extract app.asar and unpacked folder
    print("Extracting app.asar from zip...")
    if os.path.exists(EXTRACT_DIR):
        shutil.rmtree(EXTRACT_DIR)
    os.makedirs(EXTRACT_DIR, exist_ok=True)
    
    prefix_to_find = "Connect AI.app/Contents/Resources/app.asar"
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        for member in zip_ref.namelist():
            if member.startswith(prefix_to_find):
                rel_path = member[len("Connect AI.app/Contents/Resources/"):].strip().replace('/', '\\')
                if not rel_path:
                    continue
                dest_file = os.path.join(EXTRACT_DIR, rel_path)
                if member.endswith('/'):
                    os.makedirs(dest_file.rstrip('\\'), exist_ok=True)
                    continue
                os.makedirs(os.path.dirname(dest_file).rstrip('\\'), exist_ok=True)
                with zip_ref.open(member) as source, open(dest_file, "wb") as target:
                    shutil.copyfileobj(source, target)
                    
    # Parse and extract ASAR using custom python code to avoid npm asar issues
    print("Extracting ASAR binary...")
    if os.path.exists(ASAR_DIR):
        shutil.rmtree(ASAR_DIR)
    os.makedirs(ASAR_DIR, exist_ok=True)
    
    asar_file_path = os.path.join(EXTRACT_DIR, "app.asar")
    unpacked_dir = os.path.join(EXTRACT_DIR, "app.asar.unpacked")
    
    with open(asar_file_path, 'rb') as f:
        d = f.read(16)
        c, _, _, json_size = struct.unpack('<IIII', d)
        json_data = f.read(json_size)
        header = json.loads(json_data.decode('utf-8'))
        base_offset = 16 + json_size
        if base_offset % 4 != 0:
            base_offset += 4 - (base_offset % 4)
            
        def extract_node(node, current_path):
            if 'files' in node:
                os.makedirs(os.path.join(ASAR_DIR, current_path), exist_ok=True)
                for name, child in node['files'].items():
                    extract_node(child, os.path.join(current_path, name))
            else:
                file_path = os.path.join(ASAR_DIR, current_path)
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                if node.get('unpacked'):
                    src_file = os.path.join(unpacked_dir, current_path)
                    if os.path.exists(src_file):
                        shutil.copy2(src_file, file_path)
                else:
                    if 'offset' in node:
                        f.seek(base_offset + int(node['offset']))
                        data = f.read(int(node['size']))
                        with open(file_path, 'wb') as out_f:
                            out_f.write(data)
                    elif 'link' in node:
                        pass
                    else:
                        with open(file_path, 'wb') as out_f:
                            pass
        extract_node(header, '')
        
    # Merge and rebrand
    print("Merging files into desktop/...")
    shutil.copy2(os.path.join(ASAR_DIR, "out", "main.js"), os.path.join(DESKTOP_DIR, "out", "main.js"))
    shutil.copy2(os.path.join(ASAR_DIR, "out", "preload.js"), os.path.join(DESKTOP_DIR, "out", "preload.js"))
    copy_dir_contents(os.path.join(ASAR_DIR, "src", "renderer"), os.path.join(DESKTOP_DIR, "src", "renderer"))
    copy_dir_contents(os.path.join(ASAR_DIR, "assets"), os.path.join(DESKTOP_DIR, "assets"))
    copy_dir_contents(os.path.join(ASAR_DIR, "training"), os.path.join(DESKTOP_DIR, "training"))
    
    # Update package.json
    pkg["dependencies"]["imapflow"] = "^1.3.7"
    pkg["dependencies"]["mailparser"] = "^3.9.9"
    pkg["dependencies"]["node-llama-cpp"] = "^3.18.1"
    pkg["version"] = version
    with open(local_pkg_path, 'w', encoding='utf-8') as f:
        json.dump(pkg, f, indent=2, ensure_ascii=False)
        
    # Rebrand
    rebrand_file(os.path.join(DESKTOP_DIR, "out", "main.js"))
    rebrand_file(os.path.join(DESKTOP_DIR, "out", "preload.js"))
    renderer_dir = os.path.join(DESKTOP_DIR, "src", "renderer")
    for file in os.listdir(renderer_dir):
        if file.endswith((".ts", ".html", ".css", ".js")):
            rebrand_file(os.path.join(renderer_dir, file))
            
    # Inject Python spawner
    main_js_path = os.path.join(DESKTOP_DIR, "out", "main.js")
    with open(main_js_path, 'r', encoding='utf-8') as f:
        main_js = f.read()
    python_spawn_code = """
  // Start the FastAPI Core Orchestrator Python process
  try {
    const { spawn } = require("child_process");
    const path = require("path");
    const pythonScript = path.join(__dirname, '..', '..', 'scripts', 'agent_orchestrator.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const tgToken = loadConfig().telegramToken || '';
    const tgChatId = loadConfig().telegramChatId || '';
    const orchestratorProc = spawn(pythonCmd, [pythonScript], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: tgToken,
        AXIOS_MASTER_CHAT_ID: tgChatId,
        AXIOS_CORE_PORT: '8000'
      }
    });
    orchestratorProc.unref();
    logDiag('Started AXIOS Core Orchestrator Python Process');
  } catch (err) {
    logDiag('Failed to start AXIOS Core Orchestrator: ' + err.message);
  }
"""
    target_str = 'import_electron.app.whenReady().then(() => {'
    pos = main_js.find(target_str)
    if pos != -1:
        insert_pos = pos + len(target_str)
        main_js_modified = main_js[:insert_pos] + python_spawn_code + main_js[insert_pos:]
        with open(main_js_path, 'w', encoding='utf-8') as f:
            f.write(main_js_modified)
            
    # Add Threads integration
    renderer_ts_path = os.path.join(DESKTOP_DIR, "src", "renderer", "renderer.ts")
    with open(renderer_ts_path, 'r', encoding='utf-8') as f:
        renderer_ts = f.read()
    threads_integration = """  { id: 'instagram', name: 'Instagram (Meta Graph)', icon: '📷', summary: '인스타 비즈니스 게시 + DM/댓글 분석.', helpUrl: 'https://developers.facebook.com/', fields: [
    { key: 'META_ACCESS_TOKEN', label: 'Access Token', type: 'password' },
    { key: 'INSTAGRAM_BUSINESS_ID', label: 'Business Account ID', type: 'text' } ] },
  { id: 'threads', name: 'Meta Threads', icon: '🧵', summary: '스레드 계정에 자동으로 게시글을 올리고, 계정 분석 및 댓글 관리를 수행합니다.', helpUrl: 'https://developers.facebook.com/docs/threads/', fields: [
    { key: 'THREADS_ACCESS_TOKEN', label: 'Access Token', type: 'password', help: 'Meta for Developers에서 발급한 Threads용 Access Token' },
    { key: 'THREADS_USER_ID', label: 'Threads User ID', type: 'text', help: 'Threads API 호출용 User ID' } ] },"""
    old_insta_pattern = re.compile(r"\{\s*id:\s*'instagram'.*?INSTAGRAM_BUSINESS_ID.*?\}\s*\],?\s*\},?", re.DOTALL)
    if "id: 'threads'" not in renderer_ts and old_insta_pattern.search(renderer_ts):
        renderer_ts_modified = old_insta_pattern.sub(threads_integration, renderer_ts)
        with open(renderer_ts_path, 'w', encoding='utf-8') as f:
            f.write(renderer_ts_modified)
        print("Added Threads integration fields to renderer.ts.")
            
    # Run npm install and npm run build
    print("Running npm install...")
    subprocess.run("npm install", shell=True, cwd=DESKTOP_DIR, check=True)
    print("Running npm run build...")
    subprocess.run("npm run build", shell=True, cwd=DESKTOP_DIR, check=True)
    print(f"Upgrade to version {version} completed successfully!")

if __name__ == '__main__':
    main()
