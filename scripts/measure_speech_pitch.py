"""Rough voiced-frame F0 summary; not speaker identification or pitch copying."""
import json, subprocess, sys
import numpy as np

raw=subprocess.run(['ffmpeg','-v','error','-i',sys.argv[1],'-vn','-ac','1','-ar','16000','-f','f32le','-'],capture_output=True,check=True).stdout
audio=np.frombuffer(raw,np.float32);pitches=[]
for start in range(0,len(audio)-800,320):
    frame=audio[start:start+800].astype(float);frame-=frame.mean()
    if np.sqrt(np.mean(frame*frame))<.018: continue
    frame*=np.hanning(len(frame))
    spectrum=np.fft.rfft(frame,2048)
    corr=np.fft.irfft(spectrum*np.conj(spectrum),2048)[:400]
    if corr[0]<=0:continue
    lo,hi=46,246
    peaks=[i for i in range(lo,hi) if corr[i]>corr[i-1] and corr[i]>=corr[i+1] and corr[i]/corr[0]>.5]
    if not peaks:continue
    best=max(peaks,key=lambda i:corr[i]);pitches.append(16000/best)
print(json.dumps({'method':'approximate autocorrelation, 65-350Hz','voiced_frames':len(pitches),'median_hz':round(float(np.median(pitches)),1) if pitches else None,'quartiles_hz':[round(float(v),1) for v in np.percentile(pitches,[25,75])] if pitches else []}))
