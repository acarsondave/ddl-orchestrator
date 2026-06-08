import myjdapi
import os

def push_to_jdownloader(anime_name: str, links: list[str]):
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
        
    device.linkgrabber.add_links([{"autostart": True, "links": ",".join(links), "packageName": anime_name}])
    return True
