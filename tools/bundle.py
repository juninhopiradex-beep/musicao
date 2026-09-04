import sys,os
ORDER=['util.js','formats.js','pcm.js','dsp.js','measure.js','draw.js','watermark.js','tags.js','register.js','validate.js','app.js']
def bundle(only=None):
    out=[]
    for f in ORDER:
        p=os.path.join('src/js',f)
        if not os.path.exists(p): continue
        if only and f not in only: continue
        out.append('/* ==== '+f+' ==== */\n'+open(p,encoding='utf-8').read())
    return '\n'.join(out)
if __name__=='__main__':
    only=sys.argv[2:] or None
    open(sys.argv[1],'w',encoding='utf-8').write(bundle(only))
