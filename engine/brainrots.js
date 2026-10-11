/* Brainrots: the series cast, built in code (smooth shapes, like fx.sahur), animated as a pure function of time.
   Load after kit.js. Colours go through ctx.col. Every character stands with its feet on y = 0 and faces +z.

   Engine.fx.brainrot(ctx, kind, o) -> { object, update(t, st), height }
     kind 'sahur'       Tung Tung Tung Sahur (Engine.fx.sahur, ~1.5 m here): st {speed, dir, look, surprise, raise, swing, jump, lean}
          'tralalero'   Tralalero Tralala: a blue shark (lofted body, countershading, gills, grin) on three legs in sneakers,
                        ~1.55 m to the fin tip
                        st {speed, dir, look, surprise, chomp, jump, wag}
          'bombardiro'  Bombardiro Crocodilo: a crocodile that is a twin-engine bomber, 3.8 m wingspan
                        st {alt (m above y), bank, pitch, chomp, bombs (how many still hang, 0..2), prop (0..1 engine power)}
          'ballerina'   Ballerina Cappuccina: a ballerina whose head is a cappuccino on its saucer, with a face on the cup, ~1.7 m
                        st {speed, dir, arms (0 low .. 1 en haut), spin (radians), pirouette (0..1: on pointe, one leg in passé), jump, surprise}
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
      if (!g.attributes.normal) g.computeVertexNormals();
      if (sc[0]*sc[1]*sc[2] < 0) for (const a of [g.attributes.position.array, g.attributes.normal.array])   // mirrored part: restore the winding
        for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++){ const t = a[i+3+k]; a[i+3+k] = a[i+6+k]; a[i+6+k] = t; }
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

  // ---------- Tralalero Tralala: a blue shark on three legs in sneakers ----------
  // body lofted from cross-sections (not a lathe): sec(u) gives half-width w, height above (ht) and below (hb) the centre
  // line at y; u runs from the tail stalk (0) to the snout tip (1). Superellipse rings (n = 2.2) keep it sleek, not round.
  function loft(L, z0, sec, color, nU = 72, nV = 48, n = 2.2){
    const P = [], Cc = [], I = [], e = 2/n, sg = v => v < 0 ? -1 : 1;
    for (let i = 0; i <= nU; i++){ const u = i/nU, s = sec(u), z = z0 + u*L;
      for (let j = 0; j <= nV; j++){ const th = j/nV*Math.PI*2, sn = Math.sin(th), cs = Math.cos(th);
        const x = s.w*sg(sn)*Math.pow(Math.abs(sn), e), y = s.y + (cs >= 0 ? s.ht : s.hb)*sg(cs)*Math.pow(Math.abs(cs), e);
        P.push(x, y, z); const c = color(x, y, z, th, u); Cc.push(c.r, c.g, c.b); } }
    for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++){ const a = i*(nV + 1) + j, b = a + nV + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setIndex(I); g.computeVertexNormals();
    const N = g.attributes.normal;   // close the seam: average the normals of the first and last column of every ring
    for (let i = 0; i <= nU; i++){ const a = i*(nV + 1), b = a + nV; _p.set(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize();
      N.setXYZ(a, _p.x, _p.y, _p.z); N.setXYZ(b, _p.x, _p.y, _p.z); }
    return g;
  }
  // a limb along -y from its joint: radius r0 at the top to r1 at the bottom, a muscle bulge in between
  function limb(len, r0, r1, bulge = 0, seg = 16){
    const pts = []; for (let i = 0; i <= 12; i++){ const v = i/12; pts.push(new THREE.Vector2(Math.max(1e-3, r0 + (r1 - r0)*v + bulge*Math.sin(Math.PI*Math.min(1, v*1.15)) - (v === 1 ? r1*.6 : 0) - (v === 0 ? r0*.6 : 0)), -v*len)); }
    return new THREE.LatheGeometry(pts.reverse(), seg);
  }
  function tralalero(ctx, o){
    const c = ctx.col, root = new THREE.Group(), body = grp(root, 0, .86, 0);
    const TOP = c('#245296'), BLUE = c('#3b82d4'), SIDE = c('#5a9ee3'), BELLY = c('#f1f5f8'), SLIT = c('#16335c'), WHITE = c('#ffffff'), CAV = c('#4a0f1c'), GUM = c('#c8495a');
    const skin = MAT({ roughness: .32 }), fin = MAT({ roughness: .36 }), shoeM = MAT({ roughness: .58 }), glossy = MAT({ roughness: .06 }), mouthM = MAT({ roughness: .7 });
    // a stocky great white, not a mako: deep body, mass forward, blunt conical snout, thin tail stalk
    const L = 1.62, Z0 = -.86;   // tail stalk at z = -.86, snout tip at z = .76
    const W = u => u <= .58 ? .045 + .215*Math.pow(Math.sin(Math.PI/2*clamp((u - .04)/.54, 0, 1)), 1.25) : Math.max(.02, .26*Math.pow(Math.cos(Math.PI/2*(u - .58)/.42), .55));
    const sec = u => { const w = W(u); return { w, ht: 1.3*w, hb: (1.15 - .15*smooth(.75, 1, u))*w, y: .04*Math.sin(Math.PI*u) + .02*smooth(.85, 1, u) }; };
    const tmp = new THREE.Color(), sp = E.mulberry32(9);
    // countershading: dark back, bright flank, white belly below a slightly wavy line, a faint speckle
    const shade = (x, y, z, th, u) => { const a = Math.min(th, Math.PI*2 - th), edge = 1.8 + .035*Math.sin(u*23) + .015*Math.sin(u*61);
      tmp.copy(TOP).lerp(BLUE, smooth(.15, .9, a)).lerp(SIDE, smooth(1.1, 1.65, a)).lerp(BELLY, smooth(edge - .07, edge + .07, a));
      return tmp.clone().multiplyScalar(.97 + .06*sp()); };
    const bodyGeo = loft(L, Z0, u => { const q = sec(u); if (u <= 0 || u >= 1){ q.w = q.ht = q.hb = 0; } return q; }, shade, 72, 48, 2.05);   // closed at both ends
    const bm = new THREE.Mesh(bodyGeo, skin); bm.castShadow = bm.receiveShadow = true; body.add(bm);
    // a point on the skin at u along the body, angle th round it (0 = top, PI = belly), pushed out by k
    const surf = (u, th, k = 1) => { const s = sec(u), e = 2/2.05, sn = Math.sin(th), cs = Math.cos(th), sg = v => v < 0 ? -1 : 1;
      return [k*s.w*sg(sn)*Math.pow(Math.abs(sn), e), s.y + k*(cs >= 0 ? s.ht : s.hb)*sg(cs)*Math.pow(Math.abs(cs), e), Z0 + u*L]; };
    // eyes under a brow ridge, five gill slits, nostrils
    for (const s of [-1, 1]){
      const e = surf(.845, s*1.3, .97);
      put([[SPH, e, [0, s*.5, 0], [.026, .034, .04], c('#06090f')], [SPH, [e[0] + s*.012, e[1] + .012, e[2] + .022], 0, .009, WHITE]], body, glossy);
      put([[SPH, surf(.85, s*1.16, 1.0), [.2, s*.45, s*.35], [.034, .016, .06], BLUE]], body, skin);
      for (let k = 0; k < 5; k++){ const u = .64 + k*.03, pts = [1.45, 1.7, 1.95, 2.18].map(a => new THREE.Vector3(...surf(u - (a - 1.45)*.012, s*a, 1.004)));
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, .0065 - k*.0004, 6), new THREE.MeshStandardMaterial({ color: SLIT, roughness: .6 })); body.add(m); }
      put([[SPH, surf(.965, s*2.2, .99), [0, 0, 0], [.012, .008, .02], SLIT]], body, skin);
    }
    // the grin: a dark mouth under the snout, gum, a row of upper teeth and (on the chomping jaw) lower teeth
    const mouthAt = (k, out = 1.0) => { const a = Math.PI + (k - .5)*2*1.2, u = .76 + .1*Math.cos((k - .5)*Math.PI); return surf(u, a, out); };
    const rim = new THREE.CatmullRomCurve3([...Array(9)].map((_, i) => new THREE.Vector3(...mouthAt(i/8, 1.003))));
    put([[SPH, surf(.8, Math.PI, .88), 0, [.15, .045, .11], CAV]], body, mouthM);
    const gum = new THREE.Mesh(new THREE.TubeGeometry(rim, 40, .012, 8), new THREE.MeshStandardMaterial({ color: GUM, roughness: .5 })); body.add(gum);
    const tUp = []; for (let k = 0; k < 17; k++){ const p = rim.getPoint(.03 + k*.059); tUp.push([C(0, .016, 4), [p.x*.985, p.y - .022, p.z - .004], [Math.PI, 0, 0], [1, .046, .55], WHITE]); }
    put(tUp, body, glossy);
    const jaw = grp(body, 0, 0, 0), tLo = [];
    for (let k = 0; k < 13; k++){ const p = rim.getPoint(.08 + k*.07); tLo.push([C(0, .013, 4), [p.x*.9, p.y - .04, p.z - .035], 0, [1, .036, .55], WHITE]); }
    put(tLo, jaw, glossy);
    // fins: thin and sharp. Dorsal (falcate), second dorsal, pectorals (long sickles), pelvics, anal, tail (lunate) + keels
    const thin = (pts, d = .022) => plate(pts, d, .005);
    const FIN = (x, y) => tmp.copy(BLUE).lerp(TOP, smooth(.2, .5, y)).clone();
    put([[thin([[.19, 0], [.07, .22, -.14, .4], [-.1, .19, -.13, .02], [-.17, 0]], .026), surf(.55, 0, .93), [0, -Math.PI/2, 0], 1, FIN]], body, fin);
    put([[thin([[.05, 0], [0, .05, -.05, .08], [-.04, .03, -.05, 0]], .015), surf(.27, 0, .9), [0, -Math.PI/2, 0], 1, TOP]], body, fin);
    put([[thin([[.04, 0], [.0, -.05, -.05, -.07], [-.03, -.02, -.04, 0]], .015), surf(.24, Math.PI, .9), [0, -Math.PI/2, 0], 1, BELLY]], body, fin);
    for (const s of [-1, 1]){
      put([[thin([[.13, 0], [.05, -.18, -.2, -.38], [-.08, -.17, -.08, 0]], .024), surf(.64, s*2.15, .9), [s*.75, -Math.PI/2, 0], 1, (x, y, z, nx, ny) => tmp.copy(BLUE).lerp(TOP, smooth(.2, .8, ny)).lerp(SIDE, smooth(-.2, -.8, ny)).clone()]], body, fin);
      put([[thin([[.05, 0], [.0, -.05, -.07, -.09], [-.03, -.03, -.04, 0]], .015), surf(.36, s*2.5, .92), [s*.8, -Math.PI/2, 0], 1, BELLY]], body, fin);
      put([[SPH, surf(.06, s*Math.PI/2, .95), 0, [.02, .008, .07], TOP]], body, skin);
    }
    const tail = grp(body, 0, sec(0).y, Z0 + .01);
    put([[thin([[.03, 0], [-.04, .2, -.2, .43], [-.1, .24, -.07, .03], [-.11, -.13, -.17, -.27], [-.04, -.12, .03, 0]], .028), [0, 0, 0], [0, -Math.PI/2, 0], 1, FIN]], tail, fin);
    // three legs (two in front, one behind: a tripod gait) in sneakers with laces, eyelets, heel tab and tread
    const SHOE = c('#2b63d9'), SHOE2 = c('#1f4cb3'), SOLE = c('#f4f6f8'), TREAD = c('#7d8590'), LACE = c('#ffffff');
    const legs = [[-.15, .12], [.15, .12], [0, -.22]].map(([x, z]) => {
      const hp = grp(root, x, .62, z), kn = grp(hp, 0, -.27, 0), an = grp(kn, 0, -.27, 0);   // hips inside the belly
      put([[SPH, [0, 0, 0], 0, .048, BLUE], [limb(.28, .054, .04, .01), [0, 0, 0], 0, 1, BLUE]], hp, skin);
      put([[SPH, [0, 0, .003], 0, [.04, .041, .043], BLUE], [limb(.27, .04, .029, .007), [0, 0, 0], 0, 1, BLUE]], kn, skin);
      put([[SPH, [0, -.052, .03], 0, [.07, .028, .15], SOLE], [SPH, [0, -.07, .03], 0, [.071, .012, .151], TREAD],
           ...[-.06, -.02, .02, .06, .1].map(q => [BOX, [0, -.081, .03 + q], 0, [.1, .004, .012], c('#5b626b')]),
           [SPH, [0, -.012, .045], 0, [.062, .056, .12], SHOE], [SPH, [0, -.03, .135], 0, [.055, .04, .055], SHOE2],
           [SPH, [0, -.005, -.05], 0, [.058, .062, .055], SOLE], [BOX, [0, .05, -.085], [-.25, 0, 0], [.03, .05, .012], SHOE2],
           [SPH, [0, .028, .06], [-.5, 0, 0], [.035, .012, .07], c('#4d82e8')], [new THREE.TorusGeometry(.05, .014, 8, 20), [0, .035, -.01], [Math.PI/2, 0, 0], [1, 1.15, 1], SHOE2],
           ...[0, 1, 2, 3].map(k => [C(.004, .004, 6), [0, .03 - k*.012, .025 + k*.028], [0, 0, Math.PI/2], [1, .085, 1], LACE]),
           ...[0, 1, 2, 3].flatMap(k => [-1, 1].map(s => [SPH, [s*.043, .03 - k*.012, .025 + k*.028], 0, .006, c('#d9dde3')])),
           ...[-1, 1].map(s => [new THREE.TorusGeometry(.016, .004, 6, 14), [s*.018, .045, .02], [Math.PI/2 - .4, 0, s*.5], 1, LACE]),
           ...[-1, 1].map(s => [SPH, [s*.058, -.035, .03], 0, [.012, .014, .1], SOLE])], an, shoeM);
      return { hp, kn, an };
    });
    root.scale.setScalar((o.height ?? 1.55)/1.55); ctx.scene.add(root);
    return { object: root, height: o.height ?? 1.55, update(t, st = {}){
      const a = clamp((st.speed || 0)/.9, 0, 1.4), dir = st.dir ?? 1, f = st.phase ?? t*6.2832*2.4, sur = st.surprise || 0;
      stepLegs(legs, f, a, dir, [0, Math.PI, Math.PI/2]);
      body.position.y = .86 + .03*a*Math.abs(Math.sin(f)) + (st.jump || 0) + .01*Math.sin(t*2.1);
      body.rotation.set(.04*a*dir - .1*sur, 0, .05*a*Math.sin(f*.5));
      tail.rotation.y = (.35*a + .18)*Math.sin(t*(4 + 6*a)) + (st.wag || 0)*.6*Math.sin(t*14);
      const ch = st.chomp || 0; jaw.position.set(0, -.035*ch*Math.abs(Math.sin(t*9)), 0);
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
    const cloth = MAT({ roughness: .7 }), skinM = MAT({ roughness: .55 }), china = MAT({ roughness: .18 }), satin = MAT({ roughness: .3 }), glossy = MAT({ roughness: .08 });
    // tutu: three ruffled layers; leotard torso; neck
    const tutu = grp(body, 0, -.02, 0);
    [[.45, PINK3, -.02], [.4, PINK2, .015], [.34, PINK, .05]].forEach(([r, col, y]) => {
      const g = new THREE.CylinderGeometry(.13, r, .05, 48, 1, false); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++){ const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); if (d > .2){ const a = Math.atan2(z, x), k = 1 + .045*Math.sin(a*14); p.setX(i, x*k); p.setZ(i, z*k); p.setY(i, p.getY(i) - .02*Math.cos(a*14)); } }
      put([[g, [0, y, 0], 0, 1, col]], tutu, cloth); });
    const torso = u => .095 + .03*Math.sin(Math.PI*u*.9) + .02*smooth(.7, 1, u);
    put([[lathe(torso, .36, 28, 24), [0, .02, 0], [-Math.PI/2, 0, 0], [1.1, 1, .8], PINK], [SPH, [0, .38, 0], 0, [.15, .05, .1], PINK],
         [C(.04, .044, 14), [0, .425, 0], 0, [1, .07, 1], SKIN]], body, cloth);
    // head = cappuccino on a saucer: the cup, its rim, the latte art, the handle
    const head = grp(body, 0, .455, 0); head.scale.setScalar(1.25);
    const cupR = u => .1 + .075*Math.pow(u, .8) - .03*Math.pow(1 - u, 6);
    put([[C(.2, .17, 40), [0, .01, 0], 0, [1, .025, 1], CUP], [new THREE.TorusGeometry(.2, .01, 8, 40), [0, .024, 0], [Math.PI/2, 0, 0], 1, CUP],
         [lathe(cupR, .28, 40, 24), [0, .03, 0], [-Math.PI/2, 0, 0], 1, CUP], [new THREE.TorusGeometry(.172, .011, 8, 40), [0, .31, 0], [Math.PI/2, 0, 0], 1, CUP],
         [new THREE.TorusGeometry(.065, .018, 10, 24, Math.PI*1.2), [.19, .17, 0], [0, 0, -Math.PI*.6], 1, CUP]], head, china);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(.164, 40), new THREE.MeshStandardMaterial({ map: latte(), roughness: .35 }));
    coffee.rotation.x = -Math.PI/2; coffee.position.y = .3; head.add(coffee);
    // foam rising over the rim (so the coffee reads from the front too), a drip down the side, a pink band
    put([[SPH, [0, .315, 0], 0, [.15, .035, .15], c('#efe0c4')], [SPH, [.03, .335, -.02], 0, [.06, .018, .06], c('#f6ecd9')],
         [SPH, [-.15, .26, .07], 0, [.018, .05, .018], c('#8a5a35')], [SPH, [-.152, .225, .07], 0, .016, c('#8a5a35')]], head, china);
    put([[C(.162, .156, 40), [0, .245, 0], 0, [1.005, .02, 1.005], c('#f27aa9')]], head, china);
    // her face, painted on the cup: big eyes with lashes, thin brows, blush, a small smile (an 'o' when surprised)
    const cupAt = y => cupR((y - .03)/.28), onCup = (x, y, inset = 0) => { const r = cupAt(y) - inset; return [x, y, Math.sqrt(Math.max(0, r*r - x*x))]; };
    const matte = MAT({ roughness: .5 }), DARKF = c('#2a1a14');
    const eyes = [-1, 1].map(s => { const p = onCup(s*.06, .165, .004), g = grp(head, ...p); g.rotation.y = Math.atan2(p[0], p[2]);
      put([[SPH, [0, 0, 0], 0, [.031, .038, .016], c('#ffffff')]], g, glossy);
      const iris = grp(g, 0, -.004, 0);
      put([[SPH, [0, 0, .011], 0, [.02, .023, .008], c('#6a3c22')], [SPH, [0, 0, .016], 0, [.011, .013, .005], c('#120a06')], [SPH, [.007, .009, .02], 0, .0055, c('#ffffff')]], iris, glossy);
      put([0, 1, 2].map(k => [BOX, [s*(.016 + k*.008), .034 - k*.006, .006], [0, 0, s*(-.45 - k*.4)], [.0045, .018, .004], DARKF]), g, matte);
      return { g, iris }; });
    for (const s of [-1, 1]){ const b = onCup(s*.062, .218, -.002), q = onCup(s*.098, .118, -.001);
      put([[SPH, b, [0, Math.atan2(b[0], b[2]), s*-.18], [.024, .0045, .005], c('#7a4a32')]], head, matte);
      put([[SPH, q, [0, Math.atan2(q[0], q[2]), 0], [.022, .012, .004], c('#f59ab5')]], head, matte); }
    const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([-.03, -.015, 0, .015, .03].map((x, i) => new THREE.Vector3(...onCup(x, .102 - [.0, .008, .011, .008, .0][i], -.001)))), 16, .0045, 6),
      new THREE.MeshStandardMaterial({ color: c('#b8324f'), roughness: .5 })); head.add(smile);
    const mouthO = new THREE.Mesh(solid([[SPH, onCup(0, .098, -.002), 0, [.012, .016, .005], c('#7a1f35')]]), matte); mouthO.visible = false; head.add(mouthO);
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
      const sur = st.surprise || 0, blink = sur < .5 && ((t + .7) % 3.6) < .11 ? .1 : 1;
      eyes.forEach(e => { e.g.scale.set(1 + .2*sur, (1 + .25*sur)*blink, 1); });
      smile.visible = sur < .45; mouthO.visible = !smile.visible; mouthO.scale.set(1, .7 + .6*sur, 1);
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
