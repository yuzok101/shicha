import sys,pickle,struct,numpy as np
sys.path.insert(0,'/tmp/mk')
from hebocr.lm import CharNGramLM
mc=int(sys.argv[1]); out=sys.argv[2]
lm=CharNGramLM.load('hebrew_char6.pkl')
def h(s):
    x=0x811c9dc5
    for u in struct.unpack('<%dH'%len(s), s.encode('utf-16-le')):
        x^=u; x=(x*0x01000193)&0xffffffff
    return x
d={}
coll=0
for n in range(1,lm.order+1):
    for k,v in lm.counts[n].items():
        if n>=3 and v<mc: continue
        hk=h(k)
        if hk in d: coll+=1; d[hk]=max(d[hk],v)
        else: d[hk]=v
keys=np.array(sorted(d),dtype=np.uint32); vals=np.array([d[k] for k in keys],dtype=np.uint32)
with open(out,'wb') as f:
    f.write(b'MKLM'); f.write(struct.pack('<IIdI',lm.order,len(keys),lm.backoff,lm.total)); f.write(keys.tobytes()); f.write(vals.tobytes())
print('entries',len(keys),'collisions',coll)
