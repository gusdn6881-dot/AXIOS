import os
import shutil
import re
import json

EXTRACTED_DIR = r"c:\Users\sck03\AXIOS CLI\connect-ai-src-extracted"
DESKTOP_DIR = r"c:\Users\sck03\AXIOS CLI\desktop"

def copy_dir_contents(src, dest):
    print(f"Copying {src} -> {dest}...")
    # Use prepended paths on Windows to avoid MAX_PATH issues
    src_clean = r"\\?\\" + os.path.abspath(src)
    dest_clean = r"\\?\\" + os.path.abspath(dest)
    
    if not os.path.exists(src_clean):
        print(f"Skipping copy: {src} does not exist.")
        return
        
    for root, dirs, files in os.walk(src_clean):
        rel_path = os.path.relpath(root, src_clean)
        if rel_path == ".":
            dest_dir = dest_clean
        else:
            dest_dir = os.path.join(dest_clean, rel_path)
            
        os.makedirs(dest_dir, exist_ok=True)
        
        for file in files:
            src_file = os.path.join(root, file)
            dest_file = os.path.join(dest_dir, file)
            try:
                shutil.copy2(src_file, dest_file)
            except Exception as e:
                print(f"Failed to copy {src_file} -> {dest_file}: {e}")

def rebrand_file(file_path):
    # Enable Windows long-path prefix
    fp = r"\\?\\" + os.path.abspath(file_path)
    if not os.path.exists(fp):
        return
        
    print(f"Rebranding {file_path}...")
    try:
        with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        # Rebranding substitutions
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
            print(f"Updated {file_path}")
    except Exception as e:
        print(f"Error rebranding {file_path}: {e}")

def main():
    # 1. Copy out/main.js and out/preload.js
    os.makedirs(os.path.join(DESKTOP_DIR, "out"), exist_ok=True)
    shutil.copy2(os.path.join(EXTRACTED_DIR, "out", "main.js"), os.path.join(DESKTOP_DIR, "out", "main.js"))
    shutil.copy2(os.path.join(EXTRACTED_DIR, "out", "preload.js"), os.path.join(DESKTOP_DIR, "out", "preload.js"))
    print("Copied compiled out/main.js and out/preload.js.")
    
    # 2. Copy src/renderer, assets, training folders
    copy_dir_contents(os.path.join(EXTRACTED_DIR, "src", "renderer"), os.path.join(DESKTOP_DIR, "src", "renderer"))
    copy_dir_contents(os.path.join(EXTRACTED_DIR, "assets"), os.path.join(DESKTOP_DIR, "assets"))
    copy_dir_contents(os.path.join(EXTRACTED_DIR, "training"), os.path.join(DESKTOP_DIR, "training"))
    
    # 3. Modify package.json dependencies
    pkg_path = os.path.join(DESKTOP_DIR, "package.json")
    with open(pkg_path, 'r', encoding='utf-8') as f:
        pkg = json.load(f)
        
    pkg["dependencies"]["imapflow"] = "^1.3.7"
    pkg["dependencies"]["mailparser"] = "^3.9.9"
    pkg["dependencies"]["node-llama-cpp"] = "^3.18.1"
    pkg["version"] = "0.3.3"
    
    with open(pkg_path, 'w', encoding='utf-8') as f:
        json.dump(pkg, f, indent=2, ensure_ascii=False)
    print("Updated desktop/package.json version and dependencies.")
    
    # 4. Modify esbuild.mjs to skip main and preload compilation
    esbuild_path = os.path.join(DESKTOP_DIR, "esbuild.mjs")
    with open(esbuild_path, 'r', encoding='utf-8') as f:
        esbuild_content = f.read()
        
    # Comment out main and preload builds, keeping only renderer
    esbuild_modified = esbuild_content.replace(
        "await Promise.all([\n  build({\n    ...common,\n    entryPoints: ['src/main.ts'],\n    outfile: 'out/main.js',\n    platform: 'node',\n    external: ['electron'],\n  }),\n  build({\n    ...common,\n    entryPoints: ['src/preload.ts'],\n    outfile: 'out/preload.js',\n    platform: 'node',\n    external: ['electron'],\n  }),",
        "await Promise.all(["
    )
    
    with open(esbuild_path, 'w', encoding='utf-8') as f:
        f.write(esbuild_modified)
    print("Modified esbuild.mjs to skip main/preload build.")
    
    # 5. Rebrand files
    # Rebrand main.js, preload.js, and everything in src/renderer
    rebrand_file(os.path.join(DESKTOP_DIR, "out", "main.js"))
    rebrand_file(os.path.join(DESKTOP_DIR, "out", "preload.js"))
    
    renderer_dir = os.path.join(DESKTOP_DIR, "src", "renderer")
    for file in os.listdir(renderer_dir):
        if file.endswith((".ts", ".html", ".css", ".js")):
            rebrand_file(os.path.join(renderer_dir, file))
            
    # 6. Inject Python orchestrator process launch into desktop/out/main.js
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

    # We want to insert this inside import_electron.app.whenReady().then(() => { ... })
    target_str = 'import_electron.app.whenReady().then(() => {'
    pos = main_js.find(target_str)
    if pos != -1:
        insert_pos = pos + len(target_str)
        main_js_modified = main_js[:insert_pos] + python_spawn_code + main_js[insert_pos:]
        with open(main_js_path, 'w', encoding='utf-8') as f:
            f.write(main_js_modified)
        print("Injected python process spawner to desktop/out/main.js.")
    else:
        print("WARNING: Could not find insert target in main.js for Python process spawner.")
        
    # 7. Add Threads integration to desktop/src/renderer/renderer.ts
    renderer_ts_path = os.path.join(DESKTOP_DIR, "src", "renderer", "renderer.ts")
    with open(renderer_ts_path, 'r', encoding='utf-8') as f:
        renderer_ts = f.read()
        
    threads_integration = """  { id: 'instagram', name: 'Instagram (Meta Graph)', icon: '📷', summary: '인스타 비즈니스 게시 + DM/댓글 분석.', helpUrl: 'https://developers.facebook.com/', fields: [
    { key: 'META_ACCESS_TOKEN', label: 'Access Token', type: 'password' },
    { key: 'INSTAGRAM_BUSINESS_ID', label: 'Business Account ID', type: 'text' } ] },
  { id: 'threads', name: 'Meta Threads', icon: '🧵', summary: '스레드 계정에 자동으로 게시글을 올리고, 계정 분석 및 댓글 관리를 수행합니다.', helpUrl: 'https://developers.facebook.com/docs/threads/', fields: [
    { key: 'THREADS_ACCESS_TOKEN', label: 'Access Token', type: 'password', help: 'Meta for Developers에서 발급한 Threads용 Access Token' },
    { key: 'THREADS_USER_ID', label: 'Threads User ID', type: 'text', help: 'Threads API 호출용 User ID' } ] },"""
    
    # Replace the instagram block with instagram + threads block
    old_insta_pattern = re.compile(r"\{\s*id:\s*'instagram'.*?INSTAGRAM_BUSINESS_ID.*?\}\s*\],?\s*\},?", re.DOTALL)
    if "id: 'threads'" not in renderer_ts and old_insta_pattern.search(renderer_ts):
        renderer_ts_modified = old_insta_pattern.sub(threads_integration, renderer_ts)
        with open(renderer_ts_path, 'w', encoding='utf-8') as f:
            f.write(renderer_ts_modified)
        print("Added Threads integration fields to renderer.ts.")
    else:
        print("WARNING: Could not locate Instagram fields in renderer.ts to insert Threads fields.")

if __name__ == '__main__':
    main()
