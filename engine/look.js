/* Cinematic look for the engine: opt in with `look: true` (or an options object) in Engine.create.
   Load after engine.js, and after three r128's examples/js EffectComposer, CopyShader,
   LuminosityHighPassShader and UnrealBloomPass (see videos/_template/index.html).

   Pipeline per frame: scene -> HDR target (supersampled, with depth) -> crease AO -> bloom
   -> final pass (sharpen, exposure, ACES tone mapping, saturation, contrast, sRGB, vignette, grain).
   Also: gradient sky dome with a sun, linear colour workflow (ctx.col converts hex to linear),
   MeshStandardMaterial with a window-grid texture whose lit windows glow at night.

   ctx.look API: render(t) · resize() · setSky(horizon, zenith?) · night(0..1) · glow(k) · set({...})
   Options: exposure 1.05 · saturation 1.15 · contrast 1.04 · vignette .18 · grain .012 · supersample 1.5
            env .25 (sky reflections / fill light, 0 = off) · scrim .25 (darkness behind the title, 0..1;
            raise it for busy bright backgrounds)
            sharpen 0 (unsharp mask at output resolution; ~.4-.7 crisps up the low-poly edges)
            windows 'detail' (framed high-res windows + ctx.glassMaterial curtain walls for glass towers)
            ao {strength .8, radius 1.4} · bloom {strength .55, radius .45, threshold .9} */
(function(){
  'use strict';
  const THREE = window.THREE, E = window.Engine;
  if (!THREE || !E) { console.error('look.js: load three.js and engine.js first'); return; }

  const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
  const ORTHO = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  function pass(frag, uniforms){
    const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: frag, depthTest: false, depthWrite: false });
    const sc = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2,2), m);
    q.frustumCulled = false; sc.add(q); return { m, sc, u: uniforms };
  }

  // Ambient occlusion from depth only, using symmetric sample pairs: a pixel is occluded when it
  // sits deeper than both neighbours (a crease), so flat or tilted planes stay clean.
  const AO_FS = `
    uniform sampler2D tColor, tDepth; uniform vec2 res; uniform float near, far, strength, radius, proj;
    varying vec2 vUv;
    float vz(float d){ return (near*far)/((far-near)*d-far); }
    float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(.06711056,.00583715)))); }
    void main(){
      vec4 c = texture2D(tColor, vUv); float d = texture2D(tDepth, vUv).x;
      if (d > .99999 || strength <= 0.) { gl_FragColor = c; return; }
      float z = -vz(d);
      float rpx = clamp(radius*proj*res.y*.5/z, 3., 90.);
      float a0 = ign(gl_FragCoord.xy)*3.14159, occ = 0.;
      for (int i=0; i<8; i++){
        float fi = (float(i)+.5)/8.; float a = a0 + float(i)*2.39996;
        vec2 o = vec2(cos(a), sin(a))*rpx*(.2+.8*fi)/res;
        float c1 = z + vz(texture2D(tDepth, vUv+o).x), c2 = z + vz(texture2D(tDepth, vUv-o).x);
        float range = 1. - smoothstep(radius, radius*3., max(abs(c1), abs(c2)));
        occ += clamp((c1+c2)*.5/(radius*.35), 0., 1.)*range;
      }
      gl_FragColor = vec4(c.rgb*(1. - strength*occ/8.), c.a);
    }`;

  const FINAL_FS = `
    uniform sampler2D tColor; uniform vec2 res; uniform float exposure, sat, contrast, vignette, grain, time, sharpen;
    varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
    vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-.055, step(.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec3 c = texture2D(tColor, vUv).rgb;
      if (sharpen > 0.){
        vec2 p = 1./res;
        vec3 b = (texture2D(tColor, vUv+vec2(p.x,0.)).rgb + texture2D(tColor, vUv-vec2(p.x,0.)).rgb
                + texture2D(tColor, vUv+vec2(0.,p.y)).rgb + texture2D(tColor, vUv-vec2(0.,p.y)).rgb)*.25;
        c = max(c + (c - b)*sharpen, 0.);
      }
      c = aces(c*exposure);
      float l = dot(c, vec3(.2126,.7152,.0722)); c = max(mix(vec3(l), c, sat), 0.);
      c = srgb(c);
      c = clamp((c-.5)*contrast+.5, 0., 1.);
      vec2 q = (vUv-.5)*vec2(1., 1.25);
      c *= 1. - vignette*smoothstep(.2, .85, length(q)*1.25);
      c += (hash(vUv*res + fract(time*7.13)*91.) - .5)*grain;
      gl_FragColor = vec4(c, 1.);
    }`;

  const SKY_VS = 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }';
  const SKY_FS = `
    uniform vec3 zenith, horizon, sunDir, sunColor; uniform float sunSize, haze, gain, sunK;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float h = clamp(d.y, -1., 1.);
      vec3 c = mix(horizon, zenith, pow(smoothstep(0., 1., max(h, 0.)), .55));
      float s = max(dot(d, normalize(sunDir)), 0.);
      c += sunColor*(pow(s, sunSize)*14.*sunK + pow(s, 12.)*.35*haze + pow(s, 3.)*.12*haze);
      gl_FragColor = linearToOutputTexel(vec4(c*gain, 1.));   // encodes for the PMREM (RGBE) target; linear elsewhere
    }`;

  // window grid: 8x8 cells of 3 m x 3.2 m; map = wall/glass, lit = which windows glow at night
  function windowTextures(){
    const N = 8, S = 512, C = S/N, rnd = E.mulberry32(77);
    const make = draw => { const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
    const cells = []; for (let i=0;i<N*N;i++) cells.push({ lit: rnd() < .42, warm: .75 + rnd()*.25, shade: .55 + rnd()*.25 });
    const map = make(g => {
      g.fillStyle = '#fff'; g.fillRect(0,0,S,S);
      cells.forEach((k,i) => { const x = (i%N)*C, y = Math.floor(i/N)*C, v = Math.round(255*k.shade*.42);
        g.fillStyle = `rgb(${v},${v+8},${v+18})`; g.fillRect(x+C*.2, y+C*.22, C*.6, C*.56);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x+C*.2, y+C*.22, C*.6, C*.08); });
    });
    const lit = make(g => {
      g.fillStyle = '#000'; g.fillRect(0,0,S,S);
      cells.forEach((k,i) => { if (!k.lit) return; const x = (i%N)*C, y = Math.floor(i/N)*C, w = Math.round(255*k.warm);
        g.fillStyle = `rgb(255,${Math.round(w*.86)},${Math.round(w*.62)})`; g.fillRect(x+C*.22, y+C*.24, C*.56, C*.52); });
    });
    return { map, lit };
  }
  // windows: 'detail' (since 004): twice the resolution, framed tall windows with sill, lintel, reveal shadow, mullion and
  // transom, sky reflection in the glass and some curtains; plus a curtain-wall texture for glass towers (ctx.glassMaterial).
  // The bottom-left corner of the tile stays plain wall: non-facade faces sample it.
  function detailTextures(){
    const N = 8, S = 1024, C = S/N, rnd = E.mulberry32(78);
    const make = (draw, size = S) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 16; return t; };
    const cells = []; for (let i=0;i<N*N;i++) cells.push({ lit: rnd() < .42, warm: .75 + rnd()*.25, shade: .6 + rnd()*.4, blind: rnd() < .3 ? .25 + rnd()*.35 : 0, dark: rnd() < .08 });
    const X0 = .25, W = .5, Y0 = .2, H = .6;
    const map = make(g => {
      g.fillStyle = '#ececec'; g.fillRect(0, 0, S, S);
      for (let i=0;i<9000;i++){ const v = rnd() < .5 ? 255 : 205; g.fillStyle = `rgba(${v},${v},${v},.25)`; g.fillRect(rnd()*S, rnd()*S, 2, 2); }   // stone grain
      cells.forEach((k, i) => {
        const x = (i%N)*C, y = Math.floor(i/N)*C, wx = x + C*X0, wy = y + C*Y0, ww = C*W, wh = C*H;
        g.fillStyle = '#d6d6d6'; g.fillRect(x, y, C, 5);                                  // floor line
        g.fillStyle = '#fafafa'; g.fillRect(wx - 6, wy - 9, ww + 12, 7);                   // lintel
        g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(wx - 6, wy - 2, ww + 12, 2);
        const gr = g.createLinearGradient(0, wy, 0, wy + wh), s = k.dark ? .45 : k.shade;
        gr.addColorStop(0, `rgb(${Math.round(160*s)},${Math.round(185*s)},${Math.round(205*s)})`);
        gr.addColorStop(.55, `rgb(${Math.round(80*s)},${Math.round(98*s)},${Math.round(118*s)})`);
        gr.addColorStop(1, `rgb(${Math.round(40*s)},${Math.round(50*s)},${Math.round(62*s)})`);
        g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
        if (k.blind){ g.fillStyle = '#e4dccb'; g.fillRect(wx, wy, ww, wh*k.blind);
          g.fillStyle = 'rgba(0,0,0,.08)'; for (let yy = wy + 4; yy < wy + wh*k.blind; yy += 5) g.fillRect(wx, yy, ww, 1); }
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(wx, wy, ww, 5); g.fillRect(wx, wy, 5, wh);   // reveal: the window sits back in the wall
        g.fillStyle = '#ffffff';                                                                    // frame, mullion, transom
        g.fillRect(wx - 3, wy - 3, ww + 6, 3); g.fillRect(wx - 3, wy + wh, ww + 6, 3); g.fillRect(wx - 3, wy, 3, wh); g.fillRect(wx + ww, wy, 3, wh);
        g.fillRect(wx + ww/2 - 1.5, wy, 3, wh); g.fillRect(wx, wy + wh*.3, ww, 3);
        g.fillStyle = '#ffffff'; g.fillRect(wx - 8, wy + wh + 3, ww + 16, 6);                 // sill and its shadow
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(wx - 8, wy + wh + 9, ww + 16, 3);
      });
    });
    const lit = make(g => {
      g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
      cells.forEach((k, i) => { if (!k.lit) return; const x = (i%N)*C, y = Math.floor(i/N)*C, w = Math.round(255*k.warm);
        g.fillStyle = `rgb(255,${Math.round(w*.86)},${Math.round(w*.62)})`; g.fillRect(x + C*X0, y + C*Y0, C*W, C*H); });
    });
    // curtain wall: 8 floors x 16 panes of 1.5 m per tile; dark spandrel band at each floor, thin mullions
    const glass = make(g => {
      g.fillStyle = '#f2f4f6'; g.fillRect(0, 0, S, S);
      const P = S/16, F = S/8;
      for (let r=0;r<8;r++) for (let p=0;p<16;p++){
        const v = .78 + rnd()*.22, x = p*P, y = r*F;
        const gr = g.createLinearGradient(x, y, x + P, y + F*.78);
        gr.addColorStop(0, `rgb(${Math.round(235*v)},${Math.round(242*v)},${Math.round(250*v)})`); gr.addColorStop(1, `rgb(${Math.round(175*v)},${Math.round(190*v)},${Math.round(205*v)})`);
        g.fillStyle = gr; g.fillRect(x, y, P, F*.78);
      }
      for (let r=0;r<8;r++){ g.fillStyle = '#5a636c'; g.fillRect(0, r*F + F*.78, S, F*.22); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, r*F + F*.78, S, 2); }
      g.fillStyle = '#3c434a'; for (let p=0;p<=16;p++) g.fillRect(p*P - 1.5, 0, 3, S);
      g.fillStyle = '#f2f4f6'; g.fillRect(0, S - 6, 6, 6);
    });
    return { map, lit, glass };
  }

  E.look = { install(ctx, o){
    const { renderer, scene, camera } = ctx;
    const opt = Object.assign({ exposure: 1.05, saturation: 1.15, contrast: 1.04, vignette: .18, grain: .012, supersample: 1.5, sharpen: 0, env: .25, scrim: .25 }, o);
    const ao = Object.assign({ strength: .8, radius: 1.4 }, o.ao);
    const bl = Object.assign({ strength: .55, radius: .45, threshold: .9 }, o.bloom);
    const lin = h => new THREE.Color(h).convertSRGBToLinear();

    // linear colour workflow: scenes written for the look use ctx.col, which converts hex to linear
    ctx.col = lin;
    const tex = opt.windows === 'detail' ? detailTextures() : windowTextures();
    ctx.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0,
      map: tex.map, emissiveMap: tex.lit, emissive: new THREE.Color(1, .72, .42), emissiveIntensity: 0 });
    // glass towers (windows: 'detail'): curtain-wall texture, glossy, reflects the sky
    ctx.glassMaterial = tex.glass ? new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.glass, roughness: .2, metalness: .15 }) : ctx.material;
    ctx.glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });   // lamps, screens: colour > 1 blooms
    ctx.hemi.intensity = .85; ctx.hemi.color.copy(lin('#dfe8f5')); ctx.hemi.groundColor.copy(lin('#5a5048'));
    ctx.sun.intensity = 2.4; ctx.sun.color.copy(lin('#ffe6c4'));
    ctx.sun.shadow.mapSize.set(4096, 4096); ctx.sun.shadow.bias = -.0004; ctx.sun.shadow.normalBias = .02;

    // sky dome (follows the camera, ignores fog) and fog matched to its horizon
    const sky = { zenith: lin('#5f8fc8'), horizon: lin('#c9d6e2'), sunColor: new THREE.Color(1, .86, .62) };
    const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { zenith: { value: sky.zenith }, horizon: { value: sky.horizon }, sunDir: { value: new THREE.Vector3(0,1,0) },
                  sunColor: { value: sky.sunColor }, sunSize: { value: 900 }, haze: { value: 1 }, gain: { value: 1 }, sunK: { value: 1 } } });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(camera.far*.9, 32, 16), skyMat);
    dome.renderOrder = -1; dome.frustumCulled = false; scene.add(dome);
    scene.background = null; scene.fog.color.copy(sky.horizon);

    // image-based light: the sky (same uniforms, dimmed by opt.env) is baked into scene.environment, so
    // water and glossy materials reflect it and everything gets soft sky-coloured fill light.
    // Re-baked only when the sky actually changes (colours quantised), so it stays deterministic and cheap.
    const env = { gen: new THREE.PMREMGenerator(renderer), sc: new THREE.Scene(), tex: null, key: '' };
    if (opt.env > 0){
      const envMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: Object.assign({}, skyMat.uniforms, { gain: { value: opt.env }, sunK: { value: 0 } }) });   // no sun disc: the sun light already does that job
      env.sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
      ctx.material.envMapIntensity = .6;   // matte facades: a hint of sky, not a mirror
    }
    function bakeEnv(){
      if (!(opt.env > 0)) return;
      const u = skyMat.uniforms, q = v => v.toArray().map(x => x.toFixed(2)).join();
      const key = [q(u.zenith.value), q(u.horizon.value), q(u.sunDir.value), q(u.sunColor.value), u.haze.value.toFixed(2)].join('|');
      if (key === env.key) return;
      env.key = key;
      const rt = env.gen.fromScene(env.sc, 0, .1, 100);
      if (env.tex) env.tex.dispose();
      env.tex = rt.texture; scene.environment = env.tex;
    }

    // a lighter title scrim: a heavy dark band turns bright skies grey
    ctx.stage.style.setProperty('--scrim-a', String(opt.scrim));

    let rtA, rtB, bloom, W = 0, H = 0;
    const fx = { ao: true, bloom: true };
    const aoP = pass(AO_FS, { tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() },
      near: { value: 0 }, far: { value: 0 }, strength: { value: ao.strength }, radius: { value: ao.radius }, proj: { value: 1 } });
    const fin = pass(FINAL_FS, { tColor: { value: null }, res: { value: new THREE.Vector2() }, exposure: { value: opt.exposure },
      sat: { value: opt.saturation }, contrast: { value: opt.contrast }, vignette: { value: opt.vignette }, grain: { value: opt.grain }, time: { value: 0 }, sharpen: { value: opt.sharpen } });

    function targets(){
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const k = Math.min(opt.supersample, 4096/Math.max(size.x, size.y));
      const w = Math.max(2, Math.round(size.x*k)), h = Math.max(2, Math.round(size.y*k));   // a hidden page can report 0x0
      if (rtA && w === W && h === H) return;
      W = w; H = h;
      [rtA, rtB].forEach(r => r && r.dispose());
      const p = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      rtA = new THREE.WebGLRenderTarget(w, h, p);
      rtA.depthTexture = new THREE.DepthTexture(w, h); rtA.depthTexture.type = THREE.UnsignedIntType;
      rtB = new THREE.WebGLRenderTarget(w, h, Object.assign({ depthBuffer: false }, p));
      if (THREE.UnrealBloomPass){
        if (!bloom) bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), bl.strength, bl.radius, bl.threshold);
        else bloom.setSize(w, h);
      }
      aoP.u.res.value.set(w, h); fin.u.res.value.set(size.x, size.y);
    }

    const L = {
      resize: targets,
      // render-target scale (1 = output resolution); the engine lowers it when live playback can't keep up
      supersample(k){ if (k === opt.supersample) return; opt.supersample = k; W = 0; targets(); },
      get scale(){ return opt.supersample; },
      // live quality levels switch the costly passes off entirely (exports keep them)
      effects(aoOn, bloomOn){ fx.ao = !!aoOn; fx.bloom = !!bloomOn; },
      setSky(horizon, zenith){
        sky.horizon.copy(horizon); scene.fog.color.copy(horizon);
        if (zenith) sky.zenith.copy(zenith);
        else sky.zenith.copy(horizon).multiply(new THREE.Color(.42, .58, .86));
      },
      // 0 = day, 1 = night: lit windows glow
      night(k){ ctx.material.emissiveIntensity = 2.2*k; },
      // multiplier for ctx.glowMaterial (street lamps, signs)
      glow(k){ ctx.glowMaterial.color.setScalar(k); },
      sky: skyMat.uniforms,
      set(v){ for (const k in v){ if (k in fin.u) fin.u[k].value = v[k]; else if (k === 'exposure') fin.u.exposure.value = v[k];
        else if (k === 'aoStrength') aoP.u.strength.value = v[k]; else if (k === 'bloomStrength' && bloom) bloom.strength = v[k]; } },
      render(t){
        if (!rtA) targets();
        dome.position.copy(camera.position);
        skyMat.uniforms.sunDir.value.copy(ctx.sun.position).sub(ctx.sun.target.position).normalize();
        bakeEnv();
        renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(scene, camera);
        aoP.u.tColor.value = rtA.texture; aoP.u.tDepth.value = rtA.depthTexture;
        aoP.u.near.value = camera.near; aoP.u.far.value = camera.far;
        aoP.u.proj.value = 1/Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
        let src = rtA;
        if (fx.ao && aoP.u.strength.value > 0){ renderer.setRenderTarget(rtB); renderer.render(aoP.sc, ORTHO); src = rtB; }
        if (fx.bloom && bloom && bloom.strength > 0) bloom.render(renderer, null, src, 0, false);
        fin.u.tColor.value = src.texture; fin.u.time.value = t || 0;
        renderer.setRenderTarget(null); renderer.render(fin.sc, ORTHO);
      },
    };
    ctx.setSky = c => L.setSky(c);
    return L;
  }};
})();
