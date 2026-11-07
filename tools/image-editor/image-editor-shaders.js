/* 画像編集のシェーダー(WebGL の GLSL)。window.ImageEditorShaders
   共通部分(画像の取り出し・明るさ・雑音・輪郭・網点・色のフィルター)と、効果ごとの effect() を分けて持ち、使う効果の分だけ組み立てる。
   prm.x〜w は image-editor-core.js の prmOf が渡す調整の値。dpr は効果の大きさの倍率(長い辺 1000 画素で 1) */
(function () {
  'use strict';

  var VS =
    'attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';

  /* 画像はキャンバスと同じ縦横比で描くので、uv をそのまま使う(テクスチャは上の行から並ぶため上下だけ返す) */
  var BASE = `precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 size;
uniform vec4 prm;
uniform float dpr;
uniform float amount;
uniform sampler2D lut;
uniform sampler2D dith;
uniform float filt;
uniform float filtAmt;
const float time=0.0;
const float PI=3.14159265;
vec3 src(vec2 q){return texture2D(tex,vec2(q.x,1.0-q.y)).rgb;}
float luma(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);}
vec3 sat(vec3 c,float k){return mix(vec3(luma(c)),c,k);}
float b2(vec2 v){v=mod(v,2.0);return 2.0*abs(v.x-v.y)+v.y;}
float bayer(vec2 v){return (4.0*b2(v)+b2(floor(v/2.0))+0.5)/16.0;}
float bayer8(vec2 v){return (16.0*b2(v)+4.0*b2(floor(v/2.0))+b2(floor(v/4.0))+0.5)/64.0;}
float edgeAt(vec2 q,float s){vec2 d=s/size;
  float tl=luma(src(q+vec2(-d.x,d.y))),tc=luma(src(q+vec2(0.0,d.y))),tr=luma(src(q+d));
  float ml=luma(src(q-vec2(d.x,0.0))),mr=luma(src(q+vec2(d.x,0.0)));
  float bl=luma(src(q-d)),bc=luma(src(q-vec2(0.0,d.y))),br=luma(src(q+vec2(d.x,-d.y)));
  return length(vec2(tr+2.0*mr+br-tl-2.0*ml-bl,tl+2.0*tc+tr-bl-2.0*bc-br));}
`;
  /* 色のフィルター(番号は image-editor-core.js の FILTERS の並び)。filtAmt で元の色と混ぜる。
     赤外線風は、近赤外を強く返す草木(緑が勝つ色)を明るく、空(青が勝つ色)を暗くする近似 */
  var FILTER = `vec3 colorFilter(vec3 c){
  if(filt<0.5)return c;
  float l=luma(c);vec3 o;
  if(filt<1.5)o=vec3(dot(c,vec3(0.393,0.769,0.189)),dot(c,vec3(0.349,0.686,0.168)),dot(c,vec3(0.272,0.534,0.131)));
  else if(filt<2.5)o=vec3(smoothstep(0.02,0.98,l));
  else if(filt<3.5)o=mix(vec3(0.02,0.13,0.33),vec3(0.9,0.95,1.0),smoothstep(0.0,0.95,l));
  else if(filt<4.5){o=sat(c,0.7)*vec3(1.02,0.95,0.8)+vec3(0.05,0.04,0.02);o=0.08+o*0.86;}
  else if(filt<5.5)o=vec3(smoothstep(0.08,0.92,c.r),pow(c.g,0.8)*1.05,c.b*0.65+0.14);
  else if(filt<6.5){o=sat(c,1.15)+mix(vec3(-0.05,0.04,0.07),vec3(0.08,0.02,-0.07),smoothstep(0.25,0.8,l));}
  else if(filt<7.5)o=mix(vec3(0.13,0.1,0.36),vec3(1.0,0.8,0.56),smoothstep(0.05,0.95,l));
  else if(filt<8.5){float ir=luma(c)*0.6+max(0.0,c.g-max(c.r,c.b))*2.5-max(0.0,c.b-max(c.r,c.g))*1.5;
    o=vec3(smoothstep(0.03,0.85,ir))*vec3(1.0,0.97,0.98);}
  else if(filt<9.5){float v=clamp(l*1.3+(hash(gl_FragCoord.xy+floor(time*24.0))-0.5)*0.18,0.0,1.0);
    vec2 d=uv-0.5;o=vec3(0.22,0.95,0.38)*v*(1.0-dot(d,d)*1.6);}
  else{float k=clamp(floor(l*4.0+bayer(floor(gl_FragCoord.xy/dpr))-0.5),0.0,3.0);
    o=k<0.5?vec3(0.07,0.17,0.09):k<1.5?vec3(0.2,0.37,0.16):k<2.5?vec3(0.5,0.64,0.25):vec3(0.79,0.86,0.52);}
  return mix(c,clamp(o,0.0,1.0),filtAmt);
}
`;

  /* 効果の強さ(amount)で元の画像と混ぜてから、色のフィルターを掛ける */
  var MAIN =
    'void main(){gl_FragColor=vec4(clamp(colorFilter(mix(src(uv),clamp(effect(),0.0,1.0),amount)),0.0,1.0),1.0);}';

  /* 効果ごとの effect() */
  var FX = {
    none: 'vec3 effect(){return src(uv);}',

    /* アニメ調: 明るさを数段に分けて塗り(色合いは残す)、輪郭に黒い線 */
    anime: `vec3 effect(){
  vec2 o=1.5*dpr/size;
  vec3 a=(src(uv)*2.0+src(uv+vec2(o.x,0.0))+src(uv-vec2(o.x,0.0))+src(uv+vec2(0.0,o.y))+src(uv-vec2(0.0,o.y)))/6.0;
  float l=max(luma(a),0.03);float n=prm.x;
  float lq=(floor(l*n)+0.6)/n;
  vec3 c=sat(clamp(a*(lq/l),0.0,1.0),1.35);
  float line=smoothstep(0.25,0.6,edgeAt(uv,1.4*dpr))*prm.y/100.0;
  return mix(c,vec3(0.07,0.07,0.1),line);}`,

    /* 油絵風(桑原フィルター): まわりを4つの四角に分け、色のばらつきがいちばん小さい四角の平均を使う。
       筆で塗ったような平らな面と、くっきりした境目になる */
    oil: `vec4 quad(vec2 dir,float st){vec3 m=vec3(0.0),s=vec3(0.0);
  for(int j=0;j<4;j++)for(int i=0;i<4;i++){vec3 c=src(uv+dir*vec2(float(i),float(j))*st/size);m+=c;s+=c*c;}
  m/=16.0;s=abs(s/16.0-m*m);return vec4(m,s.r+s.g+s.b);}
vec3 effect(){
  float st=prm.x*dpr/3.0;
  vec4 a=quad(vec2(-1.0,-1.0),st),b=quad(vec2(1.0,-1.0),st),c=quad(vec2(-1.0,1.0),st),d=quad(vec2(1.0,1.0),st);
  vec4 m=a;if(b.w<m.w)m=b;if(c.w<m.w)m=c;if(d.w<m.w)m=d;
  float canvas=0.94+0.06*noise(gl_FragCoord.xy/(2.0*dpr));
  return sat(m.rgb,1.15)*canvas;}`,

    /* 水彩風: ゆらいだにじみ、輪郭の色だまり、顔料のざらつき、紙の白さと質感 */
    watercolor: `vec3 effect(){
  float r=(2.0+7.0*prm.x/100.0)*dpr;vec3 s=vec3(0.0);
  for(int i=0;i<12;i++){float fi=float(i);float a=fi*2.39996+noise(gl_FragCoord.xy/(9.0*dpr))*3.0;
    float rr=sqrt((fi+0.5)/12.0)*r;s+=src(uv+vec2(cos(a),sin(a))*rr/size);}
  vec3 c=s/12.0;
  c=floor(c*7.0+0.5)/7.0*0.35+c*0.65;
  float e=smoothstep(0.08,0.5,edgeAt(uv,2.0*dpr));
  c*=1.0-e*0.28;
  c=mix(c,vec3(1.0),0.12);
  c*=0.9+0.1*noise(gl_FragCoord.xy/(2.5*dpr));
  float paper=prm.y/100.0*(noise(gl_FragCoord.xy/(1.2*dpr))-0.5)*0.16;
  return sat(c,1.1)+paper;}`,

    /* 点描: ずらして並べた丸い点を、上下の重なりをつけて描く。点の色は元の色を少し鮮やかに */
    pointillism: `vec3 effect(){
  float cs=prm.x*dpr;vec2 g=gl_FragCoord.xy/cs;vec2 ip=floor(g);
  vec3 col=vec3(0.97,0.96,0.92);float top=-1.0;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 id=ip+vec2(float(x),float(y));
    vec2 ctr=id+0.5+(vec2(hash(id),hash(id+7.13))-0.5)*0.9;
    float rad=0.62+0.22*hash(id+3.3);float d=length(g-ctr)/rad;float depth=hash(id+1.9);
    if(d<1.0&&depth>top){top=depth;
      vec3 c=src(ctr*cs/size);c=sat(c,1.5)+(vec3(hash(id+5.0),hash(id+6.0),hash(id+8.0))-0.5)*0.12;
      col=c*(0.92+0.08*(1.0-d));}}
  return col;}`,

    /* クレヨン: 斜めの筋で紙の白が残る塗り。筆圧が強いほど濃く塗れる */
    crayon: `vec3 effect(){
  vec2 f=gl_FragCoord.xy/dpr;
  vec3 a=sat(src(uv),1.3)*1.05;
  float streak=noise(vec2(dot(f,vec2(0.71,0.71))/1.6,dot(f,vec2(-0.71,0.71))/18.0));
  float grain=hash(floor(f/1.5));
  float p=prm.x/100.0;
  float cover=smoothstep(0.3,0.7,streak*0.6+grain*0.3+(1.0-luma(a))*0.35+(p-0.5)*0.7);
  vec3 c=mix(vec3(0.98,0.97,0.94),a,cover);
  float e=smoothstep(0.15,0.5,edgeAt(uv,1.5*dpr));
  return c*(1.0-e*0.35);}`,
    /* ドット絵: 升目の中心の色を取り、網点(Bayer 4×4)を使って色の段階を減らす */
    pixel: `vec3 effect(){
  float b=prm.x*dpr;vec2 cell=floor(gl_FragCoord.xy/b);vec2 q=(cell+0.5)*b/size;vec2 o=0.25*b/size;
  vec3 a=(src(q)+src(q+o)+src(q-o)+src(q+vec2(o.x,-o.y)))*0.25;
  float n=prm.y-1.0;a=pow(a,vec3(0.9))*1.06;
  return clamp(floor(a*n+0.5+(bayer(cell)-0.5)*0.7)/n,0.0,1.0);}`,

    /* 線画: 明るさの変わり目を線にし、暗い所に斜線の陰影。線の色(黒/元の色)と塗り(なし/淡く/元の色)を選べる */
    sketch: `vec3 effect(){
  float line=smoothstep(0.1,0.45,edgeAt(uv,1.3*dpr)*mix(0.5,2.6,prm.x/100.0));
  vec3 col=src(uv);float l=luma(col);
  float h1=step(0.55,fract((gl_FragCoord.x+gl_FragCoord.y)/(5.0*dpr)));
  float h2=step(0.55,fract((gl_FragCoord.x-gl_FragCoord.y)/(5.0*dpr)));
  float shade=prm.y/100.0*(h1*smoothstep(0.55,0.2,l)+h2*smoothstep(0.3,0.05,l))*0.7;
  float ink=clamp(line*0.92+shade,0.0,1.0);
  vec3 paper=vec3(0.97,0.955,0.92);
  vec3 inkC=prm.z<0.5?vec3(0.13,0.14,0.22):sat(col,1.4)*0.55;
  vec3 base=prm.w<0.5?paper:prm.w<1.5?mix(paper,sat(col,1.2),0.45):sat(col,1.1)*1.05;
  return mix(base,inkC,ink);}`,

    reduce: `vec3 effect(){
  vec3 a=src(uv);float t=bayer(floor(gl_FragCoord.xy/dpr))-0.5;
  a=clamp(a+t*prm.y/100.0/pow(prm.x,1.0/3.0),0.0,1.0);
  vec3 q=floor(a*31.0+0.5);
  return texture2D(lut,vec2((q.r+q.b*32.0+0.5)/1024.0,(q.g+0.5)/32.0)).rgb;}`,

    /* 2色ディザ: 白か黒(または選んだ2色)の点だけで濃淡を表す。網点は 8×8 の Bayer で GPU が決め、
       誤差拡散・アトキンソンは CPU が決めた白黒の画像(dith、点1つが1画素)を引く */
    dither2: `vec3 effect(){
  float dot=prm.y*dpr;vec2 cell=floor(gl_FragCoord.xy/dot);float bit;
  if(prm.x<0.5){float l=pow(clamp((luma(src((cell+0.5)*dot/size))-0.5)*1.15+0.5,0.0,1.0),pow(2.0,(50.0-prm.z)/25.0));
    bit=step(bayer8(cell),l);}
  else bit=step(0.5,texture2D(dith,(cell+0.5)*dot/size).r);
  vec3 lo,hi;
  if(prm.w<0.5){lo=vec3(0.05);hi=vec3(0.96);}
  else if(prm.w<1.5){lo=vec3(0.11,0.13,0.25);hi=vec3(0.95,0.92,0.85);}
  else if(prm.w<2.5){lo=vec3(0.04,0.11,0.06);hi=vec3(0.5,1.0,0.6);}
  else if(prm.w<3.5){lo=vec3(0.04,0.16,0.37);hi=vec3(0.9,0.94,1.0);}
  else{lo=vec3(0.1,0.05,0.01);hi=vec3(1.0,0.7,0.28);}
  return mix(lo,hi,bit);}`,

    /* ハーフトーン: 角度を変えた網点(C 15° M 75° Y 0° K 45°)を重ねる印刷の再現。黒だけにもできる */
    halftone: `float dots(float ang,float v){float s=prm.x*dpr;float ca=cos(ang),sa=sin(ang);
  vec2 p=mat2(ca,-sa,sa,ca)*gl_FragCoord.xy/s;vec2 f=fract(p)-0.5;
  float r=sqrt(clamp(v,0.0,1.0))*0.72;return smoothstep(r+0.06,r-0.06,length(f));}
vec3 effect(){
  vec3 c=src(uv);
  if(prm.y>0.5){float k=dots(0.785,1.0-luma(c));return mix(vec3(0.97,0.96,0.93),vec3(0.08),k);}
  float K=1.0-max(c.r,max(c.g,c.b));float ik=max(1.0-K,0.001);
  float C=(1.0-c.r-K)/ik,M=(1.0-c.g-K)/ik,Y=(1.0-c.b-K)/ik;
  vec3 o=vec3(0.97,0.96,0.93);
  o*=1.0-dots(0.262,C)*vec3(0.95,0.25,0.0);
  o*=1.0-dots(1.309,M)*vec3(0.1,0.9,0.3);
  o*=1.0-dots(0.0,Y)*vec3(0.0,0.08,0.9);
  o*=1.0-dots(0.785,K*0.9)*0.9;
  return o;}`,

    /* 電光掲示板: 丸い粒が並ぶ表示。明るさは4段、消えている粒もうっすら見える */
    led: `vec3 effect(){
  float cs=prm.x*dpr;vec2 cell=floor(gl_FragCoord.xy/cs);vec2 f=fract(gl_FragCoord.xy/cs)-0.5;
  vec3 a=src((cell+0.5)*cs/size);
  vec3 c=prm.y<0.5?sat(a,1.4):vec3(1.0,0.55,0.12)*luma(a);
  c=floor(c*4.0+0.5)/4.0;
  float d=length(f);float dotm=smoothstep(0.42,0.3,d);
  vec3 off=prm.y<0.5?vec3(0.06):vec3(0.08,0.04,0.01);
  return mix(vec3(0.02),max(c,off),dotm)+c*smoothstep(0.5,0.2,d)*0.15;}`,

    /* モザイク: 四角か六角のタイル。目地を少し暗く、タイルの角に光を */
    mosaic: `vec3 effect(){
  float cs=prm.x*dpr;vec2 p=gl_FragCoord.xy/cs;vec2 ctr;float edge;
  if(prm.y<0.5){vec2 ip=floor(p);ctr=ip+0.5;vec2 f=fract(p);edge=min(min(f.x,f.y),min(1.0-f.x,1.0-f.y));
    vec3 c=src(ctr*cs/size);c*=0.9+0.12*(f.x-f.y);return c*mix(0.55,1.0,smoothstep(0.0,0.07,edge));}
  vec2 r=vec2(1.0,1.732);vec2 h=r*0.5;vec2 a=mod(p,r)-h;vec2 b=mod(p-h,r)-h;
  vec2 gv=dot(a,a)<dot(b,b)?a:b;ctr=p-gv;
  vec2 q=abs(gv);edge=0.5-max(dot(q,normalize(vec2(1.0,1.732))),q.x);
  vec3 c=src(ctr*cs/size);c*=0.92+0.1*(gv.x-gv.y);
  return c*mix(0.55,1.0,smoothstep(0.0,0.06,edge));}`,

    /* ステンドグラス: ずらした点のまわりの領域(ボロノイ)をガラス片にし、境目に鉛の線 */
    stained: `vec3 effect(){
  float cs=prm.x*dpr;vec2 p=gl_FragCoord.xy/cs;vec2 ip=floor(p);
  float d1=9.0,d2=9.0;vec2 best=ip;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 id=ip+vec2(float(x),float(y));
    vec2 c=id+0.5+(vec2(hash(id),hash(id+4.7))-0.5)*0.85;float d=length(p-c);
    if(d<d1){d2=d1;d1=d;best=c;}else if(d<d2)d2=d;}
  vec3 glass=sat(src(best*cs/size),1.6)*1.1;
  glass*=0.85+0.25*noise(gl_FragCoord.xy/(4.0*dpr))+0.1*(1.0-d1);
  float lead=smoothstep(0.03,0.07,d2-d1);
  return mix(vec3(0.08,0.08,0.09),glass,lead);}`,

    /* 浮き彫り: 明るさの斜めの差で、左上から光が当たったような凹凸に */
    emboss: `vec3 effect(){
  vec2 o=1.5*dpr/size;
  float d=luma(src(uv-o))-luma(src(uv+o));
  float v=0.5+d*mix(1.0,6.0,prm.x/100.0);
  if(prm.y<0.5)return vec3(v)*vec3(1.0,0.98,0.95);
  return clamp(src(uv)*(v*1.4-0.2),0.0,1.0);}`,

    /* ネオン輪郭: 輪郭を元の色相の鮮やかな光にし、黒い背景に光のにじみを足す */
    neon: `vec3 effect(){
  float w=mix(1.0,3.5,prm.y/100.0)*dpr;
  float e1=smoothstep(0.08,0.4,edgeAt(uv,w));float e2=smoothstep(0.05,0.35,edgeAt(uv,w*3.0));
  vec3 col=src(uv);col=sat(col,3.0);col=col/max(max(col.r,max(col.g,col.b)),0.15);
  return col*(e1*1.3+e2*0.45)*mix(0.5,1.6,prm.x/100.0);}`,
  };

  function build(body) {
    return BASE + FILTER + body + '\n' + MAIN;
  }
  window.ImageEditorShaders = { VS: VS, FX: FX, build: build };
})();
