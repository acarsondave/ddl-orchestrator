import myjdapi
import os

def _get_jd_client():
    email = os.environ.get("JD_EMAIL")
    password = os.environ.get("JD_PASSWORD")
    device_name = os.environ.get("JD_DEVICE_NAME")
    
    if not all([email, password, device_name]):
        raise Exception("Missing MyJDownloader credentials in environment variables.")

    jd = myjdapi.Myjdapi()
    jd.set_app_key("AcarsonDDLOrchestrator")
    
    if not jd.connect(email, password):
        raise Exception("Failed to authenticate with MyJDownloader.")
        
    device = jd.get_device(device_name)
    if not device:
        raise Exception(f"Device '{device_name}' not found.")
        
    return device

def push_to_jdownloader(anime_name: str, links: list[str]):
    device = _get_jd_client()
    
    try:
        default_path = device.action("/config/get", ["org.jdownloader.settings.GeneralSettings", "null", "defaultdownloadfolder"])
    except Exception as e:
        print("Failed to get default path:", e)
        default_path = ""
        
    dest_folder = None
    if default_path:
        # Clean up any jd tags if present
        default_path = str(default_path).replace("<jd:packagename>", "").strip()
        sep = '\\' if '\\' in default_path else '/'
        
        category_folder = None
        if "[TV]" in anime_name:
            category_folder = "TV"
        elif "[ANIME]" in anime_name:
            category_folder = "Anime"
            
        if category_folder:
            parts = default_path.rstrip(sep).split(sep)
            if parts and parts[-1].lower() in ["movies", "movie", "downloads"]:
                parts[-1] = category_folder
            else:
                parts.append(category_folder)
            base_dest = sep.join(parts)
        else:
            base_dest = default_path.rstrip(sep)
            
        # Manually append package name since we are disabling Packagizer rules
        dest_folder = base_dest + sep + anime_name

    payload = {
        "autostart": True, 
        "links": "\n".join(links), 
        "packageName": anime_name,
        "overwritePackagizerRules": True
    }
    
    if dest_folder:
        payload["destinationFolder"] = dest_folder
        
    device.linkgrabber.add_links([payload])
    return True

def get_downloads_status():
    device = _get_jd_client()
    
    try:
        grabber_packages = device.linkgrabber.query_packages([{
            "bytesLoaded": True,
            "bytesTotal": True,
            "status": True,
            "childCount": True
        }]) or []
    except Exception:
        grabber_packages = []
        
    try:
        downloads_packages = device.downloads.query_packages([{
            "bytesLoaded": True,
            "bytesTotal": True,
            "status": True,
            "finished": True,
            "childCount": True
        }]) or []
    except Exception:
        downloads_packages = []
        
    return {
        "linkgrabber": grabber_packages,
        "downloads": downloads_packages
    }
