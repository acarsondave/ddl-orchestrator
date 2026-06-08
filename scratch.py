import os
import myjdapi
from dotenv import load_dotenv

load_dotenv("backend/.env")

jd = myjdapi.Myjdapi()
jd.set_app_key("AcarsonDDLOrchestrator")
jd.connect(os.environ.get("JD_EMAIL"), os.environ.get("JD_PASSWORD"))
device = jd.get_device(os.environ.get("JD_DEVICE_NAME"))

packages = device.downloads.query_packages([{
    "bytesLoaded": True,
    "bytesTotal": True,
    "status": True,
    "finished": True
}])
print(packages)
