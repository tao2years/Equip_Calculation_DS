import { spawnSync } from "node:child_process";

export function parseAdbDevices(output) {
  const devices = [];
  for (const rawLine of String(output || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("List of devices attached") || line.startsWith("* daemon")) continue;
    const [serial, state, ...details] = line.split(/\s+/);
    if (!serial || !state) continue;
    const properties = {};
    for (const entry of details) {
      const separator = entry.indexOf(":");
      if (separator > 0) properties[entry.slice(0, separator)] = entry.slice(separator + 1);
    }
    devices.push({ serial, state, authorized: state === "device", properties });
  }
  return devices;
}

function runAdb(adbPath, args, options = {}) {
  return spawnSync(adbPath, args, {
    encoding: options.binary ? null : "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });
}

export function probeAdb(adbPath = "adb") {
  const version = runAdb(adbPath, ["version"]);
  if (version.error || version.status !== 0) {
    return {
      executable: false,
      adbPath,
      reason: version.error?.code === "ENOENT" ? "adb executable not found" : String(version.stderr || version.stdout || version.error?.message || "adb probe failed").trim()
    };
  }
  const listed = runAdb(adbPath, ["devices", "-l"]);
  if (listed.error || listed.status !== 0) {
    return { executable: false, adbPath, version: String(version.stdout).trim(), reason: String(listed.stderr || listed.stdout || listed.error?.message || "adb devices failed").trim() };
  }
  const devices = parseAdbDevices(listed.stdout);
  return {
    executable: true,
    adbPath,
    version: String(version.stdout).split(/\r?\n/)[0].trim(),
    devices,
    authorizedDevices: devices.filter((device) => device.authorized).length
  };
}

export function selectAdbDevice(devices, requestedSerial = null) {
  if (requestedSerial) {
    const device = devices.find((entry) => entry.serial === requestedSerial);
    if (!device) throw new Error(`ADB device ${requestedSerial} is not connected`);
    if (!device.authorized) throw new Error(`ADB device ${requestedSerial} is ${device.state}; authorize it in the emulator first`);
    return device;
  }
  const authorized = devices.filter((device) => device.authorized);
  if (authorized.length === 1) return authorized[0];
  if (authorized.length === 0) throw new Error("No authorized ADB device is connected");
  throw new Error(`Multiple authorized ADB devices are connected (${authorized.map((device) => device.serial).join(", ")}); pass --serial`);
}

export function captureAdbPng(adbPath, serial) {
  const result = runAdb(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], { binary: true });
  if (result.error || result.status !== 0) throw new Error(String(result.stderr || result.stdout || result.error?.message || "ADB screenshot failed").trim());
  const bytes = Buffer.from(result.stdout || []);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < signature.length || !bytes.subarray(0, signature.length).equals(signature)) {
    throw new Error(`ADB screencap did not return a PNG (${bytes.length} bytes)`);
  }
  return bytes;
}
