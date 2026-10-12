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
          'chimpanzini' Chimpanzini Bananini: a chimpanzee in a banana (peel flaps open at the top), ~1.35 m
                        st {speed, dir, look, surprise, cheer (arms up, waving), laugh, jump}
          'patapim'     Brr Brr Patapim: a trunk of twisted roots (moss, ivy, shelf fungi, a knot hole, mushrooms) with a
                        proboscis monkey's head (ginger fur, cream beard, the long drooping nose) under a crown of leaves,
                        thin twig arms, huge bare feet, ~1.95 m: st {speed, dir, look, surprise, shiver ('brr brr'), jump}
          'sixseven'    67 (also '67'): the numbers 6 and 7 as one creature, an eye in each, blue arms with white hands,
                        trainers, ~1.6 m: st {speed, dir, look, surprise, sixseven (0..1 the six-seven hands), jump}
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
  // opts.us: the rings' u values (default nU + 1 evenly spaced); opts.clip(u) -> {lo, hi, xr}: y is clamped into that range
  // (a flat cut, e.g. a mouth; xr: the cut face's half-width), and color(x, y, z, th, u, cut) learns whether the point was
  // clamped; opts.warp(u, x, y) -> [x, y] reshapes a ring after the cut. Normals are always those of the plain surface
  function loft(L, z0, sec, color, nU = 72, nV = 48, n = 2.2, opts = {}){
    const P = [], Cc = [], I = [], e = 2/n, sg = v => v < 0 ? -1 : 1;
    const us = opts.us || [...Array(nU + 1)].map((_, i) => i/nU); nU = us.length - 1;
    const RAW = [];
    for (const u of us){ const s = sec(u), z = z0 + u*L, cl = opts.clip ? opts.clip(u) : null;
      for (let j = 0; j <= nV; j++){ const th = j/nV*Math.PI*2, sn = Math.sin(th), cs = Math.cos(th);
        let x = s.w*sg(sn)*Math.pow(Math.abs(sn), e), y = s.y + (cs >= 0 ? s.ht : s.hb)*sg(cs)*Math.pow(Math.abs(cs), e), cut = false;
        RAW.push(x, y, z);
        if (cl){ if (cl.lo != null && y < cl.lo){ y = cl.lo; cut = true; } if (cl.hi != null && y > cl.hi){ y = cl.hi; cut = true; }
          if (cut && cl.xr != null) x = sg(x)*Math.min(Math.abs(x), cl.xr); }   // the cut face ends at the rim, never sticks out
        if (opts.warp) [x, y] = opts.warp(u, x, y);
        P.push(x, y, z); const c = color(x, y, z, th, u, cut); Cc.push(c.r, c.g, c.b); } }
    for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++){ const a = i*(nV + 1) + j, b = a + nV + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(RAW, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setIndex(I); g.computeVertexNormals();                                  // shaded as the uncut surface...
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));      // ...shaped with the cuts
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
    // the mouth line: from the corners (UC, low on the sides behind the eye) forward and down to the chin (UF). The head is
    // cut flat along it: above is the head (its cut face is the palate), below is the lower jaw, hinged at the corners
    const UC = .76, UF = .93, EPS = .0015;
    const cutY = u => { const q = sec(u), v = clamp((u - UC)/(UF - UC), 0, 1); return q.y - q.hb + .72*Math.pow(1 - v, .75)*q.hb; };
    const rimX = u => { const q = sec(u), d = Math.min(1, Math.abs((cutY(u) - q.y)/q.hb)); return q.w*Math.pow(1 - Math.pow(d, 2.05), 1/2.05); };
    const inMouth = u => u > UC && u < UF;
    const tmp = new THREE.Color(), sp = E.mulberry32(9);
    // countershading: dark back, bright flank, white belly below a slightly wavy line, a faint speckle
    const shade = (x, y, z, th, u) => { const a = Math.min(th, Math.PI*2 - th), edge = 1.8 + .035*Math.sin(u*23) + .015*Math.sin(u*61);
      tmp.copy(TOP).lerp(BLUE, smooth(.15, .9, a)).lerp(SIDE, smooth(1.1, 1.65, a)).lerp(BELLY, smooth(edge - .07, edge + .07, a));
      return tmp.clone().multiplyScalar(.97 + .06*sp()); };
    const US = [...Array(73)].map((_, i) => i/72).filter(u => Math.abs(u - UC) > .004).concat([UC - EPS, UC - EPS/3, UC + EPS]).sort((a, b) => a - b);
    const lip = (x, y, z, th, u, cut) => cut && u < UC + EPS*1.5 ? CAV.clone().multiplyScalar(.45) : cut ? tmp.copy(BELLY).multiplyScalar(.97 + .06*sp()).clone() : shade(x, y, z, th, u);   // cut faces: belly white, a clean lip edge
    const bodyGeo = loft(L, Z0, u => { const q = sec(u); if (u <= 0 || u >= 1){ q.w = q.ht = q.hb = 0; } return q; },   // closed at both ends
      lip, 72, 48, 2.05, { us: US, clip: u => inMouth(u) ? { lo: cutY(u) } : null });
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
    // the lower jaw: the same skin below the mouth line (so it closes without a seam), its top face the floor of the
    // mouth with a gum edge; capped at the hinge and the chin. Teeth: a U of triangles on each jaw, on the gum line
    const zAt = u => Z0 + u*L, hinge = [0, sec(UC).y - sec(UC).hb, zAt(UC)];   // hinged at the bottom: it opens forward, never off the chin
    const jaw = grp(body, ...hinge);
    // it starts just behind the corners, tucked a hair inside the head (no seam line on the skin), its back dark (seen only open)
    const JB = UC - EPS/3, JU = [UC - .007, UC - .0045, JB, ...[...Array(25)].map((_, i) => UC + EPS + (UF - UC - 2*EPS)*i/24), UF - EPS*.5];   // [cap, dark ring, skin...]
    const jawGeo = loft(L, Z0, u => { const q = sec(u); if (u === JU[0] || u === JU[JU.length - 1]){ q.y = (cutY(u) + q.y - q.hb)/2; q.w = q.ht = q.hb = 0; } return q; },
      (x, y, z, th, u, cut) => u < JB ? CAV.clone().multiplyScalar(.6) : lip(x, y, z, th, u, cut), 0, 40, 2.05,
      { us: JU, clip: u => ({ hi: cutY(u), xr: rimX(u) }), warp: (u, x, y) => { if (u !== JU[1]) return [x, y]; const yc = (cutY(u) + sec(u).y - sec(u).hb)/2; return [x*.985, yc + (y - yc)*.985]; } });
    jawGeo.translate(-hinge[0], -hinge[1], -hinge[2]);
    const jm = new THREE.Mesh(jawGeo, skin); jm.castShadow = jm.receiveShadow = true; jaw.add(jm);
    // the inside of the mouth: separate plates with exact edges (painting it on the skin smeared red over the lips).
    // palate under the head's cut, floor on the jaw's cut (both dark with a pink gum band), and the back of the throat
    const inside = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    function plate2(rows, dy, inset, dz = [0, 0, 0]){   // rows: [u...] -> a flat strip between the rims, gum band at the edges
      const P = [], Cc = [], I = [], push = (x, y, z, col) => { P.push(x - dz[0], y - dz[1], z - dz[2]); Cc.push(col.r, col.g, col.b); };
      rows.forEach(u => { const xr = Math.max(0, rimX(u) - inset), b = Math.min(.016, xr*.45), y = cutY(u) + dy, z = zAt(u);
        [[-xr, GUM], [-xr + b, GUM], [-xr + b, CAV], [xr - b, CAV], [xr - b, GUM], [xr, GUM]].forEach(([x, col]) => push(x, y, z, col)); });
      for (let r = 0; r < rows.length - 1; r++) for (const k of [0, 2, 4]){ const a = r*6 + k, b = a + 6; I.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      g.setIndex(I); g.computeVertexNormals(); return g; }
    const rows = JU.slice(3, -1);
    body.add(new THREE.Mesh(plate2(rows, -.0015, 0), inside));
    jaw.add(new THREE.Mesh(plate2(rows, .0015, .003, hinge), inside));
    { const u = UC + EPS, q = sec(u), yc = cutY(u), xr = .96*rimX(u), z = zAt(u) + .0008, P = [0, yc - .02, z], I = [], Cc = [CAV.r, CAV.g, CAV.b];   // the throat wall
      for (let i = 0; i <= 24; i++){ const x = -xr + 2*xr*i/24, d = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x/q.w), 2.05)), 1/2.05);
        P.push(x, Math.min(yc, q.y - .96*q.hb*d), z); Cc.push(CAV.r*.7, CAV.g*.7, CAV.b*.7); if (i) I.push(0, i, i + 1); }
      for (let i = 0; i <= 24; i++){ P.push(-xr + 2*xr*i/24, yc, z); Cc.push(CAV.r, CAV.g, CAV.b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      for (let i = 0; i < 24; i++) I.push(1 + i, 26 + i, 2 + i, 2 + i, 26 + i, 27 + i);
      g.setIndex(I); body.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: CAV.clone().multiplyScalar(.45), side: THREE.DoubleSide }))); }
    const uMid = (UC + UF)/2;
    put([[SPH, [0, cutY(uMid) + .002 - hinge[1], zAt(uMid) - hinge[2]], 0, [.5*rimX(uMid), .016, .28*(zAt(UF) - zAt(UC))], c('#c94861')]], jaw, mouthM);   // tongue, on the floor
    // upper teeth: an overbite, hanging just outside the lower lip all round the U (so they read as triangles from the
    // front and the side, never half-buried); lower teeth on the jaw's floor, hidden while the mouth is shut
    const tUp = [], tLo = [];
    // the rim as a polyline from the right corner round the chin to the left corner, measured, teeth at equal steps
    const RIM = []; for (let i = 0; i <= 120; i++){ const k = i/120, sg = k < .5 ? 1 : -1, q = Math.abs(1 - 2*k), u = UF - (UF - UC - .02)*Math.pow(q, .9);
      RIM.push([sg*rimX(u), cutY(u), zAt(u), u]); }
    const acc = [0]; for (let i = 1; i < RIM.length; i++) acc.push(acc[i-1] + Math.hypot(RIM[i][0] - RIM[i-1][0], RIM[i][2] - RIM[i-1][2]));
    const at = d => { let i = 1; while (i < RIM.length - 1 && acc[i] < d) i++; const a = RIM[i-1], b = RIM[i], f = (d - acc[i-1])/(acc[i] - acc[i-1] || 1);
      return { p: a.map((v, k) => v + (b[k] - v)*f), dx: b[0] - a[0], dz: b[2] - a[2] }; };
    const NT = 21, total = acc[acc.length - 1];
    // each upper tooth hangs along the skin below it (down the jaw's flank, back along the chin), flat against it
    const skinN = (u, x, y) => { const f = (uu, tt) => new THREE.Vector3(...surf(uu, tt));
      let a = Math.PI/2, b = Math.PI, sd = x < 0 ? -1 : 1; for (let k = 0; k < 30; k++){ const m = (a + b)/2; if (surf(u, sd*m)[1] > y) a = m; else b = m; }
      const tt = sd*(a + b)/2, du = f(u + 1e-4, tt).sub(f(u - 1e-4, tt)), dt = f(u, tt + 1e-4).sub(f(u, tt - 1e-4)), n = du.cross(dt).normalize();
      if (n.dot(f(u, tt).sub(_p.set(0, sec(u).y, zAt(u)))) < 0) n.negate(); return n; };
    const DOWN = new THREE.Vector3(0, -1, 0), BX = new THREE.Vector3(), BZ = new THREE.Vector3(), BM = new THREE.Matrix4(), BQ = new THREE.Quaternion(), BE = new THREE.Euler();
    for (let i = 0; i < NT; i++){ const { p } = at(total*(i + .5)/NT), n = skinN(p[3], p[0], p[1]);
      const tg = DOWN.clone().addScaledVector(n, -DOWN.dot(n)).normalize(), ax = DOWN.clone().lerp(tg, .5).normalize();   // apex direction
      BZ.copy(n).addScaledVector(ax, -n.dot(ax)).normalize(); BX.crossVectors(ax.clone().negate(), BZ);                 // local -y = apex, z = out
      BM.makeBasis(BX, ax.clone().negate(), BZ); BQ.setFromRotationMatrix(BM); BE.setFromQuaternion(BQ, 'YXZ');
      const mid = 1 - Math.abs((i + .5)/NT*2 - 1), big = .6 + .4*Math.pow(mid, .6), h = .05*big;
      tUp.push([C(.014*big, 0, 6), [p[0] + n.x*.0045 + ax.x*.48*h, p[1] + n.y*.0045 + ax.y*.48*h, p[2] + n.z*.0045 + ax.z*.48*h], [BE.x, BE.y, BE.z], [1, h, .3], WHITE]);
      const hl = Math.hypot(n.x, n.z) || 1, nx = n.x/hl, nz = n.z/hl;
      if (i > 1 && i < NT - 2) tLo.push([C(0, .011*big, 6), [p[0] - nx*.02, p[1] + .016*big - hinge[1], p[2] - nz*.02 - hinge[2]], [0, Math.atan2(nx, nz), 0], [1, .042*big, .5], WHITE]); }
    // the lip: a dark line along the rim, over the roots of the teeth
    const lipLine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(RIM.filter((_, i) => i % 3 === 0).map(r => { const n = skinN(r[3], r[0], r[1]); return new THREE.Vector3(r[0] + n.x*.0035, r[1] + n.y*.0035 + .0015, r[2] + n.z*.0035); })), 160, .0045, 8),
      new THREE.MeshStandardMaterial({ color: c('#3b1a26'), roughness: .5 })); body.add(lipLine);
    put(tUp, body, glossy); put(tLo, jaw, glossy);
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
      const ch = st.chomp || 0; jaw.rotation.x = .12*sur + .34*ch*Math.abs(Math.sin(t*8));   // shut at rest; snaps open when chomping, gapes when surprised
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

  const SPL = new THREE.SphereGeometry(1, 12, 9), SPX = new THREE.SphereGeometry(1, 8, 6);
  // eyes that blink and widen: a white, an iris, a pupil, a highlight, on a group facing +z; returns the group
  function eyeball(parent, p, r, iris, mats, ry = 0){
    const g = grp(parent, ...p); g.rotation.y = ry;
    put([[SPH, [0, 0, 0], 0, [r, r*1.08, r*.6], c0('#ffffff')], [SPH, [0, 0, r*.42], 0, [r*.58, r*.62, r*.25], iris], [SPH, [0, 0, r*.56], 0, [r*.32, r*.35, r*.14], c0('#0d0a08')],
      [SPH, [r*.2, r*.28, r*.62], 0, r*.13, c0('#ffffff')]], g, mats);
    return g;
  }
  let c0 = h => new THREE.Color(h);   // set per character to ctx.col

  // ---------- Chimpanzini Bananini: a chimpanzee in a banana ----------
  function chimpanzini(ctx, o){
    const c = ctx.col; c0 = c;
    const root = new THREE.Group(), body = grp(root, 0, .42, 0), tmp = new THREE.Color();
    const YEL = c('#f6d23c'), YEL2 = c('#dcb024'), GRN = c('#a9c24a'), TIP = c('#4a3320'), CREAM = c('#f4ebc8'), FUR = c('#4a3226'), FUR2 = c('#6a4a36'), SKIN = c('#d3a787'), SKIND = c('#a8785c'), FOOT = c('#5a4234');
    const peel = MAT({ roughness: .42 }), fur = MAT({ roughness: .85 }), skinM = MAT({ roughness: .6 }), glossy = MAT({ roughness: .08 }), flapM = MAT({ roughness: .45, side: THREE.DoubleSide });
    // the banana: lofted up a gentle bow (bulging backwards), a dark stalk end at the bottom, a few sugar spots, ridges
    const BH = .7, sec = u => { const w = u < .01 ? 0 : .03 + .205*Math.pow(Math.sin(Math.PI/2*Math.min(1, u/.6)), .75) + .012*smooth(.85, 1, u); return { w, ht: w, hb: w, y: .07*Math.sin(Math.PI*u) }; };
    const bcol = (x, y, z, th, u) => { if (u < .07) return TIP; const spot = smooth(.93, 1, Math.sin(th*7 + u*23)*Math.sin(th*3 - u*31 + 1.7));
      return tmp.copy(GRN).lerp(YEL, smooth(.07, .3, u)).lerp(TIP, .7*spot).multiplyScalar(.95 + .08*Math.abs(Math.cos(th*2.5))).clone(); };
    const bg = loft(BH, 0, sec, bcol, 40, 40, 2.0); bg.rotateX(-Math.PI/2); bg.translate(0, -.04, 0);
    const bm = new THREE.Mesh(bg, peel); bm.castShadow = bm.receiveShadow = true; body.add(bm);
    const surfB = (u, th, k = 1) => { const s = sec(u); return new THREE.Vector3(k*s.w*Math.sin(th), u*BH - .04, -(s.y + k*s.w*Math.cos(th))); };
    put([.45, 2.0, 3.6, 5.1].map(th => [new THREE.TubeGeometry(new THREE.CatmullRomCurve3([.12, .3, .5, .7, .9, .985].map(u => surfB(u, th, 1.01))), 24, .006, 5), 0, 0, 1, YEL2]), body, peel);
    // four peel flaps folding out and down from the open top, yellow outside, cream inside
    { const pp = [], R0 = sec(1).w, yTop = BH - .04, L = .34, curl = 2.2, k = curl/L;
      for (let f = 0; f < 4; f++){ const a = Math.PI/4 + f*Math.PI/2 + .15*Math.sin(f*2.3), D = [Math.sin(a), 0, Math.cos(a)], T = [Math.cos(a), 0, -Math.sin(a)];
        for (const [off, col] of [[0, YEL], [-.009, CREAM]]){
          const g = new THREE.PlaneGeometry(1, 1, 4, 12), p = g.attributes.position;
          for (let i = 0; i < p.count; i++){ const v = p.getX(i), s = (p.getY(i) + .5)*L, ph = k*s, out = (1 - Math.cos(ph))/k, up = Math.sin(ph)/k, wd = .2*(1 - .55*Math.pow(s/L, 2));
            const nx = Math.cos(ph), ny = -Math.sin(ph), o2 = out + nx*off, u2 = up + ny*off;
            p.setXYZ(i, D[0]*(R0 - .01 + o2) + T[0]*v*wd, yTop + u2, D[2]*(R0 - .01 + o2) + T[2]*v*wd); }
          g.computeVertexNormals(); pp.push([g, 0, 0, 1, col]); } }
      put(pp, body, flapM); }
    // the head: fur, a pale face, a big muzzle, brow ridge, ears, eyes, a grin full of teeth (an 'o' when surprised)
    const head = grp(body, 0, .8, .02);
    put([[SPH, [0, .02, -.02], 0, [.18, .18, .17], FUR], [SPH, [0, .14, -.05], 0, [.12, .07, .1], FUR2],
         ...[-1, 0, 1].map(s => [C(0, .03, 6), [s*.04, .2, -.05], [-.3, 0, s*.4], [1, .1, 1], FUR]),
         ...[-1, 1].map(s => [SPH, [s*.185, .0, -.01], 0, [.035, .065, .055], FUR])], head, fur);
    put([[SPH, [0, -.01, .085], 0, [.14, .14, .1], SKIN], [SPH, [0, -.085, .13], 0, [.115, .075, .095], SKIN], [SPH, [0, .055, .125], 0, [.13, .032, .05], SKIND],
         ...[-1, 1].map(s => [SPH, [s*.2, .0, 0], 0, [.022, .055, .045], SKIN]), ...[-1, 1].map(s => [SPH, [s*.016, -.055, .222], 0, [.01, .007, .006], c('#3a2418')])], head, skinM);
    const eyes = [-1, 1].map(s => eyeball(head, [s*.052, .022, .168], .03, c('#6a3c22'), glossy, s*.25));
    const grin = new THREE.Group(); grin.position.set(0, -.115, .2); head.add(grin);
    put([[SPH, [0, 0, 0], 0, [.075, .035, .025], c('#5a1f22')], [SPH, [0, .014, .006], 0, [.066, .014, .02], c('#ffffff')], [SPH, [0, -.016, .008], 0, [.04, .012, .015], c('#d65a6a')]], grin, skinM);
    const mouthO = new THREE.Mesh(solid([[SPH, [0, -.115, .205], 0, [.035, .045, .02], c('#4a1a1c')]]), skinM); mouthO.visible = false; head.add(mouthO);
    // long furry arms out of the banana, leathery hands
    const arms = [-1, 1].map(s => { const sh = grp(body, s*.225, .5, 0), el = grp(sh, 0, -.27, 0);
      put([[SPH, [0, 0, 0], 0, .055, FUR], [limb(.28, .055, .045, .01), [0, 0, 0], 0, 1, FUR]], sh, fur);
      put([[SPH, [0, 0, 0], 0, .045, FUR], [limb(.25, .045, .036, .006), [0, 0, 0], 0, 1, FUR]], el, fur);
      put([[SPH, [0, -.29, .01], 0, [.04, .055, .03], SKIND], ...[-1.5, -.5, .5, 1.5].map(k => [C(.011, .009, 6), [k*.017, -.355, .012], 0, [1, .07, 1], SKIND]), [SPH, [-s*.035, -.29, .03], 0, [.014, .03, .014], SKIND]], el, skinM);
      return { sh, el, s }; });
    // short legs and long chimp feet
    const legs = [-1, 1].map(s => { const l = leg(body, s*.1, .02, 0, .2, .2, .068, .055, FUR, fur);
      put([[SPH, [0, -.005, .05], 0, [.068, .035, .13], FOOT], [SPH, [-s*.055, -.01, .12], 0, [.022, .02, .04], FOOT], ...[-1, 0, 1].map(k => [SPH, [s*.012 + k*.026, -.012, .175], 0, [.015, .016, .03], FOOT])], l.an, skinM);
      return l; });
    root.scale.setScalar((o.height ?? 1.35)/1.35); ctx.scene.add(root);
    return { object: root, height: o.height ?? 1.35, update(t, st = {}){
      const a = clamp((st.speed || 0)/.9, 0, 1.4), dir = st.dir ?? 1, f = st.phase ?? t*6.2832*2.2, sur = st.surprise || 0, cheer = st.cheer || 0, laugh = st.laugh || 0;
      stepLegs(legs, f, a, dir, [0, Math.PI]);
      body.position.y = .42 + .035*a*Math.abs(Math.sin(f)) + (st.jump || 0) + .006*Math.sin(t*2.3);
      body.rotation.z = .05*a*Math.sin(f) + .03*Math.sin(t*1.1); body.rotation.x = .04*a*dir;
      arms.forEach(({ sh, el, s }, i) => { const swing = .55*a*Math.sin(f + (i ? 0 : Math.PI)), wave = cheer*.35*Math.sin(t*9 + i*1.6);
        sh.rotation.set(-swing - .15 - 1.0*sur*(1 - cheer), 0, s*(.18 + 2.5*cheer + wave)); el.rotation.x = -.35 - .4*cheer - .5*sur; });
      head.rotation.set(.12*laugh*Math.abs(Math.sin(t*9)) - .08*sur, 0, .05*Math.sin(t*1.3));
      if (st.look){ root.updateMatrixWorld(true); const v = body.worldToLocal(_p.copy(st.look)); head.rotation.y = clamp(Math.atan2(v.x, v.z), -.6, .6); } else head.rotation.y = 0;
      const blink = sur < .5 && ((t + .3) % 3.3) < .1 ? .1 : 1; eyes.forEach(e => e.scale.set(1 + .25*sur, (1 + .3*sur)*blink, 1));
      grin.visible = sur < .45; mouthO.visible = !grin.visible; mouthO.scale.setScalar(.7 + .6*sur); grin.scale.set(1, 1 + .8*laugh*Math.abs(Math.sin(t*9)), 1);
    } };
  }

  // ---------- Brr Brr Patapim: a tree with a proboscis monkey's face and enormous feet ----------
  function patapim(ctx, o){
    const c = ctx.col; c0 = c;
    const root = new THREE.Group(), body = grp(root, 0, .6, 0), tmp = new THREE.Color();
    const BARK = c('#7a5236'), BARKD = c('#4a3020'), BARKL = c('#a27650'), MOSS = c('#6f9a3a'), MOSS2 = c('#93b84a'), LEAF = c('#3f8a32'), LEAF2 = c('#7dbd52'), IVY = c('#3f7a2e');
    const SKIN = c('#e8a47a'), SKIND = c('#cf845c'), NOSE = c('#e98f78'), NOSET = c('#e2715f'), FUR = c('#b8662c'), FURD = c('#8a4a20'), CREAM = c('#efe2c8'), FEET = c('#f0bfa4'), FEETD = c('#d99e86'), NAIL = c('#f7e3d6');
    const bark = MAT({ roughness: .92 }), leafM = MAT({ roughness: .7 }), skinM = MAT({ roughness: .55 }), furM = MAT({ roughness: .85 }), glossy = MAT({ roughness: .08 });
    const barkCol = (x, y, z) => { const g = .5 + .5*Math.sin(y*70 + Math.atan2(x, z)*9 + Math.sin(x*53 + z*47)*1.2); return tmp.copy(BARKD).lerp(BARK, smooth(.05, .5, g)).lerp(BARKL, smooth(.88, 1, g)*.45).clone(); };
    // twisted roots: n strands spiralling round an axis along -y from 0 to -len, radius r0 -> r1 (a limb, or the trunk)
    const strands = (len, r0, r1, n, twist, y0 = 0, up = false, off = .48, rad = .62) => [...Array(n)].map((_, i) => {
      const pts = []; for (let k = 0; k <= 12; k++){ const v = k/12, r = r0 + (r1 - r0)*v, a = 2*Math.PI*i/n + twist*v; pts.push(new THREE.Vector3(Math.cos(a)*r*off, y0 + (up ? 1 : -1)*v*len, Math.sin(a)*r*off)); }
      return [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, (r0 + r1)/2*rad, 8), 0, 0, 1, barkCol]; });
    // the trunk: a core and five twisted strands, narrowing to the neck; a knot hole, moss, shelf fungi, ivy, mushrooms
    const TR = u => .2 - .075*u + .012*Math.sin(u*11);
    put([[lathe(TR, .82, 28, 24), [0, -.04, 0], [-Math.PI/2, 0, 0], 1, barkCol], ...strands(.84, .21, .13, 7, 2.6, -.05, true, .86, .3), [SPH, [0, -.03, 0], 0, [.2, .06, .2], BARK]], body, bark);
    put([[new THREE.TorusGeometry(.04, .014, 8, 18), [.07, .25, .2], [0, .35, 0], [1, 1.3, 1], BARKL], [SPH, [.07, .25, .197], [0, .35, 0], [.035, .05, .02], c('#1e130c')]], body, bark);
    put([[1.9, .12, .09], [-2.3, .4, .1], [2.7, .58, .07], [-.9, .02, .08], [.5, .66, .06], [-1.5, .7, .07]].flatMap(([a, y, r]) => { const R0 = TR(y/.82) + .045;
      return [0, 1, 2].map(k => [SPH, [Math.sin(a + k*.12)*R0, y + k*.025, Math.cos(a + k*.12)*R0], [0, a, 0], [r*(1 - k*.25), r*.6, .035], k%2 ? MOSS2 : MOSS]); }), body, leafM);
    put([[-1.25, .3, .1], [-1.0, .38, .075], [1.4, .5, .08]].map(([a, y, r]) => [new THREE.CylinderGeometry(r, r, .025, 16, 1, false, 0, Math.PI), [Math.sin(a)*(TR(y/.82) + .02), y, Math.cos(a)*(TR(y/.82) + .02)], [0, a + Math.PI/2, 0], 1, (x, yy, z, nx, ny) => ny > .5 ? c('#e0a65a') : c('#f2dfb4')]), body, bark);
    { const pts = []; for (let k = 0; k <= 40; k++){ const v = k/40, a = v*Math.PI*3.2 + .6, r = TR(v*.75) + .03; pts.push(new THREE.Vector3(Math.sin(a)*r, .02 + v*.62, Math.cos(a)*r)); }
      const vine = new THREE.CatmullRomCurve3(pts), lv = [[new THREE.TubeGeometry(vine, 80, .009, 6), 0, 0, 1, IVY]];
      for (let k = 1; k < 14; k++){ const p = vine.getPoint(k/14), tg = vine.getTangent(k/14), side = k%2 ? 1 : -1; lv.push([SPX, [p.x + tg.z*.03*side, p.y + .015, p.z - tg.x*.03*side], [0, Math.atan2(p.x, p.z) + side*.6, side*.5], [.035, .008, .025], k%3 ? LEAF : LEAF2]); }
      put(lv, body, leafM); }
    for (const [a, y, s] of [[2.4, .0, 1], [2.75, -.01, .7], [-2.6, .02, .8]]){ const r = TR(0) + .02, x = Math.sin(a)*r, z = Math.cos(a)*r;
      put([[C(.012*s, .016*s, 8), [x, y + .03*s, z], 0, [1, .06*s, 1], c('#f2e6d0')], [SPH, [x, y + .065*s, z], 0, [.035*s, .02*s, .035*s], c('#d8402f')], ...[0, 1, 2].map(k => [SPH, [x + Math.cos(k*2.1)*.02*s, y + .078*s, z + Math.sin(k*2.1)*.02*s], 0, .005*s, c('#ffffff')])], body, skinM); }
    // the head on top of the trunk: a proboscis monkey. Ginger fur cap and fringe, a pale face, a heavy brow, small sleepy
    // eyes, the long drooping nose over a small grumpy mouth, a cream beard round the jaw, little ears
    const head = grp(body, 0, .97, .02);
    put([[SPH, [0, .02, -.02], 0, [.23, .23, .21], FUR], [SPH, [0, .1, -.06], 0, [.2, .14, .17], FURD],
         ...[...Array(11)].map((_, k) => { const a = -1.25 + k*.25; return [SPH, [Math.sin(a)*.165, .155 + .015*Math.cos(k*1.7), Math.cos(a)*.13 + .02], [0, a, 0], [.045, .032, .038], k%2 ? FUR : FURD]; })], head, furM);
    put([[SPH, [0, -.03, .1], 0, [.175, .19, .13], SKIN], ...[-1, 1].map(s => [SPH, [s*.075, -.07, .19], 0, [.05, .045, .04], SKIN]), ...[-1, 1].map(s => [SPH, [s*.22, .0, .0], 0, [.028, .045, .025], SKIN])], head, skinM);
    put([...[...Array(13)].map((_, k) => { const a = Math.PI*(.2 + .6*k/12), r = .14; return [SPH, [Math.cos(a)*r, -.12 - Math.sin(a)*r*.6, .1 + Math.sin(a)*.05], 0, [.03, .034, .028], k%2 ? CREAM : c('#e3d3b4')]; }),
         ...[-1, 1].map(s => [SPH, [s*.15, -.06, .07], 0, [.03, .05, .035], CREAM])], head, furM);   // a cream beard under the jaw, whiskers at the cheeks
    const eyes = [-1, 1].map(s => eyeball(head, [s*.062, .022, .198], .031, c('#9a6a22'), glossy, s*.25));
    const lids = [-1, 1].map(s => { const g = grp(head, s*.062, .043, .203); put([[SPH, [0, 0, 0], 0, [.037, .018, .024], SKIND]], g, skinM); return g; });
    const brows = [-1, 1].map(s => { const g = grp(head, s*.066, .078, .2); put([[SPH, [0, 0, 0], [0, 0, s*.2], [.05, .017, .025], FURD], [SPH, [s*.03, .006, -.004], [0, 0, s*.5], [.025, .012, .02], FUR]], g, furM); return g; });
    const nose = grp(head, 0, .0, .215);
    put([[SPH, [0, -.01, .01], 0, [.03, .04, .03], SKIN], [SPH, [0, -.07, .045], [.35, 0, 0], [.05, .09, .052], NOSE], [SPH, [0, -.14, .065], 0, [.062, .052, .058], NOSE],
         [SPH, [0, -.15, .085], 0, [.045, .035, .04], NOSET], ...[-1, 1].map(s => [SPH, [s*.022, -.18, .085], [.6, 0, 0], [.013, .008, .009], c('#6a2a22')])], nose, skinM);
    put([[SPH, [0, -.165, .17], 0, [.075, .035, .045], SKIN], [new THREE.TorusGeometry(.045, .007, 6, 16, Math.PI*.75), [0, -.21, .175], [0, 0, Math.PI*.125], 1, c('#6a2a2a')], [SPH, [0, -.215, .15], 0, [.05, .03, .04], SKIN]], head, skinM);
    // the crown: leaves sprouting from the top of the head, a few twigs
    const crown = grp(head, 0, .2, -.03);
    put([[0, .2, 0, .25], [.17, .11, .05, .18], [-.17, .12, -.04, .19], [.04, .12, -.17, .17], [-.06, .08, .15, .15], [.1, .32, -.04, .15], [-.11, .3, .05, .14], [.2, .24, -.1, .12], [-.2, .22, .1, .11]].map(([x, y, z, r]) =>
      [SPL, [x, y, z], 0, [r, r*.85, r], (xx, yy, zz, nx, ny) => tmp.copy(LEAF).lerp(LEAF2, .5 + .5*ny).multiplyScalar(.9 + .15*Math.sin(xx*40 + zz*31)).clone()]), crown, leafM);
    { const lv = []; for (let k = 0; k < 26; k++){ const a = k*2.39, h = .05 + (k%5)*.07, r = .2 + .06*Math.sin(k);
        lv.push([SPX, [Math.cos(a)*r, h + .05, Math.sin(a)*r], [0, -a, -.5 - .3*Math.sin(k*1.7)], [.07, .012, .035], k%3 ? LEAF : LEAF2]); }
      lv.push([C(.01, .022, 6), [.16, .05, .1], [.5, 0, -.8], [1, .25, 1], BARK], [C(.01, .022, 6), [-.18, .06, -.08], [-.4, 0, .9], [1, .25, 1], BARK], [C(.008, .018, 6), [.02, .42, .02], [.2, 0, .3], [1, .16, 1], BARK]);
      put(lv, crown, leafM); }
    // thin twisted arms, knobby elbows, twig fingers, a few leaves
    const arms = [-1, 1].map(s => { const sh = grp(body, s*.22, .7, 0), el = grp(sh, 0, -.32, 0);
      put([[SPH, [0, 0, 0], 0, .05, BARK], ...strands(.33, .06, .045, 3, 1.6), [SPX, [s*.04, -.15, .02], [0, 0, s*.6], [.06, .014, .035], LEAF2]], sh, bark);
      put([[SPH, [0, 0, 0], 0, .042, BARKL], ...strands(.3, .045, .032, 3, -1.4), [SPX, [s*.03, -.2, .02], [0, 0, -s*.5], [.05, .012, .03], LEAF]], el, bark);
      put([[SPH, [0, -.31, .01], 0, [.04, .035, .03], BARK], ...[-.55, -.2, .15, .5].map(a => [C(.004, .011, 5), [Math.sin(a)*.05, -.355 - Math.cos(a)*.012, .012], [0, 0, a], [1, .11, 1], BARKD]), [C(.004, .011, 5), [-s*.045, -.31, .035], [.6, 0, s*.9], [1, .08, 1], BARKD]], el, bark);
      return { sh, el, s }; });
    // legs of twisted roots on enormous bare feet with toenails, roots wrapped round the ankles
    const legs = [-1, 1].map(s => { const hp = grp(body, s*.12, .0, 0), kn = grp(hp, 0, -.3, 0), an = grp(kn, 0, -.29, 0);
      put([[SPH, [0, 0, 0], 0, .06, BARK], ...strands(.3, .07, .055, 3, 1.8)], hp, bark);
      put([[SPH, [0, 0, 0], 0, .05, BARKL], ...strands(.29, .055, .045, 3, -1.6)], kn, bark);
      put([[new THREE.TorusGeometry(.055, .014, 6, 18), [0, .03, -.01], [Math.PI/2 + .2, 0, 0], 1, BARK], [new THREE.TorusGeometry(.05, .012, 6, 18), [0, .07, 0], [Math.PI/2 - .2, 0, 0], 1, BARKL]], an, bark);
      put([[SPH, [0, -.02, .1], 0, [.12, .065, .2], FEET], [SPH, [0, -.03, -.03], 0, [.09, .06, .08], FEET], [SPH, [0, -.07, .1], 0, [.115, .015, .19], FEETD], [SPH, [0, .02, .02], 0, [.07, .05, .07], FEET],
           ...[-2, -1, 0, 1, 2].flatMap(k => { const big = k === -2*s, x = k*.042 - s*.01, z = .29 - Math.abs(k)*.014 + (big ? .01 : 0), r = big ? .032 : .022;
             return [[SPH, [x, -.025 + (big ? .01 : 0), z], 0, [r, r, r*1.25], FEET], [SPH, [x, -.012 + (big ? .012 : 0), z + r*.7], [-.3, 0, 0], [r*.65, r*.25, r*.5], NAIL]]; })], an, skinM);
      return { hp, kn, an }; });
    root.scale.setScalar((o.height ?? 1.95)/2.15); ctx.scene.add(root);   // modelled ~2.15 m to the top leaf
    return { object: root, height: o.height ?? 1.95, update(t, st = {}){
      const a = clamp((st.speed || 0)/.8, 0, 1.3), dir = st.dir ?? 1, f = st.phase ?? t*6.2832*1.6, sur = st.surprise || 0, brr = st.shiver || 0;
      stepLegs(legs, f, a*.9, dir, [0, Math.PI]);
      const stomp = Math.pow(Math.abs(Math.sin(f)), 3);
      body.position.y = .6 + .05*a*(1 - stomp) + (st.jump || 0) + .006*Math.sin(t*1.7);
      body.rotation.set(.03*a*dir + brr*.03*Math.sin(t*41), 0, .06*a*Math.sin(f) + brr*.05*Math.sin(t*37));
      body.position.x = brr*.012*Math.sin(t*53);
      head.rotation.set(-.06*sur + .03*a*Math.sin(f*2) + brr*.06*Math.sin(t*39), 0, .04*Math.sin(t*1.2) + brr*.07*Math.sin(t*35));
      crown.rotation.set(.04*Math.sin(t*1.3 + 1) + .08*a*Math.sin(f + .6) + brr*.08*Math.sin(t*29), 0, .05*Math.sin(t*1.1) + brr*.1*Math.sin(t*33));
      arms.forEach(({ sh, el, s }, i) => { const swing = .4*a*Math.sin(f + (i ? 0 : Math.PI)); sh.rotation.set(-swing - .1 - .9*sur, 0, s*(.25 + .4*sur + .15*brr*Math.sin(t*31 + i))); el.rotation.x = -.3 - .3*sur; });
      nose.rotation.x = .1*Math.sin(t*2.1) + .2*a*Math.sin(f*2) + brr*.2*Math.sin(t*45); nose.rotation.z = .07*Math.sin(t*1.4);
      if (st.look){ root.updateMatrixWorld(true); const v = body.worldToLocal(_p.copy(st.look)); head.rotation.y = clamp(Math.atan2(v.x, v.z), -.45, .45); } else head.rotation.y = 0;
      const blink = sur < .5 && ((t + 1.1) % 4.1) < .14 ? .1 : 1;
      eyes.forEach(e => e.scale.set(1 + .3*sur, (1 + .4*sur)*blink, 1)); lids.forEach(l => { l.position.y = .043 + .03*sur; l.scale.y = 1 - .7*sur; });
      brows.forEach((b, i) => { b.position.y = .085 + .03*sur; b.rotation.z = (i ? -1 : 1)*(.12 - .3*sur); });
    } };
  }

  // ---------- 67: the numbers six and seven as one creature, one eye in each, doing the six-seven hands ----------
  function sixseven(ctx, o){
    const c = ctx.col; c0 = c;
    const root = new THREE.Group(), body = grp(root, 0, .6, 0), tmp = new THREE.Color();
    const V1 = c('#9a63f2'), V2 = c('#7444d6'), V3 = c('#b78cfa'), BLUE = c('#5ab0ff'), BLUE2 = c('#2f6fd6'), WHITE = c('#f7f8fa'), GREY = c('#9aa3ad'), SOLE = c('#eef1f4');
    const numM = MAT({ roughness: .35 }), limbM = MAT({ roughness: .5 }), glossy = MAT({ roughness: .08 });
    const ncol = (x, y, z, nx, ny, nz) => tmp.copy(V2).lerp(V1, smooth(-.2, .6, nz)).lerp(V3, smooth(.6, 1, ny)*.5).clone();
    const DEPTH = .26, ex = { depth: DEPTH, bevelEnabled: true, bevelThickness: .06, bevelSize: .055, bevelSegments: 4, curveSegments: 24 };
    // a thick stroke along a curve, round end caps
    const stroke = (pts, w) => { const crv = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0))), n = 30, L = [], Rr = [];
      for (let i = 0; i <= n; i++){ const p = crv.getPoint(i/n), tg = crv.getTangent(i/n); L.push(new THREE.Vector2(p.x - tg.y*w/2, p.y + tg.x*w/2)); Rr.push(new THREE.Vector2(p.x + tg.y*w/2, p.y - tg.x*w/2)); }
      const s = new THREE.Shape(); s.moveTo(L[0].x, L[0].y); L.slice(1).forEach(v => s.lineTo(v.x, v.y));
      const e = crv.getPoint(1), te = crv.getTangent(1), ae = Math.atan2(te.y, te.x); s.absarc(e.x, e.y, w/2, ae + Math.PI/2, ae - Math.PI/2, true);
      Rr.reverse().forEach(v => s.lineTo(v.x, v.y)); const b = crv.getPoint(0), tb = crv.getTangent(0), ab = Math.atan2(tb.y, tb.x); s.absarc(b.x, b.y, w/2, ab - Math.PI/2, ab + Math.PI/2, true);
      const g = new THREE.ExtrudeGeometry(s, ex); g.translate(0, 0, -DEPTH/2); return g; };
    const ring = (cx, cy, R, r) => { const s = new THREE.Shape(); s.absarc(cx, cy, R, 0, 2*Math.PI, false); const h = new THREE.Path(); h.absarc(cx, cy, r, 0, 2*Math.PI, true); s.holes.push(h);
      const g = new THREE.ExtrudeGeometry(s, ex); g.translate(0, 0, -DEPTH/2); return g; };
    const bar = (x0, y0, x1, y1, r) => { const s = new THREE.Shape(); s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
      s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0); const g = new THREE.ExtrudeGeometry(s, ex); g.translate(0, 0, -DEPTH/2); return g; };
    // the 6 on the left, the 7 on the right (digit space: bottom at y = 0, about 1 m tall)
    const six = grp(body, -.31, -.05, 0), seven = grp(body, .31, -.05, 0);
    put([[ring(0, .29, .29, .12), 0, 0, 1, ncol], [stroke([[-.2, .32], [-.24, .6], [-.13, .86], [.08, .97], [.2, .95]], .21), 0, 0, 1, ncol]], six, numM);
    put([[bar(-.27, .8, .29, 1.0, .07), 0, 0, 1, ncol], [stroke([[.2, .86], [.11, .55], [.0, .25], [-.06, .1]], .21), 0, 0, 1, ncol]], seven, numM);
    const FZ = DEPTH/2 + .06;   // front face
    const eyes = [eyeball(six, [-.12, .76, FZ], .085, c('#3a7be0'), glossy, .2), eyeball(seven, [-.03, .9, FZ], .075, c('#3a7be0'), glossy, -.05)];
    const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...Array(9)].map((_, k) => { const a = -Math.PI*(.18 + .64*k/8); return new THREE.Vector3(Math.cos(a)*.205, .29 + Math.sin(a)*.205, FZ + .003); })), 24, .017, 8),
      new THREE.MeshStandardMaterial({ color: c('#2a1a3a'), roughness: .5 })); six.add(smile);
    const mouthO = new THREE.Mesh(solid([[SPH, [0, .085, FZ], 0, [.045, .04, .012], c('#2a1a3a')]]), numM); mouthO.visible = false; six.add(mouthO);
    // blue arms (light upper, dark fore), white mitten hands that turn palm up for the six-seven
    const arms = [[-1, -.72, .62], [1, .63, .6]].map(([s, x, y]) => { const sh = grp(body, x, y, .04), el = grp(sh, 0, -.25, 0), hand = grp(el, 0, -.25, 0);
      put([[SPH, [0, 0, 0], 0, .055, BLUE], [limb(.26, .05, .044, .006), [0, 0, 0], 0, 1, BLUE]], sh, limbM);
      put([[SPH, [0, 0, 0], 0, .046, BLUE2], [limb(.25, .044, .038, .004), [0, 0, 0], 0, 1, BLUE2]], el, limbM);
      put([[SPH, [0, -.05, 0], 0, [.06, .07, .03], WHITE], [SPH, [-s*.05, -.03, .012], [0, 0, s*.5], [.02, .035, .02], WHITE], [C(.036, .04, 12), [0, .0, 0], 0, [1, .03, 1], c('#d9dde3')]], hand, limbM);
      return { sh, el, hand, s }; });
    // legs under each number, chunky grey and white trainers
    const legs = [[-1, -.3], [1, .24]].map(([s, x]) => { const l = leg(body, x, .02, 0, .26, .26, .055, .045, BLUE, limbM);
      put([[SPH, [0, -.015, .025], 0, [.075, .06, .13], GREY], [SPH, [0, -.055, .03], 0, [.082, .025, .145], SOLE], [SPH, [0, -.07, .03], 0, [.083, .01, .146], c('#7d8590')],
           [SPH, [0, .012, .1], [-.4, 0, 0], [.05, .02, .05], WHITE], [new THREE.TorusGeometry(.055, .015, 8, 20), [0, .04, -.01], [Math.PI/2, 0, 0], [1, 1.2, 1], WHITE]], l.an, limbM);
      return l; });
    root.scale.setScalar((o.height ?? 1.6)/1.6); ctx.scene.add(root);
    return { object: root, height: o.height ?? 1.6, update(t, st = {}){
      const a = clamp((st.speed || 0)/.9, 0, 1.4), dir = st.dir ?? 1, f = st.phase ?? t*6.2832*2.3, sur = st.surprise || 0, ss = st.sixseven || 0, beat = Math.sin(t*9.4);
      stepLegs(legs, f, a, dir, [0, Math.PI]);
      body.position.y = .6 + .03*a*Math.abs(Math.sin(f)) + (st.jump || 0) + .015*ss*Math.abs(beat);
      body.rotation.set(.04*a*dir, 0, .04*a*Math.sin(f) + .05*ss*beat);
      six.rotation.z = .025*Math.sin(t*1.7) + .04*ss*beat; seven.rotation.z = .025*Math.sin(t*1.7 + 1.5) - .04*ss*beat;
      arms.forEach(({ sh, el, hand, s }, i) => { const swing = .5*a*Math.sin(f + (i ? 0 : Math.PI)), up = ss*.35*(i ? -beat : beat);
        sh.rotation.set(-swing - ss*(.55 + up) - .9*sur, -s*.45*ss, s*(.2 + .2*sur + .05*ss)); el.rotation.x = -.25 - ss*1.05 - .4*sur; hand.rotation.set(ss*.2, 0, -s*ss*1.4); });
      if (st.look){ root.updateMatrixWorld(true); const v = body.worldToLocal(_p.copy(st.look)); body.rotation.y = clamp(Math.atan2(v.x, v.z), -.3, .3)*.6; }
      const blink = sur < .5 && ((t + .5) % 2.9) < .1 ? .1 : 1; eyes.forEach((e, i) => e.scale.set(1 + .25*sur, (1 + .3*sur)*(i ? blink : (((t + 1.6) % 3.7) < .1 && sur < .5 ? .1 : 1)), 1));
      smile.visible = sur < .45; mouthO.visible = !smile.visible; mouthO.scale.setScalar(.7 + .6*sur);
    } };
  }

  E.fx.brainrot = function(ctx, kind, o = {}){
    if (kind === 'sahur'){ const s = E.fx.sahur(ctx, { height: o.height ?? 1.5 }); s.height = o.height ?? 1.5; return s; }
    return ({ tralalero, bombardiro, ballerina, chimpanzini, patapim, sixseven, '67': sixseven })[kind](ctx, o);
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
