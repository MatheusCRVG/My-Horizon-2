"""Code-native PWA icon, rendered with the standard library (no bitmap editing)."""
import struct, zlib
from pathlib import Path
def icon(n):
    rows=[]
    for y in range(n):
        row=bytearray([0])
        for x in range(n):
            xx,yy=x/n,y/n
            # Geometric lowercase h, matching the code-native Horizon wordmark.
            near = .29 <= xx <= .39 and .25 <= yy <= .75
            near |= .59 <= xx <= .69 and .53 <= yy <= .75
            outer=((xx-.49)/.20)**2+((yy-.53)/.18)**2 <= 1
            inner=((xx-.49)/.10)**2+((yy-.53)/.09)**2 < 1
            near |= outer and not inner and yy <= .53
            dot=(xx-.76)**2+(yy-.73)**2 < .0011
            row.extend((127,168,255,255) if dot else (250,251,253,255) if near else (30,34,41,255))
        rows.append(row)
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',n,n,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')
root=Path(__file__).resolve().parent.parent/'public'
root.mkdir(exist_ok=True)
for n in [192,512]:(root/f'icon-{n}.png').write_bytes(icon(n))
