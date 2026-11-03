#!/usr/bin/env node

import { parseAdbDevices, selectAdbDevice } from "../collectors/lib/adb.mjs";

const sample = `List of devices attached
127.0.0.1:5555 device product:sdk_gphone64_x86_64 model:Android_SDK device:emu64 transport_id:1
emulator-5556 unauthorized usb:1-2 transport_id:2
offline-1 offline transport_id:3
`;
const devices = parseAdbDevices(sample);
if (devices.length !== 3) throw new Error(`Expected 3 devices, got ${devices.length}`);
if (devices[0].properties.model !== "Android_SDK") throw new Error("ADB properties were not parsed");
if (selectAdbDevice(devices).serial !== "127.0.0.1:5555") throw new Error("Single authorized device selection failed");
if (selectAdbDevice(devices, "127.0.0.1:5555").state !== "device") throw new Error("Explicit device selection failed");
let unauthorizedRejected = false;
try { selectAdbDevice(devices, "emulator-5556"); } catch { unauthorizedRejected = true; }
if (!unauthorizedRejected) throw new Error("Unauthorized device was not rejected");
let multipleRejected = false;
try { selectAdbDevice([...devices, { serial: "second", state: "device", authorized: true, properties: {} }]); } catch { multipleRejected = true; }
if (!multipleRejected) throw new Error("Multiple devices did not require an explicit serial");
console.log("ADB adapter tests passed: parsing, authorization and device selection");
