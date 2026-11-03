/* レンズカメラのシェーダー(WebGL の GLSL)。window.LensCameraShaders
   共通部分(映像の取り出し・ぼかし)と、レンズごとの lens() を分けて持ち、使うレンズの分だけ組み立てる。
   prm.x〜w は lens-camera-core.js の prmOf が渡す調整の値。ブラウザには奥行きの情報が無いので、
   ボケは「画面の中心(やピントの帯)から離れるほどぼかす」近似で作る。
   ぼかしの点は画素ごとに回して並べ、少ない点でも像が何重にもずれて見えないようにする */
(function () {
  'use strict';

  var VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';

  var BASE = `precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 size;
uniform vec2 cover;
uniform vec4 prm;
uniform float theta;
uniform float dpr;
uniform float time;
const float PI=3.14159265;
vec3 at(vec2 q){vec2 s=0.5+(q-0.5)*cover;s.y=1.0-s.y;return texture2D(tex,s).rgb;}
float luma(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 sat(vec3 c,float k){return mix(vec3(luma(c)),c,k);}
vec2 asp(){return vec2(size.x/size.y,1.0);}
float rad(vec2 q){return length((q-0.5)*asp())/(length(asp())*0.5);}
vec3 disc(vec2 q,float r,float hi,vec2 st){vec3 s=vec3(0.0);float ws=0.0;
  float j=hash(gl_FragCoord.xy)*6.2832;
  for(int i=0;i<28;i++){float fi=float(i);float a=fi*2.39996+j;float rr=sqrt((fi+0.5)/28.0)*r;
    vec3 c=at(q+vec2(cos(a),sin(a))*st*rr/size);float w=1.0+hi*pow(luma(c),4.0)*10.0;s+=c*w;ws+=w;}
  return s/ws;}
`;
  var MAIN = 'void main(){gl_FragColor=vec4(clamp(lens(),0.0,1.0),1.0);}';

  /* レンズごとの lens() */
  var LENS = {
    standard: 'vec3 lens(){return at(uv);}',

    /* 魚眼(等距離射影。lens-camera-core.js の fisheyeUV と同じ式): 出力の半径を角度とみなし、tan で普通のレンズ上の位置へ戻す。
       円周は円の外を黒にして縁をなめらかに、どちらも周辺を少し暗くする */
    fisheye: `vec3 lens(){
  bool circle=prm.x<0.5;vec2 p=(uv-0.5)*size;
  float R=circle?min(size.x,size.y)*0.5:length(size)*0.5;float r=length(p)/R;
  float k=r<1e-4?theta/tan(theta):tan(min(r,1.0)*theta)/tan(theta)/r;
  vec3 c=at(0.5+p*k/size);
  if(circle)c*=smoothstep(1.0,0.985,r);
  return c*(1.0-0.25*r*r*theta/1.42);}`,

    /* 広角: 樽型のゆがみ(lens-camera-core.js の barrel と同じ式)、周辺ほど強い色のにじみ、周辺減光 */
    wide: `vec3 lens(){
  float r=rad(uv);float k=prm.x/100.0*0.6;float s=(1.0+k*r*r)/(1.0+k);float ca=0.006*k*r*r;
  vec3 c=vec3(at(0.5+(uv-0.5)*s*(1.0+ca)).r,at(0.5+(uv-0.5)*s).g,at(0.5+(uv-0.5)*s*(1.0-ca)).b);
  return c*(1.0-prm.y/100.0*0.6*r*r);}`,

    /* 望遠・ポートレート: 少し拡大し(望遠で背景が大きく写る感じ)、中央少し上の楕円の外を玉ボケでぼかす */
    portrait: `vec3 lens(){
  float tele=prm.z/10.0;vec2 q=0.5+(uv-0.5)/tele;
  vec2 d=(uv-vec2(0.5,0.55))*asp();float e=length(d*vec2(1.0,0.75));
  float f=prm.y/100.0*0.45+0.08;float amt=smoothstep(f,f+0.22,e);
  float r=amt*prm.x/100.0*size.y*0.035;
  return mix(at(q),disc(q,r,1.0,vec2(1.0)),clamp(r/2.0,0.0,1.0));}`,

    /* マクロ: 2倍に寄り、ピントの合う小さな円の外を強くぼかす。色は少し鮮やかに */
    macro: `vec3 lens(){
  vec2 q=0.5+(uv-0.5)/2.0;float e=length((uv-0.5)*asp());
  float f=prm.y/100.0*0.3+0.04;float amt=smoothstep(f,f+0.12,e);
  float r=amt*prm.x/100.0*size.y*0.032;
  return sat(mix(at(q),disc(q,r,0.6,vec2(1.0)),clamp(r/2.0,0.0,1.0)),1.15);}`,

    /* ティルトシフト: 傾けられるピントの帯から離れるほどぼかし、色を濃くしてミニチュアのように見せる */
    tiltshift: `vec3 lens(){
  float ang=prm.w*PI/180.0;vec2 n=vec2(-sin(ang),cos(ang));
  vec2 p=(uv-0.5)*asp();vec2 c0=vec2(0.0,0.5-prm.x/100.0);
  float d=max(abs(dot(p-c0,n))-prm.y/200.0,0.0);float amt=min(1.0,d/0.35)*prm.z/100.0;
  vec3 c=disc(uv,amt*size.y*0.025,0.6,vec2(1.0));
  return (sat(c,1.35)-0.5)*1.08+0.52;}`,

    /* ソフトフォーカス: ぼかした絵を重ねて柔らかくし、明るい所の光をにじませる */
    soft: `vec3 lens(){
  vec3 c=at(uv);vec3 b=disc(uv,1.0+prm.x/100.0*size.y*0.02,0.0,vec2(1.0));
  c=mix(c,b,prm.y/100.0*0.55);
  c+=b*smoothstep(0.45,1.0,luma(b))*prm.x/100.0*0.6;
  return mix(c,vec3(1.0),0.03);}`,

    /* オールドレンズ: 周辺ほど円を描くように流れるボケ(ぐるぐるボケ)、色のにじみ、
       低めのコントラストと暖かい色、明るい所のにじみと全体にかぶる光(フレア) */
    oldlens: `vec3 lens(){
  vec2 p=(uv-0.5)*asp();float r=rad(uv);float sw=prm.x/100.0*0.22*r*r;
  vec3 s=vec3(0.0);float ws=0.0;
  for(int i=0;i<16;i++){float t=(float(i)/15.0-0.5)*sw;float cs=cos(t),sn=sin(t);
    vec2 q=0.5+vec2(p.x*cs-p.y*sn,p.x*sn+p.y*cs)/asp();vec3 c=at(q);float w=1.0+pow(luma(c),4.0)*6.0;s+=c*w;ws+=w;}
  vec3 c=s/ws;
  float ca=prm.y/100.0*0.01*r;
  c.r=mix(c.r,at(0.5+(uv-0.5)*(1.0+ca)).r,0.7);c.b=mix(c.b,at(0.5+(uv-0.5)*(1.0-ca)).b,0.7);
  c=mix(vec3(0.5),c,0.88)+0.03;c*=vec3(1.04,1.0,0.92);
  c+=vec3(1.0,0.8,0.55)*(smoothstep(0.75,1.0,luma(c))*0.15+0.07*(1.0-r))*prm.z/100.0;
  return c*(1.0-0.3*r*r);}`,

    /* アナモルフィック: 明るい所から横に伸びる青い光の筋、縦長のボケ、映画のような横長(2.39:1)の黒帯 */
    anamorphic: `vec3 lens(){
  vec3 c=mix(at(uv),disc(uv,prm.y/100.0*size.y*0.012,1.0,vec2(0.55,1.0)),prm.y/100.0);
  float st=0.0;
  for(int i=-12;i<=12;i++){float fi=float(i);vec3 s=at(uv+vec2(fi*7.0*dpr/size.x,0.0));
    st+=max(luma(s)-0.72,0.0)*exp(-abs(fi)/5.0);}
  c+=vec3(0.3,0.55,1.0)*st*prm.x/100.0*0.9;
  c*=vec3(0.97,1.0,1.04);
  if(prm.z<0.5){float vis=size.x/2.39;if(abs(uv.y-0.5)*size.y>vis*0.5)c=vec3(0.0);}
  return c;}`,

    /* トイカメラ: 強い周辺減光と周辺のぼけ、こってりした色、片隅からの光漏れ */
    toy: `vec3 lens(){
  float r=rad(uv);
  vec3 c=mix(at(uv),disc(uv,r*r*size.y*0.014,0.0,vec2(1.0)),smoothstep(0.3,0.9,r));
  c=(sat(c,1.45)-0.5)*1.25+0.5;c*=vec3(1.05,1.02,0.86);
  c*=1.0-prm.x/100.0*0.85*smoothstep(0.25,1.05,r);
  vec2 l1=uv-vec2(0.95,0.88),l2=uv-vec2(0.02,0.12);
  c+=(vec3(1.0,0.45,0.15)*exp(-dot(l1,l1)*7.0)+vec3(0.9,0.2,0.5)*exp(-dot(l2,l2)*14.0)*0.5)*prm.y/100.0*0.7;
  return c;}`,

    /* ピンホール: 全体が甘く、周辺がぐっと暗く、少しざらつく */
    pinhole: `vec3 lens(){
  float r=rad(uv);
  vec3 c=sat(disc(uv,1.0+prm.x/100.0*size.y*0.008,0.0,vec2(1.0)),0.8);
  c*=1.0-prm.y/100.0*0.9*pow(r,1.6);
  return c+(hash(gl_FragCoord.xy+floor(time*24.0))-0.5)*0.05;}`,

    /* プリズム: まわりに少しずれた像を重ね、像ごとに虹の色を付ける */
    prism: `vec3 lens(){
  vec3 c=at(uv)*0.5;float n=prm.x;float off=prm.y/100.0*0.12;
  for(int i=0;i<6;i++){if(float(i)>=n)break;
    float a=float(i)/n*2.0*PI+0.3;vec2 o=vec2(cos(a),sin(a))*off/asp();vec3 g=at(uv+o);
    float h=fract(float(i)/n);vec3 t=clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
    g=mix(g,g*(0.4+t*1.2),prm.z/100.0);c+=g*0.5/n;}
  return c;}`,

    /* 拡大鏡: 拡大は cover で済ませ、輪郭を強めて細かい文字を読みやすくする */
    magnify: `vec3 lens(){
  vec3 m=at(uv);vec2 d=dpr*1.2/size;
  vec3 bl=(at(uv+vec2(d.x,0.0))+at(uv-vec2(d.x,0.0))+at(uv+vec2(0.0,d.y))+at(uv-vec2(0.0,d.y)))*0.25;
  return m+(m-bl)*prm.y/100.0*1.6;}`,
  };

  function build(body) {
    return BASE + body + '\n' + MAIN;
  }
  window.LensCameraShaders = { VS: VS, LENS: LENS, build: build };
})();
