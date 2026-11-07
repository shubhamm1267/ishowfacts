"""Preview exactly the same cover/contain crop used by reference media rendering."""
import argparse
from pathlib import Path
from PIL import Image

def crop_media(source, size, fit='cover', focus=None):
    width,height=size
    scale=max(width/source.width,height/source.height) if fit=='cover' else min(width/source.width,height/source.height)
    dw,dh=max(1,int(source.width*scale)),max(1,int(source.height*scale))
    dx,dy=(width-dw)//2,(height-dh)//2
    if focus and fit=='cover':
        dx=int(max(width-dw,min(0,width*.5-focus[0]*dw)))
        dy=int(max(height-dh,min(0,height*.5-focus[1]*dh)))
    if fit=='cover':
        box=(max(0,-dx*source.width/dw),max(0,-dy*source.height/dh),min(source.width,(width-dx)*source.width/dw),min(source.height,(height-dy)*source.height/dh))
        return source.resize(size,Image.Resampling.BICUBIC,box=box)
    output=Image.new('RGB',size,'black')
    output.paste(source.resize((dw,dh),Image.Resampling.BICUBIC),(dx,dy))
    return output

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source');parser.add_argument('output')
    parser.add_argument('--fit',choices=['cover','contain'],default='cover')
    parser.add_argument('--focus',nargs=2,type=float)
    parser.add_argument('--size',nargs=2,type=int,default=[1080,1378])
    args=parser.parse_args()
    if args.focus and any(v<0 or v>1 for v in args.focus):raise ValueError('Focus must be normalized')
    target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True)
    with Image.open(args.source) as image:
        crop_media(image.convert('RGB'),tuple(args.size),args.fit,args.focus).save(target,quality=90)
