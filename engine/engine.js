/* What-if engine: shared core for 9:16 low-poly Three.js shorts.
   A video only describes its scene; this file owns the stage, renderer, lights, fog,
   timeline loop, HUD (title, status line, counters, gauge), replay and keyboard controls.
   Load after three.js r128 as a classic script so videos open straight from disk.

   cfg.brand: false hides the channel signature, a string replaces the name.
   cfg.hud: 'editorial' = house style (Caslon title at the top, fading at cfg.titleFade [3, 3.8] s; the <em> word in
     orange capitals; Futura narration + counters, black with a white halo, centred low). Default: the original HUD.
   cfg.sound: true enables procedural audio. In update(): ctx.audio.set(bed, 0..1) every frame and
     ctx.audio.hit(name, {delay, strength}) for one-shots.
     Beds: rain wind snow ocean city hum drone birds crowd rotor bubble.
     Hits: thunder impact crash whoosh gull crack creak knock ({pitch, pan, ring}: the wooden Sahur "tung").
     fx.lightning fires thunder by itself.
     Recordings: cfg.samples ['weather/rain-concrete', ...] (see audio/README.md) are used by name like beds/hits.
   Seeks and exports run the simulation in fixed 1/60 s steps and reseed its randomness on every reset, so a run is
   reproducible; live playback uses sub-steps of at most 1/60 s that follow the display (smooth at any refresh rate).
   Scenes must take randomness from ctx.R / ctx.rnd / ctx.pick, never Math.random, and keep purely visual work
   behind `if (!ctx.fast)`.
   Keys: R restart · Space pause · H hide HUD · G show platform safe zones · M mute · F frame meter (fps, quality level)
         E export the soundtrack as WAV (same events as the video, for editing in CapCut etc.)
         1–9 jump to 10–90 % of the timeline (fast-forwarded, so state is consistent) */
(function(){
  'use strict';
  if (!window.THREE) { console.error('Engine: load three.js before engine.js'); }
  const THREE = window.THREE;
  // engine.js lives in <project>/engine/, the logo in <project>/brand/
  const MARK_URL = document.currentScript ? new URL('../brand/mark.svg', document.currentScript.src).href : '';
  const SAMPLE_URL = document.currentScript ? new URL('../audio/build/', document.currentScript.src).href : '';

  // ---------- math & randomness ----------
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
  const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
  const lerp = (a,b,k) => a + (b-a)*k;
  // 0 before a, 1 after b, eased in between: the building block of every timeline
  const smooth = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const col = h => new THREE.Color(h);

  // ---------- geometry baking ----------
  const PRIM = THREE ? {
    box:  new THREE.BoxGeometry(1,1,1).toNonIndexed(),
    cyl:  new THREE.CylinderGeometry(1,1,1,7).toNonIndexed(),
    cone: new THREE.ConeGeometry(1,1,7).toNonIndexed(),
    ico:  new THREE.IcosahedronGeometry(1,0),
  } : {};
  const _m=THREE&&new THREE.Matrix4(), _q=THREE&&new THREE.Quaternion(), _e=THREE&&new THREE.Euler(), _p=THREE&&new THREE.Vector3(), _s=THREE&&new THREE.Vector3();

  // Bakes many primitives into one vertex-coloured mesh: one draw call per chunk of world.
  // ao > 0 darkens vertices near y=0 over that many metres (cheap contact shadow).
  // Every vertex also gets a uv: facades added while `m.windows=true` map onto the window grid
  // (one texture tile = 8x8 windows of 3 m x 3.2 m, used by the cinematic look), anything else
  // samples the blank wall border of that texture.
  const WIN_U=24, WIN_V=25.6;
  class Merger{
    constructor(){ this.p=[]; this.n=[]; this.c=[]; this.uv=[]; this.windows=false; }
    add(src,x,y,z,sx,sy,sz,color,ao=0,ry=0){
      _e.set(0,ry,0); _q.setFromEuler(_e);
      _m.compose(_p.set(x,y,z),_q,_s.set(sx,sy,sz));
      const g = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(_m);
      g.computeVertexNormals();
      const P=g.attributes.position.array, N=g.attributes.normal.array;
      for(let i=0;i<P.length;i+=3){
        this.p.push(P[i],P[i+1],P[i+2]); this.n.push(N[i],N[i+1],N[i+2]);
        const f = ao ? 0.58 + 0.42*Math.min(1, Math.max(0,P[i+1])/ao) : 1;
        this.c.push(color.r*f, color.g*f, color.b*f);
        if (this.windows && Math.abs(N[i+1])<.5) this.uv.push((Math.abs(N[i])>.5 ? P[i+2] : P[i])/WIN_U, P[i+1]/WIN_V);
        else this.uv.push(.004,.004);
      }
      g.dispose();
    }
    box(...a){ this.add(PRIM.box,...a); }
    mesh(mat){
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
      g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
      g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
      const m=new THREE.Mesh(g,mat); m.castShadow=true; m.receiveShadow=true; return m;
    }
  }

  // ---------- reusable effects ----------
  const fx = {};

  // Streak rain in a box around the camera focus. update(dt, amount 0..1, floorY, focusZ)
  fx.rain = function(ctx, o={}){
    const count=o.count??7000, half=o.halfWidth??34, back=o.back??150, front=o.front??45,
          top=o.top??70, wind=o.wind??3.2, streak=o.streak??.045, maxOpacity=o.opacity??.38;
    const pos=new Float32Array(count*6), d=new Float32Array(count*4);
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.LineBasicMaterial({color:o.color??0xd3e0e8,transparent:true,opacity:0});
    const lines=new THREE.LineSegments(geo,mat); lines.frustumCulled=false; lines.visible=false;
    ctx.scene.add(lines);
    const R=(a,b)=>a+Math.random()*(b-a);   // own randomness: visual only, never shifts the scene's seeded sequence
    function seed(i,focus,any){ d[i*4]=R(-half,half); d[i*4+1]=any?R(0,top):R(top-8,top+2); d[i*4+2]=focus+R(-back,front); d[i*4+3]=R(34,46); }
    function reset(){ for(let i=0;i<count;i++) seed(i,0,true); }
    reset();
    return { reset, object: lines, update(dt, amount, floorY, focus){
      mat.opacity = maxOpacity*amount; lines.visible = amount > 0;
      if (!lines.visible || ctx.fast) return;
      const active=Math.floor(count*(.25+.75*amount)); geo.setDrawRange(0,active*2);
      for(let i=0;i<active;i++){
        const k=i*4; d[k+1]-=d[k+3]*dt; d[k]-=wind*dt;
        if(d[k+1]<floorY||d[k+2]>focus+front||d[k+2]<focus-back||d[k]<-half-2) seed(i,focus,false);
        const p=i*6; pos[p]=d[k]; pos[p+1]=d[k+1]; pos[p+2]=d[k+2];
        pos[p+3]=d[k]+wind*streak; pos[p+4]=d[k+1]+d[k+3]*streak; pos[p+5]=d[k+2];
      }
      geo.attributes.position.needsUpdate=true;
    }};
  };

  // Round soft dot shared by particle effects
  let dotTex=null;
  function dot(){
    if (dotTex) return dotTex;
    const c=document.createElement('canvas'); c.width=c.height=32;
    const g=c.getContext('2d'), r=g.createRadialGradient(16,16,0,16,16,16);
    r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(.45,'rgba(255,255,255,.85)'); r.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=r; g.fillRect(0,0,32,32);
    return dotTex=new THREE.CanvasTexture(c);
  }

  // Flakes (or ash, leaves, sparks) drifting through a box that wraps around a moving centre.
  // update(dt, amount 0..1, center{x,y,z}, half[x,y,z], wind{x,z} m/s, sizeScale)
  fx.snow = function(ctx, o={}){
    const count=o.count??9000, size=o.size??.28, maxOpacity=o.opacity??.9, fall=o.fall??[1.2,2.6], swirl=o.swirl??.9;
    const pos=new Float32Array(count*3), u=new Float32Array(count*3), d=new Float32Array(count*2);
    const R=(a,b)=>a+Math.random()*(b-a);   // visual only, like fx.rain
    for (let i=0;i<count;i++){ u[i*3]=Math.random(); u[i*3+1]=Math.random(); u[i*3+2]=Math.random(); d[i*2]=R(fall[0],fall[1]); d[i*2+1]=R(0,6.28); }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({color:o.color??0xffffff,size,map:dot(),transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});
    const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; pts.visible=false; ctx.scene.add(pts);
    let time=0;
    return { object: pts, update(dt, amount, c, half, wind={x:0,z:0}, sizeScale=1){
      mat.opacity=maxOpacity*Math.min(1,amount*1.6); pts.visible=amount>0;
      if (!pts.visible || ctx.fast) return;
      time+=dt; mat.size=size*sizeScale;
      const active=Math.floor(count*amount); geo.setDrawRange(0,active);
      const ix=dt/(2*half[0]), iy=dt/(2*half[1]), iz=dt/(2*half[2]);
      for (let i=0;i<active;i++){
        const k=i*3, ph=d[i*2+1];
        let x=u[k]+(wind.x+swirl*Math.sin(time*1.7+ph))*ix, y=u[k+1]-d[i*2]*iy, z=u[k+2]+(wind.z+swirl*Math.cos(time*1.3+ph))*iz;
        x-=Math.floor(x); y-=Math.floor(y); z-=Math.floor(z);
        u[k]=x; u[k+1]=y; u[k+2]=z;
        pos[k]=c.x+(x-.5)*2*half[0]; pos[k+1]=c.y+(y-.5)*2*half[1]; pos[k+2]=c.z+(z-.5)*2*half[2];
      }
      geo.attributes.position.needsUpdate=true;
    }};
  };

  // Faceted water sheet that follows the camera. update(t, level, focusZ, roughness 0..1)
  fx.water = function(ctx, o={}){
    const seg=o.segments??84, size=o.size??340, cell=size/seg;
    const geo=new THREE.PlaneGeometry(size,size,seg,seg); geo.rotateX(-Math.PI/2);
    const base=Float32Array.from(geo.attributes.position.array);
    const mesh=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({color:o.color??0x3b6470,specular:o.specular??0x9fb4c0,shininess:55,flatShading:true,transparent:true,opacity:o.opacity??.84}));
    mesh.receiveShadow=true; ctx.scene.add(mesh);
    return { mesh, update(t, level, focus, rough=0, swell=1){
      mesh.visible = level > -.3;
      if (ctx.fast) return;
      const sz=Math.round((focus-(o.ahead??50))/cell)*cell;
      mesh.position.set(0,level,sz);
      const P=geo.attributes.position.array, a=.06+.32*swell;
      for(let i=0;i<P.length;i+=3){
        const wx=base[i], wz=base[i+2]+sz;
        P[i+1]=a*(Math.sin(wx*.33+t*1.3)+.8*Math.sin(wz*.27-t*1.05)+.45*Math.sin((wx+wz)*.61+t*2.2))
              +.07*rough*Math.sin(wx*2.3+t*7)*Math.sin(wz*2.1-t*6.3);
      }
      geo.attributes.position.needsUpdate=true;
    }};
  };

  // Lightning flashes after `from` seconds; returns 0..1 brightness. Off under reduced motion.
  // With sound on, each flash fires a thunder hit (o.thunder: false to disable).
  fx.lightning = function(ctx, o={}){
    const from=o.from??14, min=o.min??6, max=o.max??13;
    let flash=0, next=from, n=0;
    return { reset(){ flash=0; next=from; n=0; }, update(t, dt, enabled=true){
      if (enabled && t>next){
        next=t+ctx.R(min,max);
        if (!ctx.reduceMotion) flash=1;
        // o.thunder: false = silent, a recording name or a list of names (taken in turn), default the synthetic one
        if (o.thunder!==false){ const th=Array.isArray(o.thunder) ? o.thunder[(n++)%o.thunder.length] : (o.thunder||'thunder');
          ctx.audio.hit(th,{delay:o.thunderDelay??.45, gain:o.thunderGain, pan:o.thunderPan?.[n%o.thunderPan.length]}); }
      }
      flash=Math.max(0,flash-dt*5.5);
      return flash*(flash>.55||flash<.3?1:.35);   // double-strike flicker
    }};
  };

  // ---------- procedural audio ----------
  // Beds are continuous layers with a level 0..1 (ctx.audio.set(name, level) every frame);
  // hits are one-shots (ctx.audio.hit(name, {delay, strength})). The same recipes build the live
  // graph and the offline render behind the WAV export, so the file matches what plays on screen.
  function makeNoise(ac){
    const len=ac.sampleRate*4, buf=ac.createBuffer(2,len,ac.sampleRate);
    for (let c=0;c<2;c++){ const d=buf.getChannelData(c); for(let i=0;i<len;i++) d[i]=Math.random()*2-1; }
    return buf;
  }
  const A_ = {
    src(ac,buf){ const s=ac.createBufferSource(); s.buffer=buf; s.loop=true; s.start(0, Math.random()*3); return s; },
    filt(ac,type,f,Q=.7){ const b=ac.createBiquadFilter(); b.type=type; b.frequency.value=f; b.Q.value=Q; return b; },
    gain(ac,v){ const g=ac.createGain(); g.gain.value=v; return g; },
    osc(ac,type,f){ const o=ac.createOscillator(); o.type=type; o.frequency.value=f; o.start(0); return o; },
    lfo(ac,f,depth,param){ const o=A_.osc(ac,'sine',f), g=A_.gain(ac,depth); o.connect(g).connect(param); },
  };
  // each recipe connects into `bed` (a gain the manager controls) and returns its full-level volume
  const BEDS = {
    rain(ac,n,bed){ A_.src(ac,n).connect(A_.filt(ac,'bandpass',3200,.6)).connect(A_.gain(ac,.55)).connect(bed);
                    A_.src(ac,n).connect(A_.filt(ac,'lowpass',900)).connect(A_.gain(ac,.9)).connect(bed); return .5; },
    wind(ac,n,bed){ const bp=A_.filt(ac,'bandpass',380,2.5), amp=A_.gain(ac,.65);
                    A_.lfo(ac,.11,220,bp.frequency); A_.lfo(ac,.07,.35,amp.gain);
                    A_.src(ac,n).connect(bp).connect(amp).connect(bed); return 1.1; },
    snow(ac,n,bed){ const lp=A_.filt(ac,'lowpass',600,.5); A_.lfo(ac,.08,200,lp.frequency);
                    A_.src(ac,n).connect(lp).connect(bed); return .45; },
    ocean(ac,n,bed){ const amp=A_.gain(ac,.55); A_.lfo(ac,.11,.45,amp.gain);
                     A_.src(ac,n).connect(A_.filt(ac,'lowpass',520)).connect(amp).connect(bed); return 1; },
    city(ac,n,bed){ A_.src(ac,n).connect(A_.filt(ac,'lowpass',180)).connect(A_.gain(ac,1)).connect(bed);
                    A_.src(ac,n).connect(A_.filt(ac,'bandpass',900,1)).connect(A_.gain(ac,.08)).connect(bed);
                    A_.osc(ac,'sine',60).connect(A_.gain(ac,.05)).connect(bed); return .6; },
    hum(ac,n,bed){ A_.osc(ac,'sawtooth',50).connect(A_.filt(ac,'lowpass',220)).connect(A_.gain(ac,.3)).connect(bed);
                   A_.osc(ac,'sine',100).connect(A_.gain(ac,.2)).connect(bed); return .35; },
    drone(ac,n,bed){ const lp=A_.filt(ac,'lowpass',500,1.2); A_.lfo(ac,.05,250,lp.frequency);
                     A_.osc(ac,'triangle',55).connect(lp); const o2=A_.osc(ac,'sawtooth',82.41); o2.detune.value=6; o2.connect(A_.gain(ac,.35)).connect(lp);
                     A_.osc(ac,'sine',110).connect(A_.gain(ac,.4)).connect(lp); lp.connect(bed); return .25; },
    // three warbling voices; product of a trill LFO and a slow phrase LFO gives chirps with pauses
    birds(ac,n,bed){ for (const [f,trill,phrase] of [[3300,7,.23],[4300,11,.17],[2700,5.5,.13]]){
                       const o=A_.osc(ac,'sine',f), g1=A_.gain(ac,0), g2=A_.gain(ac,0);
                       A_.lfo(ac,trill*1.9,f*.09,o.frequency); A_.lfo(ac,trill,1,g1.gain); A_.lfo(ac,phrase,1,g2.gain);
                       o.connect(g1).connect(g2).connect(bed); }
                     return .07; },
    // voice-band noise with syllable-rate wobble: distant chatter, no words
    crowd(ac,n,bed){ const lp=A_.filt(ac,'lowpass',2200); lp.connect(bed);
                     [[330,3.1],[540,4.3],[880,5.2],[1400,3.7]].forEach(([f,r])=>{
                       const g=A_.gain(ac,.5); A_.lfo(ac,r,.45,g.gain);
                       A_.src(ac,n).connect(A_.filt(ac,'bandpass',f,3.5)).connect(g).connect(lp); });
                     return 1.3; },
    // helicopter: low noise chopped by a square wave at blade rate
    rotor(ac,n,bed){ const g=A_.gain(ac,.5), sq=A_.osc(ac,'square',11.5); sq.connect(A_.gain(ac,.45)).connect(g.gain);
                     A_.src(ac,n).connect(A_.filt(ac,'lowpass',320,1.2)).connect(g).connect(bed);
                     A_.osc(ac,'sawtooth',23).connect(A_.filt(ac,'lowpass',140)).connect(A_.gain(ac,.12)).connect(bed); return 1; },
    // thick liquid simmering: low noise plus pitch-rising "blub" voices gated at uneven rates
    bubble(ac,n,bed){ A_.src(ac,n).connect(A_.filt(ac,'lowpass',260,.8)).connect(A_.gain(ac,.5)).connect(bed);
                      for (const [f,rate,gate] of [[210,3.1,1.3],[300,4.7,1.9],[160,2.3,.9],[380,6.1,2.6]]){
                        const o=A_.osc(ac,'sine',f), chirp=A_.osc(ac,'sawtooth',rate), cg=A_.gain(ac,f*.9);
                        chirp.connect(cg).connect(o.frequency);
                        const g1=A_.gain(ac,0), g2=A_.gain(ac,0); A_.lfo(ac,rate,.5,g1.gain); A_.lfo(ac,gate,.6,g2.gain);
                        o.connect(g1).connect(g2).connect(bed); }
                      return .5; },
  };
  function env(ac,g,when,peak,attack,decay){
    g.gain.setValueAtTime(0,when); g.gain.linearRampToValueAtTime(peak,when+attack);
    g.gain.exponentialRampToValueAtTime(.0001,when+attack+decay);
  }
  function burst(ac,n,out,when,type,f,peak,attack,decay,Q){
    const s=ac.createBufferSource(); s.buffer=n; const g=A_.gain(ac,0);
    s.connect(A_.filt(ac,type,f,Q)).connect(g).connect(out); env(ac,g,when,peak,attack,decay);
    s.start(when, Math.random()*3); s.stop(when+attack+decay+.1); return s;
  }
  const HITS = {
    thunder(ac,n,out,when,o){ const k=o.strength??1;
      burst(ac,n,out,when,'highpass',1200,.8*k,.01,.35);
      burst(ac,n,out,when+.05,'lowpass',140,1.6*k,.25,4.5); },
    impact(ac,n,out,when,o){ const k=o.strength??1, osc=ac.createOscillator(), g=A_.gain(ac,0);
      osc.frequency.setValueAtTime(90,when); osc.frequency.exponentialRampToValueAtTime(35,when+.4);
      osc.connect(g).connect(out); env(ac,g,when,.9*k,.005,.6); osc.start(when); osc.stop(when+.8);
      burst(ac,n,out,when,'lowpass',700,.6*k,.005,.3); },
    crash(ac,n,out,when,o){ const k=o.strength??1;
      HITS.impact(ac,n,out,when,o); burst(ac,n,out,when+.03,'highpass',600,.5*k,.02,1.5); },
    whoosh(ac,n,out,when,o){ const d=o.duration??.9, s=ac.createBufferSource(), bp=A_.filt(ac,'bandpass',300,1.5), g=A_.gain(ac,0);
      s.buffer=n; bp.frequency.setValueAtTime(300,when); bp.frequency.exponentialRampToValueAtTime(2400,when+d);
      g.gain.setValueAtTime(0,when); g.gain.linearRampToValueAtTime(.7*(o.strength??1),when+d*.6); g.gain.linearRampToValueAtTime(0,when+d);
      s.connect(bp).connect(g).connect(out); s.start(when); s.stop(when+d+.1); },
    // seagull: two or three falling "kyaa" calls
    gull(ac,n,out,when,o){ const k=o.strength??1, calls=o.calls??3;
      for (let i=0;i<calls;i++){ const w=when+i*.27, osc=ac.createOscillator(), g=A_.gain(ac,0), bp=A_.filt(ac,'bandpass',1700,1.4);
        osc.type='sawtooth'; osc.frequency.setValueAtTime(1250,w); osc.frequency.linearRampToValueAtTime(1500,w+.05); osc.frequency.exponentialRampToValueAtTime(820,w+.24);
        osc.connect(bp).connect(g).connect(out); env(ac,g,w,.32*k*(i?.8:1),.02,.22); osc.start(w); osc.stop(w+.3); } },
    // brittle crack: a sharp snap and a short run of crackles
    crack(ac,n,out,when,o){ const k=o.strength??1;
      burst(ac,n,out,when,'highpass',2200,.9*k,.002,.09);
      burst(ac,n,out,when,'lowpass',300,.7*k,.004,.35);
      [.05,.11,.14,.22,.31,.37].forEach((d,i)=>burst(ac,n,out,when+d,'bandpass',1500+i*350,.35*k*(1-i*.12),.002,.05,2)); },
    // timber under strain: a slow, wavering groan
    creak(ac,n,out,when,o){ const k=o.strength??1, d=o.duration??1.1, osc=ac.createOscillator(), g=A_.gain(ac,0), bp=A_.filt(ac,'bandpass',700,5);
      osc.type='sawtooth'; osc.frequency.setValueAtTime(52,when); osc.frequency.linearRampToValueAtTime(78,when+d*.4); osc.frequency.linearRampToValueAtTime(61,when+d);
      osc.connect(bp).connect(g).connect(out); env(ac,g,when,.8*k,.15,d); osc.start(when); osc.stop(when+d+.3); },
    // hollow wooden "tung" (the Sahur knock): three damped log modes and a stick click; o.pitch scales it, o.pan -1..1
    knock(ac,n,out,when,o){ const k=o.strength??1, p=o.pitch??1, dst=o.pan?ac.createStereoPanner():out;
      if(o.pan){ dst.pan.value=clamp(o.pan,-1,1); dst.connect(out); }
      [[178,1,.2],[178*2.71,.42,.075],[178*5.3,.16,.035]].forEach(([f,a,d])=>{ const osc=ac.createOscillator(), g=A_.gain(ac,0);
        osc.frequency.setValueAtTime(f*p*1.08,when); osc.frequency.exponentialRampToValueAtTime(f*p,when+.025);
        osc.connect(g).connect(dst); env(ac,g,when,.6*k*a,.002,d*(o.ring??1)); osc.start(when); osc.stop(when+d*(o.ring??1)+.06); });
      burst(ac,n,dst,when,'bandpass',2400*p,.45*k,.001,.022,1.3);
      burst(ac,n,dst,when,'lowpass',420*p,.35*k,.002,.06); },
  };
  function masterChain(ac){ const m=A_.gain(ac,.9), c=ac.createDynamicsCompressor(); m.connect(c).connect(ac.destination); return m; }

  // ---------- recorded sounds (audio/<category>/*.wav, prepared by tools/build-audio.mjs) ----------
  // A name with a slash ('weather/rain-concrete') is a recording: as a bed it loops seamlessly,
  // as a hit it plays once ({delay, gain, pan -1..1, rate, offset, duration}). List them in cfg.samples;
  // each is a script that registers base64 Opus in window.TC_SAMPLES, so it also works from file://.
  const SAMPLES = window.TC_SAMPLES = window.TC_SAMPLES || {};
  const isSample = n => n.indexOf('/') > 0;
  function loadSamples(names){
    return Promise.all(names.map(n => SAMPLES[n] ? null : new Promise(done => {
      const s=document.createElement('script'); s.src=SAMPLE_URL+n.replace('/','__')+'.js';
      s.onload=done; s.onerror=()=>{ console.warn('Sound not found: '+n+' (run node tools/build-audio.mjs)'); done(); };
      document.head.appendChild(s);
    })));
  }
  const decodedByCtx=new WeakMap();
  function sampleBuffer(ac,name){
    let m=decodedByCtx.get(ac); if(!m) decodedByCtx.set(ac, m=new Map());
    if(!m.has(name)){
      const s=SAMPLES[name];
      if(!s) m.set(name, Promise.resolve(null));
      else { const bin=atob(s.data), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
             m.set(name, ac.decodeAudioData(u.buffer).catch(e=>{ console.warn('Cannot decode '+name, e); return null; })); }
    }
    return m.get(name);
  }
  function sampleBed(ac,buf,bed){ const s=ac.createBufferSource(); s.buffer=buf; s.loop=true; s.connect(bed); s.start(0); return s; }
  function sampleHit(ac,buf,out,when,o){
    const s=ac.createBufferSource(); s.buffer=buf; if(o.rate) s.playbackRate.value=o.rate;
    const g=A_.gain(ac,o.gain??1); s.connect(g);
    if(o.pan && ac.createStereoPanner){ const p=ac.createStereoPanner(); p.pan.value=o.pan; g.connect(p).connect(out); } else g.connect(out);
    s.start(when, o.offset||0);
    if(o.duration){ g.gain.setValueAtTime(o.gain??1, when+Math.max(0,o.duration-.4)); g.gain.linearRampToValueAtTime(0, when+o.duration); s.stop(when+o.duration+.05); }
  }

  function createAudio(enabled){
    const A={ enabled, mode:'live', silent:false, t:0, rec:null, beds:Object.keys(BEDS), hits:Object.keys(HITS) };
    let ac=null, master=null, noise=null, muted=false;
    const live={};
    A.unlock=()=>{ if(!enabled) return;
      if(!ac){ ac=new AudioContext(); master=masterChain(ac); noise=makeNoise(ac); Object.keys(SAMPLES).forEach(n=>sampleBuffer(ac,n)); }
      if(ac.state!=='running') ac.resume(); };
    A.running=()=>!!ac && ac.state==='running';
    A.set=(name,level)=>{
      if(!enabled) return; level=clamp(level,0,1);
      if(A.mode==='record'){ const p=A.rec.last[name];
        if(p===undefined || Math.abs(p-level)>.01 || (level===0 && p!==0)){ A.rec.events.push({t:A.t,name,level}); A.rec.last[name]=level; }
        return; }
      if(!ac) return;
      let L=live[name];
      if(!L){ const bed=A_.gain(ac,0); bed.connect(master);
        if(isSample(name)){ L=live[name]={bed,base:1,level:0}; sampleBuffer(ac,name).then(b=>b&&sampleBed(ac,b,bed)); }
        else L=live[name]={bed,base:BEDS[name](ac,noise,bed),level:0}; }
      if(Math.abs(L.level-level)>.002){ L.level=level; L.bed.gain.setTargetAtTime(level*L.base, ac.currentTime, .12); }
    };
    A.hit=(name,o={})=>{
      if(!enabled || A.silent) return;
      if(A.mode==='record'){ A.rec.events.push({t:A.t,hit:name,o}); return; }
      if(!A.running()) return;
      if(isSample(name)){ const when=ac.currentTime+(o.delay||0); sampleBuffer(ac,name).then(b=>b&&sampleHit(ac,b,master,Math.max(when,ac.currentTime),o)); }
      else HITS[name](ac,noise,master,ac.currentTime+(o.delay||0),o);
    };
    A.pause=p=>{ if(ac) p ? ac.suspend() : ac.resume(); };
    A.toggleMute=()=>{ muted=!muted; if(master) master.gain.setTargetAtTime(muted?0:.9, ac.currentTime, .05); return muted; };
    // Offline render of recorded events -> AudioBuffer
    A.render=async(events,dur)=>{
      const sr=44100, oac=new OfflineAudioContext(2,Math.ceil(dur*sr),sr), m=masterChain(oac), n=makeNoise(oac), beds={};
      const used=[...new Set(events.map(e=>e.name||e.hit).filter(isSample))], buf={};
      await Promise.all(used.map(async k=>{ buf[k]=await sampleBuffer(oac,k); }));
      for(const ev of events){
        if(ev.name){ let L=beds[ev.name];
          if(!L){ const bed=A_.gain(oac,0); bed.connect(m);
            if(isSample(ev.name)){ L=beds[ev.name]={bed,base:1}; if(buf[ev.name]) sampleBed(oac,buf[ev.name],bed); }
            else L=beds[ev.name]={bed,base:BEDS[ev.name](oac,n,bed)}; }
          L.bed.gain.setTargetAtTime(ev.level*L.base, ev.t, .12); }
        else if(isSample(ev.hit)){ if(buf[ev.hit]) sampleHit(oac,buf[ev.hit],m,ev.t+(ev.o.delay||0),ev.o); }
        else HITS[ev.hit](oac,n,m,ev.t+(ev.o.delay||0),ev.o);
      }
      return oac.startRendering();
    };
    return A;
  }
  function wavBlob(buf){
    const ch=buf.numberOfChannels, len=buf.length, data=new DataView(new ArrayBuffer(44+len*ch*2));
    const w=(o,s)=>{ for(let i=0;i<s.length;i++) data.setUint8(o+i,s.charCodeAt(i)); };
    w(0,'RIFF'); data.setUint32(4,36+len*ch*2,true); w(8,'WAVE'); w(12,'fmt '); data.setUint32(16,16,true);
    data.setUint16(20,1,true); data.setUint16(22,ch,true); data.setUint32(24,buf.sampleRate,true);
    data.setUint32(28,buf.sampleRate*ch*2,true); data.setUint16(32,ch*2,true); data.setUint16(34,16,true);
    w(36,'data'); data.setUint32(40,len*ch*2,true);
    const chans=[...Array(ch)].map((_,c)=>buf.getChannelData(c));
    let o=44; for(let i=0;i<len;i++) for(let c=0;c<ch;c++){ const v=clamp(chans[c][i],-1,1); data.setInt16(o, v<0?v*0x8000:v*0x7fff, true); o+=2; }
    return new Blob([data],{type:'audio/wav'});
  }

  // ---------- DOM ----------
  function h(tag, cls, parent){ const e=document.createElement(tag); if(cls) e.className=cls; if(parent) parent.appendChild(e); return e; }

  function buildHud(stage, cfg){
    h('div','scrim top',stage); h('div','scrim bottom',stage);
    const head=h('header','title',stage);
    if (cfg.brand!==false){
      const b=h('div','brand',head), badge=h('span','badge',b), img=h('img','',badge);
      img.src=MARK_URL; img.alt=''; h('span','',b).textContent=cfg.brand||'Tiny Catastrophes';
    }
    const h1=h('h1','',head); h1.innerHTML=cfg.title||'';
    const status=h('p','status',head); status.textContent=cfg.statusStart||'';
    const out={ status };
    if (cfg.gauge){
      const g=cfg.gauge, gauge=h('div','gauge',stage); gauge.setAttribute('aria-hidden','true');
      h('div','gauge-cap',gauge).textContent=g.cap||'';
      h('div','gauge-board',gauge);
      const ticks=h('div','gauge-ticks',gauge), labels=h('div','gauge-labels',gauge);
      const minor=g.minor??1, step=g.step??5;
      for(let v=0; v<=g.max+1e-6; v+=minor){
        const i=h('i', Math.abs(v/step-Math.round(v/step))<1e-6?'major':'', ticks); i.style.bottom=(v/g.max*100)+'%';
      }
      for(let v=0; v<=g.max+1e-6; v+=step){ const s=h('span','',labels); s.textContent=String(v); s.style.bottom=(v/g.max*100)+'%'; }
      out.fill=h('div','gauge-fill',gauge); out.gaugeMax=g.max;
    }
    const read=h('footer','readout',stage);
    for (const key of ['main','side']){
      const c=cfg.counters&&cfg.counters[key]; if(!c) continue;
      const m=h('div','metric '+key,read);
      h('span','label',m).textContent=c.label;
      const v=h('span','value',m); const num=h('span','',v); const u=h('span','unit',v); u.textContent=c.unit||'';
      const sub=h('span','sub',m); sub.textContent=c.sub||'';
      out[key]={num,sub,decimals:c.decimals??0};
    }
    const replay=h('button','replay',stage); replay.type='button'; replay.textContent='Replay'; replay.hidden=true;
    out.replay=replay;
    const guides=h('div','safe-guides',stage); guides.hidden=true; h('div','t',guides); h('div','b',guides); h('div','r',guides);
    out.guides=guides;
    if (cfg.sound){ const s=h('button','sound-hint',stage); s.type='button'; s.textContent='Click to start with sound'; out.soundHint=s; }
    const toast=h('div','engine-toast',stage); toast.hidden=true; out.toast=toast;
    out.h1=h1;
    // hud: 'editorial' (house style since 2026-10-08): Caslon title centred at the top that fades out,
    // narration and counters in Futura, black with a white halo, centred in the lower part (styles in engine.css)
    if (cfg.hud==='editorial'){
      stage.classList.add('hud-editorial');
      const lower=h('div','lower',stage); lower.append(status, read);
    }
    return out;
  }

  // ---------- create ----------
  window.Engine = { fx, Merger, PRIM, clamp, lerp, smooth, col, mulberry32,
  create(cfg){
    // ?export: driven frame by frame by tools/export-video.mjs (no live loop, no buttons)
    const EXPORT=new URLSearchParams(location.search).has('export');
    const stage=h('div','stage',document.body);
    if (EXPORT) stage.classList.add('exporting');
    if (cfg.accent) stage.style.setProperty('--accent', cfg.accent);
    const canvas=h('canvas','',stage); canvas.setAttribute('aria-label', cfg.ariaLabel||'Animated low-poly scene');
    const hud=buildHud(stage,cfg);
    const fail=msg=>{ const p=h('p','engine-fail',stage); p.textContent=msg; };
    if(!THREE){ fail('Three.js did not load.'); return; }
    let renderer;
    try{ renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:EXPORT||!!cfg.preserveDrawingBuffer}); }
    catch(e){ fail('WebGL is not available in this browser.'); return; }
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;

    // setup() draws the world from `seed`; every reset() reseeds a second stream, so a run is
    // reproducible: live playback, seek and the WAV export all see the same random events.
    let rng=mulberry32(cfg.seed??1);
    const rnd=()=>rng();
    const R=(a,b)=>a+rnd()*(b-a);
    const pick=arr=>arr[Math.floor(rnd()*arr.length)];
    const audio=createAudio(!!cfg.sound);
    const samplesReady=cfg.sound && cfg.samples ? loadSamples(cfg.samples) : Promise.resolve();

    const sky=col(cfg.sky||'#d8cbb8');
    const scene=new THREE.Scene();
    scene.background=sky.clone();
    scene.fog=new THREE.Fog(sky.clone(), ...(cfg.fog||[70,210]));
    const camera=new THREE.PerspectiveCamera(cfg.fov??52, 9/16, .5, cfg.far??400);
    const hemi=new THREE.HemisphereLight(0xfff0da,0x5b5148,.78); scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xffe0b0,.95);
    sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-70,right:70,top:110,bottom:-110,near:1,far:260});
    sun.shadow.bias=-.0006; scene.add(sun,sun.target);

    const ctx={ THREE, scene, camera, renderer, hemi, sun, stage, audio,
      R, pick, rnd, clamp, lerp, smooth, col, Merger, PRIM,
      fast:false,   // true while seeking / exporting: skip purely visual per-frame work
      reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      material: new THREE.MeshLambertMaterial({vertexColors:true}),
      // set background + fog colour in one go
      setSky(c){ scene.background.copy(c); scene.fog.color.copy(c); },
      // keep the shadow camera centred on what the camera looks at
      aimSun(x,z,offset=[-38,85,30]){ sun.position.set(x+offset[0],offset[1],z+offset[2]); sun.target.position.set(x,0,z-30); },
      state:{} };

    // cfg.look: cinematic pipeline from engine/look.js (opt-in; older videos keep the plain renderer)
    if (cfg.look){ if (Engine.look) ctx.look=Engine.look.install(ctx, cfg.look===true ? {} : cfg.look); else console.warn('cfg.look needs engine/look.js'); }
    const draw=()=>{ if (ctx.look) ctx.look.render(t); else renderer.render(scene,camera); };

    if (cfg.setup) ctx.state = cfg.setup(ctx) || {};
    // compile every material now, hidden objects included, so nothing stalls the first time it comes into view
    // and draw everything once with culling off, so every buffer is on the GPU before playback (no hitch on first sight)
    try{ const hid=[], fc=[]; scene.traverse(o=>{ if(!o.visible){ hid.push(o); o.visible=true; } if(o.frustumCulled){ fc.push(o); o.frustumCulled=false; } });
      if (ctx.look) ctx.look.render(0);   // through the look: its sky reflection exists by then, so shaders compile with it
      else renderer.render(scene,camera);
      hid.forEach(o=>{ o.visible=false; }); fc.forEach(o=>{ o.frustumCulled=true; }); }
    catch(e){ console.warn('Engine: GPU warm-up skipped', e); }

    const STEP=1/60;   // fixed simulation step: same results at any frame rate
    let t=0, last=0, acc=0, paused=EXPORT;
    // status line cross-fade runs on simulation time, so recordings and exports look identical
    let statusText, statusNext, statusSwapT, statusInT;
    function reset(){
      t=0; acc=0; rng=mulberry32(((cfg.seed??1)*7919+1)>>>0); audio.t=0;
      statusText=cfg.statusStart||''; statusNext=null; statusInT=-1;
      hud.status.textContent=statusText; hud.status.style.opacity=1;
      hud.replay.hidden=true; if(cfg.reset) cfg.reset(ctx);
    }
    reset();

    function setStatus(s){
      if (s!=null && s!==(statusNext??statusText)){ statusNext=s; statusSwapT=t; }
      let op=1;
      if (statusNext!=null){
        const k=(t-statusSwapT)/.26;
        if (k>=1){ statusText=statusNext; statusNext=null; statusInT=t; hud.status.textContent=statusText; op=0; }
        else op=1-k;
      } else if (statusInT>=0) op=Math.min(1,(t-statusInT)/.3);
      hud.status.style.opacity=op.toFixed(3);
    }
    function setCounter(key, value, sub){
      const c=hud[key]; if(!c) return;
      if (value!=null) c.num.textContent = typeof value==='number' ? value.toFixed(c.decimals) : value;
      if (sub!=null) c.sub.textContent = sub;
    }

    function step(dt){
      t+=dt; audio.t=t;
      const o=cfg.update ? (cfg.update(ctx,t,dt)||{}) : {};
      setCounter('main',o.main,o.mainSub);
      setCounter('side',o.side,o.sideSub);
      if (hud.fill && o.gauge!=null) hud.fill.style.height=(clamp(o.gauge/hud.gaugeMax,0,1)*100).toFixed(2)+'%';
      setStatus(o.status);
      if (cfg.hud==='editorial'){ const f=cfg.titleFade||[3,3.8]; hud.h1.style.opacity=(1-smooth(f[0],f[1],t)).toFixed(3); }
      if (hud.replay.hidden && cfg.duration && t>cfg.duration+2) hud.replay.hidden=false;
    }
    // Fast-forward from the start to `target` seconds with the same fixed steps, then draw once.
    // One-shot sounds are muted on the way; beds pick up their level on the next live frame.
    function seek(target){
      reset(); audio.silent=true; ctx.fast=true;
      while (t < target - STEP) step(STEP);
      ctx.fast=false; step(STEP); audio.silent=false;
      draw();
    }
    // Live playback follows the display clock: each frame's time is split into equal sub-steps of at most 1/60 s,
    // so motion is smooth at any refresh rate (fixed 1/60 s steps judder on 120/144 Hz screens: 2-2-3 frames per step).
    // Only the last sub-step does visual work (ctx.fast on the others). Below 20 fps time stretches instead of spiralling.
    // Seek, the WAV export and the frame exporter keep exact 1/60 s steps, so their runs stay reproducible.
    function frame(now){
      const ms=now-last, dt=Math.min(.1,ms/1000); last=now;
      govern(ms); showMeter(ms);
      if(!paused){
        const span=Math.min(dt,.05), n=Math.max(1,Math.ceil(span/STEP-1e-6)), h=span/n;
        for(let i=0;i<n;i++){ ctx.fast=i<n-1; step(h); }
        ctx.fast=false;
        draw();
      }
      requestAnimationFrame(frame);
    }

    function toast(msg, ms=2500){
      hud.toast.textContent=msg; hud.toast.hidden=false;
      clearTimeout(toast.id); if(ms) toast.id=setTimeout(()=>hud.toast.hidden=true, ms);
    }
    // E: simulate the whole run silently, render its soundtrack offline and download it as WAV.
    async function exportAudio(opts={}){
      if(!cfg.sound){ toast('This video has no sound (set sound: true)'); return; }
      const was=paused; paused=true; toast('Rendering audio…',0);
      const dur=(cfg.duration||30)+(cfg.tail??8);
      audio.mode='record'; audio.rec={events:[],last:{}};
      reset(); ctx.fast=true;
      while(t<dur) step(STEP);
      ctx.fast=false;
      const events=audio.rec.events; audio.mode='live'; audio.rec=null;
      seek(0);
      try{
        const buf=await audio.render(events,dur);
        if(opts.download===false){ hud.toast.hidden=true; paused=was; return {events,buffer:buf}; }
        const a=document.createElement('a'); a.href=URL.createObjectURL(wavBlob(buf));
        a.download=(document.title||'video').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.wav';
        document.body.appendChild(a); a.click(); a.remove();
        toast('Audio saved ('+dur.toFixed(0)+' s)');
      } catch(e){ console.error(e); toast('Audio export failed: '+e.message, 5000); }
      paused=was;
      return events;
    }

    // ---- live quality: every frame has to fit inside the display's refresh interval, or motion stutters ----
    // Levels trade image quality for speed: max pixel ratio, cinematic-look supersample, ambient occlusion, bloom,
    // shadow map size (0 = no shadows). The frame exporter renders level 0; live playback starts at level 1 and steps
    // down (two at a time when frames are far too slow) while frames keep missing the refresh. ?q=0..6 pins a level.
    // Key F shows the meter: fps, frame time, screen refresh, quality level and the GPU the browser renders with.
    const QUALITY=[ {pr:2,ss:1.5,ao:1,bloom:1,shadow:4096}, {pr:1.5,ss:1.25,ao:1,bloom:1,shadow:4096}, {pr:1.25,ss:1,ao:1,bloom:1,shadow:4096},
                    {pr:1,ss:1,ao:1,bloom:1,shadow:2048}, {pr:.8,ss:1,ao:0,bloom:1,shadow:2048}, {pr:.65,ss:1,ao:0,bloom:0,shadow:1024},
                    {pr:.5,ss:1,ao:0,bloom:0,shadow:0} ];
    const qPin=new URLSearchParams(location.search).get('q');
    let q=qPin!=null?clamp(Math.floor(Number(qPin))||0,0,QUALITY.length-1):(EXPORT?0:(cfg.quality??1));
    const gl=renderer.getContext(), dbg=gl.getExtension('WEBGL_debug_renderer_info');
    const GPU=String(dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
    const SOFTWARE=/swiftshader|basic render|llvmpipe|software/i.test(GPU);
    if (SOFTWARE && qPin==null && !EXPORT) q=QUALITY.length-2;
    function applyQuality(){
      const Q=QUALITY[q];
      if (ctx.look){
        ctx.look.supersample(Q.ss); ctx.look.effects(Q.ao, Q.bloom);
      }
      if (sun.shadow.mapSize.x!==Q.shadow && Q.shadow){ sun.shadow.mapSize.set(Q.shadow,Q.shadow); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map=null; } }
      sun.castShadow=Q.shadow>0;
    }
    function fit(){
      const r=stage.getBoundingClientRect();
      applyQuality();
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,QUALITY[q].pr));
      renderer.setSize(Math.round(r.width),Math.round(r.height),false);
      if (ctx.look) ctx.look.resize();
      camera.aspect=r.width/r.height; camera.updateProjectionMatrix();
      if (t>0) draw();   // resizing clears the canvas: redraw even while paused
    }
    new ResizeObserver(fit).observe(stage); fit();
    const gov={ n:0, sum:0, skip:30, vs:1e9 };
    function govern(ms){
      if(EXPORT || paused || document.visibilityState!=='visible' || ms>1500){ gov.skip=Math.max(gov.skip,10); gov.n=gov.sum=0; return; }
      if(gov.skip>0){ gov.skip--; return; }
      gov.vs=Math.min(gov.vs*1.001, ms);          // the display's refresh interval: the shortest frame gaps
      gov.n++; gov.sum+=ms; if(gov.n<12 || gov.sum<1000) return;
      const mean=gov.sum/gov.n, target=Math.min(gov.vs, 1000/60); gov.n=gov.sum=0;
      if(qPin==null && mean>target*1.15+.5 && q<QUALITY.length-1){
        let next=Math.min(QUALITY.length-1, q+(mean>target*2.5?2:1));
        // levels that switch AO / bloom / shadows off change the picture's colours: chasing a 120-144 Hz screen only
        // lowers resolution; those steps wait until playback is really below ~60 fps
        const looks=l=>QUALITY[l].ao+'|'+QUALITY[l].bloom+'|'+(QUALITY[l].shadow>0);
        if (mean<=(1000/60)*1.15+.5) while(next>q && looks(next)!==looks(q)) next--;
        if (next>q){ q=next; fit(); gov.skip=20; }
      }
    }
    const meter=h('div','engine-meter',stage); meter.hidden=true; meter.n=0; meter.acc=0;
    function showMeter(ms){
      if(meter.hidden) return;
      meter.n++; meter.acc+=ms; if(meter.acc<500) return;
      meter.textContent=(1000*meter.n/meter.acc).toFixed(0)+' fps · '+(meter.acc/meter.n).toFixed(1)+' ms · screen '+(gov.vs<1e8?(1000/gov.vs).toFixed(0)+' Hz':'…')
        +' · quality '+q+'\nGPU: '+GPU.replace(/^ANGLE \(|\)$/g,'').slice(0,70);
      meter.n=0; meter.acc=0;
    }
    if (SOFTWARE && !EXPORT) setTimeout(()=>toast('This browser is not using the graphics card (software rendering), so playback will be slow. Open the page in Chrome with hardware acceleration on.', 9000), 600);

    // Browsers only start audio after a gesture: the first click or key unlocks it,
    // and clicking the hint restarts the run so the recording begins with sound at t = 0.
    function unlock(){ audio.unlock(); if(hud.soundHint) setTimeout(()=>{ if(audio.running()) hud.soundHint.hidden=true; },50); }
    if (hud.soundHint) hud.soundHint.addEventListener('click',()=>{ unlock(); reset(); });
    stage.addEventListener('pointerdown',unlock);

    hud.replay.addEventListener('click',reset);
    addEventListener('keydown',e=>{
      unlock();
      const k=e.key.toLowerCase();
      if(k==='r') reset();
      else if(k===' '){ paused=!paused; audio.pause(paused); e.preventDefault(); }
      else if(k==='h') stage.classList.toggle('hud-hidden');
      else if(k==='g') hud.guides.hidden=!hud.guides.hidden;
      else if(k==='m') toast(audio.toggleMute() ? 'Sound off' : 'Sound on', 1200);
      else if(k==='e') exportAudio();
      else if(k==='f') meter.hidden=!meter.hidden;
      else if(/^[1-9]$/.test(k) && cfg.duration) seek(cfg.duration*Number(k)/10);
    });
    requestAnimationFrame(n=>{ last=n; frame(n); });
    // ---- frame-by-frame export API (used by tools/export-video.mjs) ----
    const exportApi={
      ready(){ return samplesReady; },
      info(){ return { duration:(cfg.duration||30)+(cfg.tail??8), sound:!!cfg.sound, title:document.title,
                       gl:renderer.getContext().getParameter(renderer.getContext().VERSION) }; },
      // soundtrack of the full run as base64 WAV (null without sound)
      async wavBase64(){
        if(!cfg.sound) return null;
        const {buffer}=await exportAudio({download:false});
        const bytes=new Uint8Array(await wavBlob(buffer).arrayBuffer());
        let bin=''; for(let i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
        return btoa(bin);
      },
      start(){ paused=true; reset(); step(0); draw(); },
      // advance to frame i of a `fps` timeline in fixed steps, then draw it
      frame(i,fps){ const target=i/fps; while(t < target-1e-9) step(STEP); draw(); return t; },
    };
    const handle={ ctx, reset, seek, exportAudio, export:exportApi, get t(){ return t; }, get quality(){ return q; }, gpu:GPU };
    window.engine=handle;   // console access: engine.seek(20)
    return handle;
  }};
})();
