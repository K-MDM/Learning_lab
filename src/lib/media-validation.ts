// Container inspection only. Playback/codec compatibility is verified separately.
export function validWav(bytes:Buffer){
  return bytes.length>=44&&bytes.length<=20*1024*1024&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE'&&bytes.readUInt32LE(4)+8===bytes.length;
}
