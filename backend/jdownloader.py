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
    device.linkgrabber.add_links([{"autostart": True, "links": "\n".join(links), "packageName": anime_name}])
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
