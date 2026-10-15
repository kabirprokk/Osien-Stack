#!/usr/bin/env python3
"""Opt-in, coordinate-only X11 cursor tracker. No windows, screenshots, keys, or text."""
import ctypes, ctypes.util, json, os, time

OUT = os.path.expanduser('~/.config/opencode/.v3/visible/global-cursor.jsonl')
MAX_BYTES = 5 * 1024 * 1024

x11 = ctypes.CDLL(ctypes.util.find_library('X11'))
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XQueryPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_uint)]
x11.XQueryPointer.restype = ctypes.c_int
x11.XFlush.argtypes = [ctypes.c_void_p]

def rotate():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT) and os.path.getsize(OUT) >= MAX_BYTES:
        os.replace(OUT, OUT + '.1')

display = x11.XOpenDisplay(None)
if not display:
    raise SystemExit('X11 cursor tracking unavailable: use a GNOME on Xorg session')
root = x11.XDefaultRootWindow(display)
last = None
while True:
    r = ctypes.c_ulong(); c = ctypes.c_ulong(); rx=ctypes.c_int(); ry=ctypes.c_int(); wx=ctypes.c_int(); wy=ctypes.c_int(); mask=ctypes.c_uint()
    ok = x11.XQueryPointer(display, root, ctypes.byref(r), ctypes.byref(c), ctypes.byref(rx), ctypes.byref(ry), ctypes.byref(wx), ctypes.byref(wy), ctypes.byref(mask))
    if ok and (rx.value, ry.value) != last:
        rotate()
        with open(OUT, 'a', buffering=1) as f:
            f.write(json.dumps({'t': time.time_ns(), 'x': rx.value, 'y': ry.value}, separators=(',', ':')) + '\n')
        last = (rx.value, ry.value)
    time.sleep(0.05)
