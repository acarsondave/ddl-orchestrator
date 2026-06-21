import os
import myjdapi
jd = myjdapi.Myjdapi()
jd.set_app_key("AcarsonDDLOrchestrator")
jd.connect(os.environ.get("JD_EMAIL"), os.environ.get("JD_PASSWORD"))
device = jd.get_device(os.environ.get("JD_DEVICE_NAME"))
path = device.action("/config/get", ["org.jdownloader.settings.GeneralSettings", "null", "DefaultDownloadFolder"])
print("Default Path:", path)
