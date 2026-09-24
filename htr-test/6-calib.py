import pickle,random,sys,glob,numpy as np
sys.path.insert(0,'/tmp/mk')
from PIL import Image,ImageDraw,ImageFont,ImageFilter,features
from hebocr.data.transforms import preprocess
random.seed(7)
words=[w for w,c in sorted(pickle.load(open('hebrew_words.pkl','rb'))['counts'].items(),key=lambda x:-x[1])[:5000]]
fonts=glob.glob('/tmp/fonts/*.ttf'); raqm=features.check('raqm'); print('raqm',raqm)
arrs=[]
for i in range(96):
    t=' '.join(random.choice(words) for _ in range(random.randint(2,7)))
    f=ImageFont.truetype(random.choice(fonts),random.randint(36,60))
    s=t if raqm else t[::-1]
    kw={'direction':'rtl'} if raqm else {}
    bb=ImageDraw.Draw(Image.new('L',(1,1))).textbbox((0,0),s,font=f,**kw)
    im=Image.new('RGB',(bb[2]+40,bb[3]+30),tuple([random.randint(200,250)]*3))
    ImageDraw.Draw(im).text((20,10),s,font=f,fill=tuple([random.randint(10,80)]*3),**kw)
    im=im.rotate(random.uniform(-2,2),expand=True,fillcolor=im.getpixel((0,0))).filter(ImageFilter.GaussianBlur(random.uniform(0,1.2)))
    arrs.append(preprocess(im)[None].astype(np.float32))
np.save('/tmp/mk/calib_shapes.npy',np.array([a.shape[-1] for a in arrs]))
pickle.dump(arrs,open('/tmp/mk/calib.pkl','wb'))
print(len(arrs),[a.shape for a in arrs[:3]])
