/* Brainrots: the series cast, built in code (smooth shapes, like fx.sahur), animated as a pure function of time.
   Load after kit.js. Colours go through ctx.col. Every character stands with its feet on y = 0 and faces +z.

   Engine.fx.brainrot(ctx, kind, o) -> { object, update(t, st), height }
     kind 'sahur'       Tung Tung Tung Sahur (Engine.fx.sahur, ~1.5 m here): st {speed, dir, look, surprise, raise, swing, jump, lean}
          'tralalero'   Tralalero Tralala: a blue shark on three legs in sneakers, ~1.55 m to the fin tip
                        st {speed, dir, look, surprise, chomp, jump, wag}
          'bombardiro'  Bombardiro Crocodilo: a crocodile that is a twin-engine bomber, 3.8 m wingspan
                        st {alt (m above y), bank, pitch, chomp, bombs (how many still hang, 0..2), prop (0..1 engine power)}
          'ballerina'   Ballerina Cappuccina: a ballerina whose head is a cappuccino on its saucer, ~1.65 m
                        st {speed, dir, arms (0 low .. 1 en haut), spin (radians), pirouette (0..1: on pointe, one leg in passé), jump}
     o.height rescales the character (metres; default as above).
   Engine.fx.brainrot.track(keys) -> at(t) = { x, y, z, yaw, speed, moving }   keys [{t | v, x, z, y, yaw}] like fx.people:
     travel between keys at different spots (straight, constant speed), hold between keys at the same spot; facing follows
     the motion and blends over .4 s, or a standing key's yaw. */
(function(){
  'use strict';
  const THREE = window.THREE, E = window.Engine;
  if (!THREE || !E || !E.kit) { console.error('brainrots.js: load engine.js and kit.js first'); return; }
  const { clamp, smooth } = E, kit = E.kit, C = kit.cyl;
  const SPH = new THREE.SphereGeometry(1, 24, 16), BOX = new THREE.BoxGeometry(1, 1, 1);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Matrix3();

  // like kit.solid, but a part's colour may be a function (x, y, z, nx, ny, nz) -> Color of the transformed vertex
  function solid(parts){
    const P = [], N = [], Cc = [];
    for (const [src, p, r, s, col] of parts){
      const sc = s == null ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : s, rr = r || [0, 0, 0];
      _e.set(rr[0], rr[1], rr[2], 'YXZ'); _q.setFromEuler(_e);
      _m.compose(_p.set(...(p || [0, 0, 0])), _q, _s.set(...sc));
      const g = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(_m);
      if (sc[0]*sc[1]*sc[2] < 0){ const a = g.attributes.position.array;   // mirrored part: restore the winding
        for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++){ const t = a[i+3+k]; a[i+3+k] = a[i+6+k]; a[i+6+k] = t; } }
      g.computeVertexNormals();
      const pa = g.attributes.position.array, na = g.attributes.normal.array;
      for (let i = 0; i < pa.length; i += 3){
        P.push(pa[i], pa[i+1], pa[i+2]); N.push(na[i], na[i+1], na[i+2]);
        const c = typeof col === 'function' ? col(pa[i], pa[i+1], pa[i+2], na[i], na[i+1], na[i+2]) : col;
        Cc.push(c.r, c.g, c.b);
      }
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    return geo;
  }
  // smooth body of revolution along +z, from z = 0 (r(0)) to z = L (r(1)); radius function of u in 0..1
  function lathe(r, L, seg = 32, rings = 48){
    const pts = []; for (let i = 0; i <= rings; i++){ const u = i/rings; pts.push(new THREE.Vector2(Math.max(1e-4, r(u)), u*L)); }
    const g = new THREE.LatheGeometry(pts, seg); g.rotateX(Math.PI/2); return g;   // lathe axis +y -> +z
  }
  // a flat outline (x, y) extruded `depth` with rounded edges, centred on its thickness
  function plate(outline, depth, bevel = .012){
    const sh = new THREE.Shape(); sh.moveTo(...outline[0]);
    for (let i = 1; i < outline.length; i++){ const p = outline[i]; if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]); }
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -depth/2); return g;
  }
  const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  function put(parts, parent, mat){ const m = new THREE.Mesh(solid(parts), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  const MAT = (o = {}) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: .55, metalness: 0 }, o));
  // jointed leg: hip -> knee -> ankle groups, a foot (shoe) mesh at the ankle; returns {hp, kn, an}
  function leg(parent, x, y, z, thigh, shin, rT, rS, col, mat){
    const hp = grp(parent, x, y, z), kn = grp(hp, 0, -thigh, 0), an = grp(kn, 0, -shin, 0);
    put([[SPH, [0, 0, 0], 0, rT*1.05, col], [C(rT, rT*.85, 14), [0, -thigh/2, 0], 0, [1, thigh, 1], col]], hp, mat);
    put([[SPH, [0, 0, 0], 0, rT*.86, col], [C(rT*.85, rS, 14), [0, -shin/2, 0], 0, [1, shin, 1], col]], kn, mat);
    return { hp, kn, an };
  }
  function stepLegs(L, f, a, dir, phases){
    L.forEach((l, k) => { const g = f + phases[k];
      l.hp.rotation.x = -dir*.55*a*Math.sin(g); l.kn.rotation.x = .95*a*Math.pow(Math.max(0, Math.cos(g + .25)), 1.3);
      l.an.rotation.x = -l.hp.rotation.x - l.kn.rotation.x; });
  }

  // ---------- Tralalero Tralala: blue shark, three legs, sneakers ----------
  function tralalero(ctx, o){
    const c = ctx.col, root = new THREE.Group(), body = grp(root, 0, .9, 0);
    const BLUE = c('#3a86dc'), DEEP = c('#2a62b8'), BELLY = c('#eef4f8'), DARK = c('#173a6a'), WHITE = c('#ffffff'), GUM = c('#c2414f');
    const skin = MAT({ roughness: .38 }), shoeM = MAT({ roughness: .6 }), glossy = MAT({ roughness: .08 });
    const L = 1.6, Z0 = -.88;   // body from the tail stalk (z = -.88) to the nose (z = .72)
    const R = u => { const base = .045 + .235*Math.pow(Math.sin(Math.min(1, u/.6)*Math.PI/2), 1.15), nose = u > .7 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - .7)/.3, 2))) : 1; return base*Math.max(nose, .02); };
    const tmp = new THREE.Color(), shade = (x, y, z) => tmp.copy(BELLY).lerp(BLUE, smooth(-.11, .04, y)).lerp(DEEP, smooth(.12, .26, y)).clone();
    put([[lathe(R, L), [0, 0, Z0], 0, [1, 1.12, 1], shade]], body, skin);
    // a point on the body's surface: z along the body, angle round it from the top (0) to the belly (PI), pushed out by k
    const surf = (z, ang, k = 1) => { const r = R((z - Z0)/L)*k; return [r*Math.sin(ang), 1.12*r*Math.cos(ang), z]; };
    // eyes, gills, nostrils
    for (const s of [-1, 1]){
      const e = surf(.42, s*1.2, .96);
      put([[SPH, e, 0, [.034, .052, .052], c('#0b0f16')]], body, glossy);
      put([[SPH, [e[0] + s*.022, e[1] + .02, e[2] + .025], 0, .012, WHITE]], body, glossy);
      for (let k = 0; k < 3; k++){ const g = surf(.2 - k*.07, s*1.65, .995); put([[BOX, g, [0, s*.12, s*.05], [.014, .16 - k*.02, .022], DARK]], body, skin); }
      put([[SPH, surf(.66, s*.55, .98), 0, .013, DARK]], body, skin);
    }
    // the grin: a dark lip line round the lower front of the snout, a row of white teeth hanging from it
    const mouthPts = [-1.15, -.6, 0, .6, 1.15].map((a, i) => new THREE.Vector3(...surf(.5 + .06*Math.cos(a), Math.PI - a, 1.0)));
    const mouth = new THREE.CatmullRomCurve3(mouthPts);
    const grin = grp(body, 0, 0, 0);
    const lip = new THREE.Mesh(new THREE.TubeGeometry(mouth, 30, .017, 8), new THREE.MeshStandardMaterial({ color: c('#5a1420'), roughness: .5 })); grin.add(lip);
    const teeth = []; for (let k = 0; k < 11; k++){ const p = mouth.getPoint(.05 + k*.09); teeth.push([C(0, .015, 6), [p.x*.97, p.y - .022, p.z], [Math.PI, 0, 0], [1, .045, 1], WHITE]); }
    put(teeth, grin, glossy);
    // fins: dorsal, pectorals, tail (wags)
    const dorsal = plate([[.2, 0], [.05, .25, -.14, .42], [-.08, .17, -.24, 0]], .045);
    put([[dorsal, [0, .24, -.12], [0, -Math.PI/2, 0], 1, (x, y) => tmp.copy(BLUE).lerp(DEEP, smooth(.3, .6, y - .9)).clone()]], body, skin);
    const pect = plate([[.12, 0], [.02, -.12, -.2, -.3], [-.05, -.1, -.1, 0]], .035);
    for (const s of [-1, 1]) put([[pect, [s*.2, -.1, .2], [0, -Math.PI/2, s*.7], [1, 1, s], BLUE]], body, skin);
    put([[plate([[.08, 0], [0, .1, -.08, .14], [-.03, .05, -.07, 0]], .025), [0, .14, -.62], [0, -Math.PI/2, 0], 1, DEEP]], body, skin);
    const tail = grp(body, 0, .02, Z0 + .04);
    put([[plate([[.04, 0], [-.08, .2, -.3, .4], [-.16, .14, -.1, .02], [-.14, -.08, -.22, -.24], [-.06, -.1, .04, 0]], .04), [0, 0, 0], [0, -Math.PI/2, 0], 1, BLUE]], tail, skin);
    // three legs in sneakers: two in front, one behind (a tripod gait)
    const SHOE = c('#2b63d9'), SOLE = c('#f4f6f8'), LACE = c('#ffffff');
    const legs = [[-.13, .14], [.13, .14], [0, -.42]].map(([x, z]) => {
      const l = leg(root, x, .66, z, .29, .29, .062, .046, BLUE, skin);
      put([[BOX, [0, -.045, .05], 0, [.13, .035, .27], SOLE], [SPH, [0, -.003, .045], 0, [.066, .055, .13], SHOE], [SPH, [0, -.01, .145], 0, [.058, .042, .055], SOLE],
           [C(.055, .06, 14), [0, .02, -.02], 0, [1, .06, 1], c('#1d3f8f')], [SPH, [0, .02, -.06], 0, [.05, .05, .05], SHOE],
           ...[0, 1, 2].map(k => [BOX, [0, .045 - k*.008, .02 + k*.035], [.2, 0, 0], [.07, .01, .012], LACE])], l.an, shoeM);
      return l;
    });
    root.scale.setScalar((o.height ?? 1.55)/1.55); ctx.scene.add(root);
    return { object: root, height: o.height ?? 1.55, update(t, st = {}){
      const a = clamp((st.speed || 0)/.9, 0, 1.4), dir = st.dir ?? 1, f = st.phase ?? t*6.2832*2.4, sur = st.surprise || 0;
      stepLegs(legs, f, a, dir, [0, Math.PI, Math.PI/2]);
      body.position.y = .9 + .03*a*Math.abs(Math.sin(f)) + (st.jump || 0) + .012*Math.sin(t*2.1);
      body.rotation.set(.04*a*dir - .1*sur, 0, .05*a*Math.sin(f*.5));
      tail.rotation.y = (.35*a + .15)*Math.sin(t*(4 + 6*a)) + (st.wag || 0)*.6*Math.sin(t*14);
      const ch = st.chomp || 0; grin.position.y = -.02*ch*Math.abs(Math.sin(t*9)); grin.scale.setScalar(1 + .25*sur);
      if (st.look){ root.updateMatrixWorld(true); const v = body.worldToLocal(_p.copy(st.look)); body.rotation.y = clamp(Math.atan2(v.x, v.z), -.35, .35); }
    } };
  }

  // ---------- Bombardiro Crocodilo: a crocodile that is a twin-engine bomber ----------
  function bombardiro(ctx, o){
    const c = ctx.col, root = new THREE.Group(), plane = grp(root, 0, 2.2, 0);
    const OLIVE = c('#4f7a2c'), DARKO = c('#3c5f22'), BELLY = c('#dcd29a'), WING = c('#5c7a3c'), METAL = c('#9aa0a6'), DARK = c('#25272b'), YEL = c('#e9c43a'), WHITE = c('#f6f3ea');
    const skin = MAT({ roughness: .62 }), metal = MAT({ roughness: .35, metalness: .4 }), glossy = MAT({ roughness: .1 });
    const tmp = new THREE.Color(), shade = (x, y) => tmp.copy(BELLY).lerp(OLIVE, smooth(-.16, .02, y - 2.2)).lerp(DARKO, smooth(.15, .3, y - 2.2)).clone();
    // fuselage = the crocodile's body and tail, scutes on its back
    const R = u => .05 + .27*Math.sin(Math.min(1, u/.55)*Math.PI/2) - .05*smooth(.55, 1, u);
    put([[lathe(R, 2.65), [0, 0, -1.65], 0, [1.05, .9, 1], (x, y) => shade(x, y + 2.2)]], plane, skin);
    const sc = [];
    for (let z = -1.45; z < .95; z += .13){ const k = 1 - .55*smooth(-.2, -1.45, z); for (const s of [-1, 1]) sc.push([SPH, [s*.085*k, .23*k + .02, z], 0, [.05*k, .04*k, .06*k], DARKO]); }
    put(sc, plane, skin);
    // head: skull, long snout, lower jaw (chomps), teeth, eyes with slit pupils and heavy lids, nostrils
    const H = 1.35;   // head scale: big enough to read as a crocodile at a glance
    put([[SPH, [0, .07, 1.05], 0, [.33*H, .25*H, .34*H], (x, y) => shade(x, y + 2.2)], [SPH, [0, .04, 1.72], 0, [.22*H, .1*H, .66*H], (x, y) => shade(x, y + 2.2)],
         [SPH, [0, .11, 2.42], 0, [.12*H, .06*H, .08*H], OLIVE], ...[-1, 1].map(s => [SPH, [s*.05*H, .17, 2.46], 0, .03, DARK])], plane, skin);
    const jaw = grp(plane, 0, -.05, 1.05);
    put([[SPH, [0, -.05, .62], 0, [.2*H, .065*H, .62*H], BELLY], [SPH, [0, -.01, .02], 0, [.27*H, .12*H, .24*H], BELLY]], jaw, skin);
    const tUp = [], tLo = [];
    for (let k = 0; k < 11; k++){ const z = 1.2 + k*.1; for (const s of [-1, 1]){
      tUp.push([C(0, .022, 6), [s*(.27 - k*.011), -.05, z], [Math.PI, 0, 0], [1, .075, 1], WHITE]);
      tLo.push([C(0, .02, 6), [s*(.24 - k*.011), .015, z - 1.05], 0, [1, .065, 1], WHITE]); } }
    put(tUp, plane, glossy); put(tLo, jaw, glossy);
    for (const s of [-1, 1]){
      put([[SPH, [s*.17, .3, 1.05], 0, .13, OLIVE], [SPH, [s*.17, .37, 1.04], [-.35, 0, s*.25], [.14, .06, .13], DARKO]], plane, skin);
      put([[SPH, [s*.17, .32, 1.13], 0, .09, YEL], [SPH, [s*.17, .322, 1.215], 0, [.016, .065, .016], DARK], [SPH, [s*.2, .35, 1.2], 0, .013, WHITE]], plane, glossy);
    }
    // wings (low, tapered), engines with propellers, tail planes, bombs, tucked crocodile legs
    const wingR = plate([[0, -.42], [1.62, -.2], [1.62, .2], [0, .36]], .07, .02);
    for (const s of [-1, 1]) put([[wingR, [s*.22, -.1, .05], [Math.PI/2, 0, 0], [s, 1, 1], WING]], plane, skin);
    const props = [];
    for (const s of [-1, 1]){
      put([[C(.13, .15, 18), [s*.88, -.06, .32], [Math.PI/2, 0, 0], [1, .62, 1], DARKO], [C(.15, .15, 18), [s*.88, -.06, .63], [Math.PI/2, 0, 0], [1, .07, 1], METAL]], plane, metal);
      const hub = grp(plane, s*.88, -.06, .7); props.push(hub);
      put([[C(0, .07, 14), [0, 0, .07], [Math.PI/2, 0, 0], [1, .14, 1], c('#c9c9c9')], ...[0, 1, 2].map(k => [BOX, [Math.cos(k*2.094)*.3, Math.sin(k*2.094)*.3, 0], [0, 0, k*2.094 + Math.PI/2], [.07, .6, .02], DARK]),
           ...[0, 1, 2].map(k => [BOX, [Math.cos(k*2.094)*.56, Math.sin(k*2.094)*.56, .002], [0, 0, k*2.094 + Math.PI/2], [.072, .08, .022], YEL])], hub, metal);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(.62, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }));
      disc.position.z = .005; hub.add(disc); hub.userData.disc = disc;
    }
    const stab = plate([[0, -.2], [.62, -.08], [.62, .12], [0, .2]], .045, .012);
    for (const s of [-1, 1]) put([[stab, [s*.05, .02, -1.5], [Math.PI/2, 0, 0], [s, 1, 1], WING]], plane, skin);
    put([[plate([[.25, 0], [.05, .2, -.12, .55], [-.25, .55], [-.3, 0]], .045, .012), [0, .1, -1.48], [0, -Math.PI/2, 0], 1, WING]], plane, skin);
    put([[BOX, [0, .35, -1.52], [0, 0, 0], [.05, .14, .3], YEL]], plane, skin);   // a yellow band on the fin: no national markings
    const bombs = [.25, -.3].map(z => { const b = grp(plane, 0, -.34, z);
      put([[SPH, [0, 0, 0], 0, [.095, .095, .22], c('#3d4247')], [C(.05, .02, 10), [0, 0, -.25], [Math.PI/2, 0, 0], [1, .12, 1], c('#3d4247')],
           [BOX, [0, 0, -.3], 0, [.2, .01, .08], c('#3d4247')], [BOX, [0, 0, -.3], 0, [.01, .2, .08], c('#3d4247')], [C(.097, .097, 16), [0, 0, .06], [Math.PI/2, 0, 0], [1, .03, 1], YEL]], b, metal);
      put([[BOX, [0, .1, 0], 0, [.03, .1, .03], METAL]], b, metal); return b; });
    for (const [x, z, k] of [[.27, .62, 1], [.29, -.7, -1]]) for (const s of [-1, 1])
      put([[SPH, [s*x, -.17, z], [0, 0, s*.5], [.06, .05, .13], OLIVE], [SPH, [s*(x + .07), -.24, z - k*.08], 0, [.05, .03, .07], OLIVE], ...[-1, 0, 1].map(q => [C(0, .012, 6), [s*(x + .07) + q*.025, -.25, z - k*.08 + .07], [Math.PI/2, 0, 0], [1, .04, 1], WHITE])], plane, skin);
    root.scale.setScalar((o.height ?? 1)/1); ctx.scene.add(root);
    const bombY = bombs.map(b => b.position.y);
    return { object: root, height: 1, plane, bombs, update(t, st = {}){
      const alt = st.alt ?? 2.2, pw = st.prop ?? 1;
      plane.position.y = alt + .06*Math.sin(t*1.7) + .03*Math.sin(t*3.1);
      plane.rotation.set(-(st.pitch || 0) + .02*Math.sin(t*1.3), 0, -(st.bank || 0) + .03*Math.sin(t*.9));
      for (const h of props){ h.rotation.z = t*(4 + 30*pw); h.userData.disc.material.opacity = .05 + .14*pw; }
      jaw.rotation.x = .28*(st.chomp || 0)*Math.abs(Math.sin(t*7));
      const n = st.bombs ?? 2; bombs.forEach((b, i) => { b.visible = i < n; b.position.y = bombY[i]; });
    } };
  }

  // ---------- Ballerina Cappuccina: a ballerina with a cappuccino for a head ----------
  let latteTex = null;
  function latte(){
    if (latteTex) return latteTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, '#9a6234'); gr.addColorStop(.85, '#7a4a26'); gr.addColorStop(1, '#5e381c');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#f4e7cf'; g.beginPath(); g.moveTo(128, 196);                       // a latte-art heart
    g.bezierCurveTo(60, 150, 52, 92, 92, 80); g.bezierCurveTo(112, 74, 124, 88, 128, 102); g.bezierCurveTo(132, 88, 144, 74, 164, 80); g.bezierCurveTo(204, 92, 196, 150, 128, 196); g.fill();
    g.strokeStyle = 'rgba(244,231,207,.7)'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 112, 0, 6.283); g.stroke();
    latteTex = new THREE.CanvasTexture(cv); latteTex.encoding = THREE.sRGBEncoding; return latteTex;
  }
  function ballerina(ctx, o){
    const c = ctx.col, root = new THREE.Group(), spin = grp(root), body = grp(spin, 0, .9, 0);
    const PINK = c('#f27aa9'), PINK2 = c('#f7a6c6'), PINK3 = c('#fbcadd'), SKIN = c('#f2cdb5'), TIGHTS = c('#f6c3cf'), SATIN = c('#f3a9bd'), CUP = c('#fbfaf6');
    const cloth = MAT({ roughness: .7 }), skinM = MAT({ roughness: .55 }), china = MAT({ roughness: .18 }), satin = MAT({ roughness: .3 });
    // tutu: three ruffled layers; leotard torso; neck
    const tutu = grp(body, 0, -.02, 0);
    [[.45, PINK3, -.02], [.4, PINK2, .015], [.34, PINK, .05]].forEach(([r, col, y]) => {
      const g = new THREE.CylinderGeometry(.13, r, .05, 48, 1, false); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++){ const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); if (d > .2){ const a = Math.atan2(z, x), k = 1 + .045*Math.sin(a*14); p.setX(i, x*k); p.setZ(i, z*k); p.setY(i, p.getY(i) - .02*Math.cos(a*14)); } }
      put([[g, [0, y, 0], 0, 1, col]], tutu, cloth); });
    const torso = u => .095 + .03*Math.sin(Math.PI*u*.9) + .02*smooth(.7, 1, u);
    put([[lathe(torso, .36, 28, 24), [0, .02, 0], [-Math.PI/2, 0, 0], [1.1, 1, .8], PINK], [SPH, [0, .38, 0], 0, [.15, .05, .1], PINK],
         [C(.034, .036, 12), [0, .43, 0], 0, [1, .09, 1], SKIN]], body, cloth);
    // head = cappuccino on a saucer: the cup, its rim, the latte art, the handle
    const head = grp(body, 0, .47, 0); head.scale.setScalar(1.25);
    const cupR = u => .1 + .075*Math.pow(u, .8) - .03*Math.pow(1 - u, 6);
    put([[C(.2, .17, 40), [0, .01, 0], 0, [1, .025, 1], CUP], [new THREE.TorusGeometry(.2, .01, 8, 40), [0, .024, 0], [Math.PI/2, 0, 0], 1, CUP],
         [lathe(cupR, .28, 40, 24), [0, .03, 0], [-Math.PI/2, 0, 0], 1, CUP], [new THREE.TorusGeometry(.172, .011, 8, 40), [0, .31, 0], [Math.PI/2, 0, 0], 1, CUP],
         [new THREE.TorusGeometry(.065, .018, 10, 24, Math.PI*1.2), [.19, .17, 0], [0, 0, -Math.PI*.6], 1, CUP]], head, china);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(.164, 40), new THREE.MeshStandardMaterial({ map: latte(), roughness: .35 }));
    coffee.rotation.x = -Math.PI/2; coffee.position.y = .3; head.add(coffee);
    // foam rising over the rim (so the coffee reads from the front too), a drip down the side, a pink band
    put([[SPH, [0, .315, 0], 0, [.15, .035, .15], c('#efe0c4')], [SPH, [.03, .335, -.02], 0, [.06, .018, .06], c('#f6ecd9')],
         [SPH, [-.15, .26, .07], 0, [.018, .05, .018], c('#8a5a35')], [SPH, [-.152, .225, .07], 0, .016, c('#8a5a35')]], head, china);
    put([[C(.162, .156, 40), [0, .2, 0], 0, [1.005, .025, 1.005], c('#f27aa9')]], head, china);
    // arms: shoulders -> elbows -> hands
    const arms = [-1, 1].map(s => { const sh = grp(body, s*.15, .35, 0), el = grp(sh, 0, -.25, 0);
      put([[SPH, [0, 0, 0], 0, .038, SKIN], [C(.032, .026, 12), [0, -.125, 0], 0, [1, .25, 1], SKIN]], sh, skinM);
      put([[SPH, [0, 0, 0], 0, .027, SKIN], [C(.025, .02, 12), [0, -.11, 0], 0, [1, .22, 1], SKIN], [SPH, [0, -.24, .005], 0, [.022, .04, .028], SKIN]], el, skinM);
      return { sh, el, s }; });
    // legs in tights and pointe shoes with ribbons
    const legs = [-1, 1].map(s => { const l = leg(body, s*.065, -.03, 0, .44, .42, .052, .03, TIGHTS, skinM);
      put([[SPH, [0, -.02, .02], [.4, 0, 0], [.036, .03, .085], SATIN], [C(.032, .032, 12), [0, .03, 0], 0, [1, .05, 1], SATIN],
           [new THREE.TorusGeometry(.034, .004, 6, 20), [0, .07, 0], [Math.PI/2 - .3, 0, 0], 1, SATIN], [new THREE.TorusGeometry(.032, .004, 6, 20), [0, .11, 0], [Math.PI/2 + .3, 0, 0], 1, SATIN]], l.an, satin);
      return l; });
    root.scale.setScalar((o.height ?? 1.65)/1.65); ctx.scene.add(root);
    return { object: root, height: o.height ?? 1.65, update(t, st = {}){
      const a = clamp((st.speed || 0)/.9, 0, 1.3), f = st.phase ?? t*6.2832*3.2, pir = st.pirouette || 0, up = st.arms ?? .2;
      spin.rotation.y = st.spin || 0;
      // small quick steps on demi-pointe when moving; a pirouette rises onto the left pointe, right knee in passé
      stepLegs(legs, f, a*.45, st.dir ?? 1, [0, Math.PI]);
      legs[1].hp.rotation.x += -1.25*pir; legs[1].hp.rotation.z = .7*pir; legs[1].kn.rotation.x += 2.1*pir;
      legs.forEach(l => { l.an.rotation.x += .9*(.4 + .6*pir); });
      body.position.y = .9 + .06*pir + .025*a*Math.abs(Math.sin(f)) + (st.jump || 0);
      tutu.rotation.y = -.25*Math.sin((st.spin || 0)*.5); tutu.scale.y = 1 - .25*pir;
      arms.forEach(({ sh, el, s }) => { sh.rotation.set(-.35*up - .5*pir, 0, s*(.25 + 2.35*up - 1.0*pir)); el.rotation.x = -(.45 + .3*up + .5*pir); });
      head.rotation.z = .04*Math.sin(t*1.4);
    } };
  }

  E.fx.brainrot = function(ctx, kind, o = {}){
    if (kind === 'sahur'){ const s = E.fx.sahur(ctx, { height: o.height ?? 1.5 }); s.height = o.height ?? 1.5; return s; }
    return ({ tralalero, bombardiro, ballerina })[kind](ctx, o);
  };

  E.fx.brainrot.track = function(keys){
    const K = keys.map(k => Object.assign({}, k));
    K[0].t = K[0].t ?? 0;
    for (let i = 1; i < K.length; i++){ const a = K[i-1], b = K[i]; if (b.x === undefined){ b.x = a.x; b.z = a.z; } if (b.y === undefined) b.y = a.y;
      const L = Math.hypot(b.x - a.x, b.z - a.z, (b.y ?? 0) - (a.y ?? 0)); if (b.t == null) b.t = a.t + (L > .02 ? L/(b.v || 1) : .3); }
    let yaw = K[0].yaw ?? 0;
    K.forEach((k, i) => { const n = K[i+1]; k.moving = !!n && Math.hypot(n.x - k.x, n.z - k.z, (n.y ?? 0) - (k.y ?? 0)) > .02;
      const flat = !!n && Math.hypot(n.x - k.x, n.z - k.z) > .02;
      if (flat) yaw = Math.atan2(n.x - k.x, n.z - k.z); else if (k.yaw != null) yaw = k.yaw; k.face = yaw; });
    const out = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, moving: false }, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    return function at(t){
      let i = 0; while (i < K.length - 1 && t >= K[i+1].t) i++;
      const k = K[i], n = K[i+1], p = K[i-1];
      if (k.moving && t > k.t){ const u = clamp((t - k.t)/(n.t - k.t), 0, 1);
        out.x = k.x + (n.x - k.x)*u; out.z = k.z + (n.z - k.z)*u; out.y = (k.y ?? 0) + ((n.y ?? 0) - (k.y ?? 0))*u;
        out.speed = Math.hypot(n.x - k.x, n.z - k.z)/(n.t - k.t); out.moving = true; }
      else { out.x = k.x; out.z = k.z; out.y = k.y ?? 0; out.speed = 0; out.moving = false; }
      out.yaw = p ? p.face + wrap(k.face - p.face)*smooth(k.t, k.t + .4, t) : k.face;
      return out;
    };
  };
})();
