/* エフェクトカメラのシェーダー(WebGL の GLSL)。window.EffectCameraShaders
   共通部分(映像の取り出し・色温度)と、効果ごとの effect() を分けて持ち、使う効果の分だけ組み立てる。
   prm.x〜w は effect-camera-core.js の prmOf が渡す調整の値(スライダーの値そのまま、選ぶ物は番号) */
(function () {
  'use strict';

  var VS =
    'attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';

  var BASE = `precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform sampler2D pal;
uniform sampler2D prev;
uniform sampler2D prevSrc;
uniform sampler2D atlas;
uniform vec2 size;
uniform vec2 cover;
uniform vec2 center;
uniform vec4 prm;
uniform vec3 gains;
uniform float time;
uniform float dpr;
uniform float head;
const float PI=3.14159265;
vec2 toSrc(vec2 q){vec2 s=center+(q-0.5)*cover;s.y=1.0-s.y;return s;}
vec3 src(vec2 q){return min(texture2D(tex,toSrc(q)).rgb*gains,1.0);}
float luma(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);}
vec3 sat(vec3 c,float k){return mix(vec3(luma(c)),c,k);}
float edgeAt(vec2 q,float s){vec2 d=s/size;
  float tl=luma(src(q+vec2(-d.x,d.y))),tc=luma(src(q+vec2(0.0,d.y))),tr=luma(src(q+d));
  float ml=luma(src(q-vec2(d.x,0.0))),mr=luma(src(q+vec2(d.x,0.0)));
  float bl=luma(src(q-d)),bc=luma(src(q-vec2(0.0,d.y))),br=luma(src(q+vec2(d.x,-d.y)));
  return length(vec2(tr+2.0*mr+br-tl-2.0*ml-bl,tl+2.0*tc+tr-bl-2.0*bc-br));}
`;

  var POST = `vec3 post(vec3 c){return clamp(c,0.0,1.0);}
`;
  /* main の2種類: そのまま画面へ(仕上げ込み)/ 途中の絵として残す(仕上げなし。残像のように前の絵に重ねるため) */
  var MAIN_POST = 'void main(){gl_FragColor=vec4(post(effect()),1.0);}';
  var MAIN_RAW = 'void main(){gl_FragColor=vec4(clamp(effect(),0.0,1.0),1.0);}';

  /* 効果ごとの effect() */
  var FX = {
    normal: 'vec3 effect(){return src(uv);}',

    /* サーモ風: 粗く平均した明るさを、黒→紫→赤→黄→白の色の帯に置き換える(本当の温度ではない) */
    thermo: `vec3 effect(){
  float r=mix(1.5,14.0,prm.y/100.0)*dpr;float l=0.0;
  for(int i=-2;i<=2;i++)for(int j=-2;j<=2;j++){l+=luma(src(uv+vec2(float(i),float(j))*r*0.5/size));}
  l/=25.0;
  float v=clamp((l-0.5)*mix(0.8,2.4,prm.x/100.0)+0.45,0.0,1.0);
  return texture2D(pal,vec2(v*0.996+0.002,0.5)).rgb;}`,

    /* チルト: ピントの帯から離れるほど強くぼかし、色を濃くしてミニチュアのように見せる */
    tilt: `vec3 effect(){
  float cy=1.0-prm.x/100.0;float d=max(abs(uv.y-cy)-prm.y/200.0,0.0);float amt=min(1.0,d/0.35)*prm.z/100.0;
  float r=amt*size.y*0.022;vec3 s=vec3(0.0);
  for(int i=0;i<24;i++){float fi=float(i);float a=fi*2.39996;float rr=sqrt((fi+0.5)/24.0)*r;
    s+=src(uv+vec2(cos(a),sin(a))*rr/size);}
  vec3 c=sat(s/24.0,1.35);return (c-0.5)*1.08+0.52;}`,

    /* VHS: 走査線の揺れ・色のにじみとずれ・走る帯(トラッキング)・ざらつき */
    vhs: `vec3 effect(){
  float nz=prm.x/100.0,sh=prm.y/100.0;
  vec2 q=uv;float line=floor(gl_FragCoord.y/(2.0*dpr));float fr=floor(time*30.0);
  q.x+=(hash(vec2(line,fr))-0.5)*0.003*nz;
  float band=fract(time*0.06+0.3);float bd=abs(uv.y-band);
  if(bd<0.025)q.x+=(hash(vec2(line*1.7,fr))-0.5)*0.035*nz+0.006*nz;
  float off=0.007*sh;float px=2.0*dpr/size.x;
  float r=(src(q+vec2(off,0.0)).r+src(q+vec2(off*1.6,0.0)).r)*0.5;
  float g=(src(q).g+src(q+vec2(px,0.0)).g+src(q-vec2(px,0.0)).g)/3.0;
  float b=(src(q-vec2(off,0.0)).b+src(q-vec2(off*1.6,0.0)).b)*0.5;
  vec3 c=sat(vec3(r,g,b),0.8)*vec3(1.04,1.0,0.94);c=(c-0.5)*0.9+0.5;
  c*=0.9+0.1*sin(gl_FragCoord.y/dpr*PI);
  c+=(hash(gl_FragCoord.xy+fr)-0.5)*0.16*nz;
  if(bd<0.025)c+=hash(vec2(gl_FragCoord.x*0.05,line+fr))*0.18*nz;
  if(uv.y<0.035)c=mix(c,vec3(hash(vec2(gl_FragCoord.x*0.3,fr+line))),0.6*nz);
  vec2 v=uv-0.5;return c*(1.0-dot(v,v)*0.7);}`,

    /* 減色: 網点で少し散らしてから、置き換え表(32段の色の立方体)でいちばん近いパレットの色を引く。
       散らす幅はパレットの色の間隔の目安(色の数の3乗根の逆数) */
    /* ブラウン管: 丸みのある画面・赤緑青の縦じま・走査線・光のにじみ(画像編集から移した) */
    crt: `vec3 effect(){
  vec2 q=uv-0.5;q*=1.0+dot(q,q)*0.45*prm.x/100.0;q+=0.5;
  if(q.x<0.0||q.x>1.0||q.y<0.0||q.y>1.0)return vec3(0.0);
  vec3 a=src(q);vec2 o=2.5*dpr/size;
  vec3 glow=(src(q+vec2(o.x,0.0))+src(q-vec2(o.x,0.0))+src(q+vec2(0.0,o.y))+src(q-vec2(0.0,o.y)))*0.25;
  a=mix(a,max(a,glow),prm.y/100.0);
  float m=mod(floor(gl_FragCoord.x/dpr),3.0);
  vec3 mask=m<0.5?vec3(1.0,0.55,0.55):m<1.5?vec3(0.55,1.0,0.55):vec3(0.55,0.55,1.0);
  float scan=0.72+0.28*sin(gl_FragCoord.y/dpr*PI*0.66);
  vec3 c=a*mask*scan*1.45;
  vec2 v=q-0.5;c*=1.0-dot(v,v)*0.9;
  vec2 e=abs(q-0.5)*2.0;c*=smoothstep(1.0,0.97,max(e.x,e.y));
  return c;}`,

    /* 残像: 前の絵(prev)に今の絵を少しずつ重ねる。残る長さが長いほど前の絵を多く残す */
    trail: `vec3 effect(){
  vec3 c=src(uv);vec3 p=texture2D(prev,uv).rgb;
  return mix(c,p,0.5+0.45*prm.x/100.0);}`,

    /* スリットスキャン: 保存した直近24コマ(atlas 6×4)から、列(または行)ごとに古いコマを写す。
       左(または上)ほど新しく、反対側ほど古い */
    slit: `vec3 effect(){
  float t=prm.x<0.5?uv.x:1.0-uv.y;
  float k=floor(t*23.999);
  float idx=mod(head-k+24.0,24.0);
  vec2 slot=vec2(mod(idx,6.0),floor(idx/6.0));
  return texture2D(atlas,(slot+clamp(uv,0.002,0.998))/vec2(6.0,4.0)).rgb;}`,

    /* 動いた所に色: 前のコマ(prevSrc)との差が大きい所を、時間で移り変わる色で塗る。止まっている所は暗い白黒 */
    motion: `vec3 effect(){
  vec3 c=src(uv);vec3 p=texture2D(prevSrc,uv).rgb;
  float th=mix(0.25,0.03,prm.x/100.0);
  float m=smoothstep(th,th*2.0,length(c-p));
  float h=fract(time*0.15+uv.y*0.3);
  vec3 hue=clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
  return mix(vec3(luma(c))*0.45,hue*(0.6+0.6*luma(c)),m);}`,

    /* グリッチ: 帯や四角の単位で位置と色がずれる、デジタルの崩れ */
    glitch: `vec3 effect(){
  float a=prm.x/100.0;float fr=floor(time*12.0);vec2 q=uv;
  float band=floor(uv.y*(8.0+hash(vec2(fr,1.0))*24.0));
  if(hash(vec2(band,fr))<a*0.3)q.x+=(hash(vec2(band,fr+3.0))-0.5)*0.25*a;
  vec2 blk=floor(uv*vec2(10.0,14.0));bool hit=hash(blk+fr*1.31)<a*0.07;
  if(hit)q=floor(q*vec2(40.0,60.0))/vec2(40.0,60.0)+vec2(hash(blk+fr)-0.5,0.0)*0.1;
  float off=(0.004+0.02*hash(vec2(fr,7.0)))*a;
  vec3 c=vec3(src(q+vec2(off,0.0)).r,src(q).g,src(q-vec2(off,0.0)).b);
  if(hit&&hash(blk+fr+9.0)<0.5)c=vec3(1.0)-c;
  c*=0.94+0.06*step(0.5,fract(gl_FragCoord.y/(2.0*dpr)));
  return c;}`,
  };

  /* 映像をそのまま取り出すだけ(スリットスキャンの保存・前のコマの保存用) */
  var CAPTURE = 'vec3 effect(){return src(uv);}';
  /* 途中の絵を画面へ(仕上げ込み) */
  var BLIT = 'vec3 effect(){return texture2D(prev,uv).rgb;}';

  function build(body, raw) {
    return BASE + POST + body + '\n' + (raw ? MAIN_RAW : MAIN_POST);
  }
  window.EffectCameraShaders = { VS: VS, FX: FX, CAPTURE: CAPTURE, BLIT: BLIT, build: build };
})();
