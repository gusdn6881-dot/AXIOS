import os
import sys
import json
import subprocess
import urllib.request
import ssl
import shutil
from show_notification import show_toast, show_popup

# Configurations
WORKSPACE_DIR = r"c:\Users\sck03\AXIOS CLI"
DESKTOP_DIR = os.path.join(WORKSPACE_DIR, "desktop")
LOG_FILE = os.path.join(WORKSPACE_DIR, "scripts", "auto_update.log")
OWNER = "wonseokjung"
REPO = "connect-ai"

def log(message):
    print(message)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(message + "\n")
    except Exception as e:
        print(f"Failed to write to log file: {e}")

def get_latest_release():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/releases/latest"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            data = json.loads(response.read().decode('utf-8'))
            tag_name = data.get("tag_name", "")
            return tag_name
    except Exception as e:
        log(f"[ERROR] Failed to fetch latest release from GitHub API: {e}")
        return None

def get_local_version():
    local_pkg_path = os.path.join(DESKTOP_DIR, "package.json")
    if not os.path.exists(local_pkg_path):
        return None
    try:
        with open(local_pkg_path, 'r', encoding='utf-8') as f:
            pkg = json.load(f)
        return pkg.get("version", "0.0.0")
    except Exception as e:
        log(f"[ERROR] Failed to read local package.json: {e}")
        return None

def run_command(cmd, cwd=WORKSPACE_DIR):
    log(f"[EXEC] Running command: {cmd} in {cwd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        log(f"[ERROR] Command failed with code {result.returncode}")
        log(f"[STDOUT] {result.stdout}")
        log(f"[STDERR] {result.stderr}")
    return result

def ensure_junction():
    installed_resources = r"C:\Users\sck03\AppData\Local\Programs\AXIOS-CLI\resources"
    junction_path = os.path.join(installed_resources, "app")
    asar_path = os.path.join(installed_resources, "app.asar")
    
    if not os.path.exists(installed_resources):
        log("[WARNING] Installed AXIOS-CLI directory not found. Skipping junction check.")
        return
        
    if not os.path.exists(junction_path):
        log("[INFO] App junction not found. Creating junction link...")
        if os.path.exists(asar_path):
            try:
                backup_path = asar_path + ".backup"
                if not os.path.exists(backup_path):
                    os.rename(asar_path, backup_path)
                    log(f"[INFO] Backed up {asar_path} to app.asar.backup")
            except Exception as e:
                log(f"[ERROR] Failed to backup app.asar: {e}")
        
        # Create junction link using mklink /J
        # Since it requires cmd shell built-in, run via cmd
        run_command(f'mklink /J "{junction_path}" "{DESKTOP_DIR}"')

def main():
    log("\n===================================================")
    log(" AXIOS CLI Auto-Updater Run")
    log("===================================================\n")
    
    # 1. Fetch latest release version from Github
    latest_tag = get_latest_release()
    if not latest_tag:
        log("[INFO] Could not retrieve latest release version. Exiting.")
        return
        
    version = latest_tag.replace("desktop-v", "").strip()
    local_version = get_local_version()
    
    log(f"[INFO] Upstream Version: {version}")
    log(f"[INFO] Local Version: {local_version}")
    
    if not local_version:
        log("[ERROR] Could not read local version. Exiting.")
        return
        
    if version == local_version:
        log("[INFO] AXIOS CLI is already up to date. Exiting.")
        return
        
    # 2. Update is available
    log(f"[INFO] New version {version} detected! Starting upgrade...")
    show_toast("AXIOS CLI 업데이트 감지", f"최신 버전({version})으로 업데이트 및 로컬 코드 통합을 진행합니다.")
    
    # Check for uncommitted changes and commit them to prevent merge blocks
    status_res = run_command("git status --porcelain")
    if status_res.stdout and status_res.stdout.strip():
        log("[INFO] Uncommitted changes detected. Committing them before merge...")
        run_command("git add .")
        run_command('git commit -m "Local backup before auto-update merge"')

    # 3. Fetch from upstream
    fetch_res = run_command("git fetch upstream")
    if fetch_res.returncode != 0:
        show_toast("AXIOS CLI 업데이트 실패", "upstream 리포지토리에서 데이터를 가져오는 데 실패했습니다.")
        return
        
    # 4. Merge upstream/main
    merge_res = run_command('git merge upstream/main -m "Merge upstream updates"')
    if merge_res.returncode != 0:
        log("[ERROR] Merge conflicts detected during auto-update.")
        show_popup("AXIOS CLI 병합 충돌 발생", 
                   "최신 업데이트를 로컬 코드와 병합하는 중 충돌이 발생했습니다.\n\n"
                   "VS Code 나 Cursor를 열어서 충돌을 직접 해결하신 뒤, 'Sync-And-Update.bat'을 실행해 주세요.")
        return
        
    # 5. Run the upgrade and rebrand Python script
    upgrade_res = run_command(f'python "{os.path.join(WORKSPACE_DIR, "scripts", "upgrade_axios_cli.py")}"')
    if upgrade_res.returncode != 0:
        log("[ERROR] Rebranding or bundle merge failed.")
        show_toast("AXIOS CLI 업데이트 오류", "리브랜딩 및 빌드 과정에서 오류가 발생했습니다. 로그를 확인하세요.")
        return
        
    # 6. Ensure link to installed application
    ensure_junction()
    
    # 7. Auto-commit and push to origin
    run_command("git add .")
    run_command(f'git commit -m "Auto-sync with upstream connect-ai updates to {version}"')
    push_res = run_command("git push origin main")
    if push_res.returncode != 0:
        log("[WARNING] Pushing to origin (your GitHub) failed.")
        
    log(f"[SUCCESS] AXIOS CLI successfully updated to version {version}!")
    show_toast("AXIOS CLI 업데이트 완료", f"성공적으로 최신 버전({version})으로 업데이트 및 통합되었습니다.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"[CRITICAL ERROR] {e}")
        show_toast("AXIOS CLI 오류", f"업데이트 감지 중 알 수 없는 치명적 오류가 발생했습니다: {e}")
