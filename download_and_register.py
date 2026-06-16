import os
import sys
import requests
import subprocess
import time

# Target paths
target_dir = r"C:\Users\sck03\AXIOS CLI"
gguf_path = os.path.join(target_dir, "gemma4-12b-q3.gguf")
modelfile_path = os.path.join(target_dir, "Modelfile")

url = "https://huggingface.co/bartowski/gemma-4-12B-it-GGUF/resolve/main/gemma-4-12B-it-Q3_K_M.gguf?download=true"

def log(msg):
    print(msg, flush=True)

def download_file(url, dest):
    log(f"Downloading {url} to {dest}...")
    temp_dest = dest + ".tmp"
    
    # Custom headers
    headers = {"User-Agent": "Mozilla/5.0"}
    
    start_time = time.time()
    try:
        r = requests.get(url, stream=True, headers=headers, timeout=30)
        r.raise_for_status()
        total_size = int(r.headers.get('content-length', 0))
        
        log(f"Total size: {total_size / 1024 / 1024 / 1024:.2f} GB")
        
        downloaded = 0
        last_progress_time = time.time()
        
        with open(temp_dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024*1024*4): # 4MB chunk
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    now = time.time()
                    if now - last_progress_time > 10: # Progress report every 10 seconds
                        pct = (downloaded / total_size) * 100 if total_size else 0
                        speed = downloaded / (now - start_time) / 1024 / 1024 # MB/s
                        log(f"Progress: {pct:.1f}% ({downloaded / 1024 / 1024 / 1024:.2f} GB / {total_size / 1024 / 1024 / 1024:.2f} GB) - Speed: {speed:.2f} MB/s")
                        last_progress_time = now
                        
        os.rename(temp_dest, dest)
        log("Download completed successfully!")
        return True
    except Exception as e:
        log(f"Download failed: {e}")
        if os.path.exists(temp_dest):
            try: os.remove(temp_dest)
            except: pass
        return False

def create_modelfile():
    log("Creating Modelfile...")
    modelfile_content = f"""FROM ./gemma4-12b-q3.gguf
TEMPLATE \"{{{{ if .System }}}}<|im_start|>system\\n{{{{ .System }}}}<|im_end|>\\n{{{{ end }}}}{{{{ if .Prompt }}}}<|im_start|>user\\n{{{{ .Prompt }}}}<|im_end|>\\n{{{{ end }}}}:<|im_start|>assistant\\n{{{{ .Response }}}}<|im_end|>\\n\"
"""
    with open(modelfile_path, "w", encoding="utf-8") as f:
        f.write(modelfile_content)
    log("Modelfile created.")

def register_ollama_model():
    log("Registering model in Ollama...")
    try:
        # Run ollama create
        cmd = ["ollama", "create", "gemma4:12b-custom", "-f", modelfile_path]
        res = subprocess.run(cmd, cwd=target_dir, capture_output=True, text=True, check=True)
        log("Ollama registration succeeded:")
        log(res.stdout)
        
        # Verify
        verify_cmd = ["ollama", "list"]
        verify_res = subprocess.run(verify_cmd, capture_output=True, text=True)
        log("Current Ollama models:")
        log(verify_res.stdout)
        return True
    except Exception as e:
        log(f"Ollama registration failed: {e}")
        return False

def main():
    if os.path.exists(gguf_path):
        log("GGUF file already exists, skipping download.")
    else:
        success = download_file(url, gguf_path)
        if not success:
            sys.exit(1)
            
    create_modelfile()
    success = register_ollama_model()
    if success:
        log("All steps completed successfully! Gemma 4 12B Custom model is ready for AXIOS CLI.")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
