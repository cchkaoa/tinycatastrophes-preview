/* Scene kit for the engine: POV camera, foreground props, the cube mascot and "life" (crowds,
   birds, trees, street lamps, clouds, smoke). Load after engine.js (and look.js if used).
   Everything takes colours through ctx.col so it follows the cinematic look's linear workflow.
   Randomness at build time comes from ctx.rnd (reproducible); per-frame motion is a pure
   function of time and state, so seek / export see the same thing as live playback.

   Engine.pov(ctx, t, {pos, look, sway})          handheld eye-level camera
   Engine.kit.balcony / table / windowFrame(ctx, {...}) -> { group, seat }   foreground props
   Engine.kit.tree(m, ctx, x, z, s) · Engine.kit.lamp(m, glowM, ctx, x, z, side)   into Mergers
   Engine.fx.mascot(ctx, {scale}) -> { object, update(t, {worry, panic, look}) }
   Engine.fx.crowd(ctx, {count, paths:[{a:[x,z], b:[x,z], w}], y, blocky}) -> { update(t, dt, {panic, leave, level}) }
     (jointed fx.people walking/jogging/running; box-built by default)
   Engine.fx.birds(ctx, {count, center:[x,y,z], radius:[a,b]}) -> { update(t, {scatter}) }
   Engine.fx.clouds(ctx, {count, height:[a,b], spread}) -> { update(t, {color, opacity, wind}) }
   Engine.fx.smoke(ctx, {origin:[x,y,z], start, until, rate, life, size:[a,b], rise, drift:[x,z]})
     -> { update(t, dt, {color, opacity}) }
   Engine.kit.solid([[geometry, [x,y,z], [rx,ry,rz], scale, color], ...]) -> smooth-shaded vertex-coloured geometry
     (Engine.kit.SPH unit sphere, Engine.kit.cyl(rTop, rBottom) unit-height cylinder)
   Engine.fx.people(ctx, [{look, keys}], {blocky}) -> { update(t), hand(i, side) }   jointed people (see below);
     rounded bodies by default, blocky: true for box-built people (Minecraft / Roblox look, the user's pick in 004)
   Engine.fx.sahur(ctx, {height}) -> { object, update(t, {speed, dir, look, surprise, raise, swing, jump, lean}) }
     the channel mascot since 004: a small wooden log with a face, thin legs and a baseball bat */
(function(){
  'use strict';
  const THREE = window.THREE, E = window.Engine;
  if (!THREE || !E) { console.error('kit.js: load three.js and engine.js first'); return; }
  const { Merger, PRIM, clamp, smooth } = E;
  const kit = E.kit = {};

  function canvasTex(w, h, draw){
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  // soft round puff (clouds, smoke): several overlapping radial blobs
  function puffTexture(seed, lumps){
    const rnd = E.mulberry32(seed);
    return canvasTex(256, 256, (g, w, h) => {
      for (let i=0;i<lumps;i++){
        const x = w*(.3+.4*rnd()), y = h*(.38+.3*rnd()), r = w*(.14+.16*rnd());
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(.6, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
      }
    });
  }

  // ---------- camera ----------
  // Eye-level handheld camera: a few slow sines, so the motion is identical on every run.
  E.pov = function(ctx, t, o){
    const s = o.sway ?? .025, p = o.pos, l = o.look;
    const n = k => Math.sin(t*(.31+k*.17)+k*1.7)*.6 + Math.sin(t*(.73+k*.11)+k*2.9)*.4;
    ctx.camera.position.set(p[0] + n(1)*s, p[1] + n(2)*s*.7, p[2] + n(3)*s*.5);
    ctx.camera.lookAt(l[0] + n(4)*s*6, l[1] + n(5)*s*4, l[2]);
    if (o.roll) ctx.camera.rotateZ(o.roll);
  };

  // ---------- foreground props ----------
  // All props are built facing -z from (x, y, z) and rotated by `yaw`; `seat` is where the mascot sits.
  function place(ctx, m, o){
    const g = new THREE.Group(); g.add(m.mesh(ctx.material));
    g.position.set(o.x, o.y, o.z); g.rotation.y = o.yaw || 0; ctx.scene.add(g); return g;
  }
  function seatAt(g, x, y, z){ g.updateMatrixWorld(true); return new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld); }

  kit.balcony = function(ctx, o){
    const c = ctx.col, m = new Merger(), w = o.width ?? 3.4, d = o.depth ?? 1.4;
    const slab = c(o.slab ?? '#b9b2a6'), rail = c(o.rail ?? '#2b2f33'), top = c(o.top ?? '#6b4a33');
    m.box(0, -.1, -d/2, w, .2, d, slab);                        // floor slab edge
    m.box(0, 1.06, -d+.04, w, .05, .08, top);                    // handrail
    m.box(0, .12, -d+.04, w, .05, .05, rail);                    // bottom rail
    for (let x = -w/2+.06; x <= w/2; x += .13) m.box(x, .58, -d+.04, .025, .92, .025, rail);   // balusters
    for (const x of [-w/2+.04, w/2-.04]) m.box(x, .55, -d+.04, .07, 1.1, .07, rail);
    if (o.plant !== false){                                       // potted plant in a corner
      m.add(PRIM.cyl, w/2-.35, .2, -d+.4, .2, .4, .2, c('#a0522d'));
      m.add(PRIM.ico, w/2-.35, .62, -d+.4, .32, .38, .32, c('#5d7d4c'));
    }
    const g = place(ctx, m, o);
    return { group: g, seat: seatAt(g, o.seatX ?? -.6, 1.085, -d+.04) };
  };

  kit.table = function(ctx, o){
    const c = ctx.col, m = new Merger(), w = o.width ?? 2.2;
    m.box(0, .74, -.5, w, .05, 1, c(o.top ?? '#4a3426'));
    m.add(PRIM.cyl, .3, .82, -.35, .09, .14, .09, c('#f2f0eb'));           // mug
    m.box(.41, .83, -.35, .04, .07, .015, c('#f2f0eb'));                     // handle
    m.add(PRIM.cyl, .3, .885, -.35, .08, .005, .08, c('#3b2414'));           // coffee
    const g = place(ctx, m, o);
    return { group: g, seat: seatAt(g, -.22, .765, -.45), steam: seatAt(g, .3, .9, -.35) };
  };

  kit.windowFrame = function(ctx, o){
    const c = ctx.col, m = new Merger(), w = o.width ?? 2.6, h = o.height ?? 2.2, fr = c(o.frame ?? '#e9e4da');
    m.box(0, 0, -.6, w+.3, .12, .5, fr);                                      // sill
    m.box(0, h, -.7, w+.3, .16, .2, fr);
    for (const x of [-w/2-.08, w/2+.08, 0]) m.box(x, h/2, -.7, x ? .16 : .07, h, .14, fr);
    m.box(0, h*.55, -.7, w, .06, .1, fr);                                      // transom
    m.add(PRIM.cyl, -w/2+.4, .2, -.55, .16, .28, .16, c('#c26a3f'));
    m.add(PRIM.ico, -w/2+.4, .52, -.55, .26, .3, .26, c('#6d8a55'));
    const g = place(ctx, m, o);
    return { group: g, seat: seatAt(g, .5, .06, -.6) };
  };

  // ---------- scenery into a Merger ----------
  kit.tree = function(m, ctx, x, z, s = 1, y = 0){
    const c = ctx.col, R = ctx.R;
    const greens = ['#5f7f45', '#6d8a55', '#4f6f3e', '#7f9a5c'];
    m.box(x, y + 1.1*s, z, .26*s, 2.2*s, .26*s, c('#5a4636'));
    const n = 2 + Math.floor(ctx.rnd()*2);
    for (let i=0;i<n;i++){
      const cs = R(.9, 1.4)*s;
      m.add(PRIM.ico, x + R(-.5,.5)*s, y + (2.4 + i*.6 + R(0,.3))*s, z + R(-.5,.5)*s, cs, cs*R(.85,1.1), cs, c(ctx.pick(greens)), 0, R(0, 3));
    }
  };
  // street lamp; the bulb goes into a second Merger meshed with ctx.glowMaterial so it can bloom
  kit.lamp = function(m, glow, ctx, x, z, side = 1, y = 0){
    const dark = ctx.col('#2b2f33');
    m.box(x, y + 2.6, z, .14, 5.2, .14, dark);
    m.box(x - side*.55, y + 5.15, z, 1.1, .1, .12, dark);
    glow.box(x - side*1.05, y + 5.0, z, .34, .12, .22, ctx.col('#fff1d0'));
  };

  // ---------- mascot: the loose orange block from the logo ----------
  E.fx.mascot = function(ctx, o = {}){
    const c = ctx.col, m = new Merger(), s = o.scale ?? .34;
    m.box(0, .5, 0, 1, 1, 1, c('#ff5a1f'));
    m.box(0, .99, 0, .9, .04, .9, c('#ff7d52'));                   // lit top face edge
    for (const x of [-.28, .28]){ m.box(x, -.04, .1, .22, .12, .3, c('#24282e')); }   // feet
    const body = m.mesh(ctx.material);
    const eyes = new THREE.Group();
    const em = new Merger();
    for (const x of [-.2, .2]){ em.box(x, 0, 0, .2, .26, .04, c('#ffffff')); em.box(x, -.02, .025, .1, .14, .03, c('#151617')); }
    const eyeMesh = em.mesh(ctx.material); eyeMesh.castShadow = false; eyes.add(eyeMesh);
    eyes.position.set(0, .62, .51);
    const root = new THREE.Group(), inner = new THREE.Group();
    inner.add(body, eyes); root.add(inner); root.scale.setScalar(s);
    ctx.scene.add(root);
    return { object: root, update(t, st = {}){
      const worry = st.worry ?? 0, panic = st.panic ?? 0;
      const bob = Math.abs(Math.sin(t*1.6))*.03*(1-panic);
      const shake = panic*(Math.sin(t*41)*.03 + Math.sin(t*57)*.02);
      inner.position.set(shake, bob, 0);
      // look: turn toward a world point, plus a worried glance down
      if (st.look){ const p = root.getWorldPosition(new THREE.Vector3());
        inner.rotation.y = clamp(Math.atan2(st.look.x - p.x, st.look.z - p.z) - root.rotation.y, -1.2, 1.2) * .45; }   // a 3/4 glance keeps the face readable
      inner.rotation.x = .25*worry + Math.sin(t*.7)*.04;
      const blink = (t % 3.7) < .12 ? .15 : 1;
      eyes.scale.set(1 + .25*panic, blink*(1 + .45*panic), 1);
      eyes.position.y = .62 - .06*worry;
    }};
  };

  // ---------- people ----------
  function personGeometry(ctx){
    const m = new Merger();
    m.box(-.09, .42, 0, .15, .84, .2, new THREE.Color(.22, .22, .24));   // legs (tinted by instance colour)
    m.box(.09, .42, 0, .15, .84, .2, new THREE.Color(.22, .22, .24));
    m.box(0, 1.16, 0, .46, .66, .26, new THREE.Color(1, 1, 1));           // torso
    for (const x of [-.29, .29]) m.box(x, 1.12, 0, .11, .6, .14, new THREE.Color(.9, .9, .9));   // arms
    return m.mesh(null).geometry;
  }
  // Crowd of jointed people (fx.people) walking up and down paths: real walk / jog / run gaits instead of hopping
  // dolls. Same API as before. o.blocky (default true, the user's pick) = box-built people; false = rounded.
  // update(t, dt, {panic 0..1: hurry -> run, leave 0..1: that share walks off (hidden), level: hides anyone the water reaches})
  E.fx.crowd = function(ctx, o){
    const n = o.count ?? 120, R = ctx.R, pick = ctx.pick, paths = o.paths, y0 = o.y ?? 0;
    const shirts = o.colors ?? ['#c8463a','#3e6a87','#e6c25a','#ecebe6','#2a2c30','#7a9a7b','#c87c4b','#8e6bb0','#d98aa0','#5b7fa6','#f2f0ea','#35506b'];
    const pants = ['#2b3345','#3c4a5e','#23252a','#5b4a3a','#7d7466','#1f2d4a','#6b6f78'];
    const skins = ['#f1c9a5','#e0b08a','#c68b62','#a86f4c','#7a4a2f','#f5d6c0'];
    const hairs = ['#2a1d14','#1a1410','#5a3a22','#8a6a3a','#c9a46a','#3a3a3a','#b5b0a8'];
    const P = [], specs = [];
    for (let i=0;i<n;i++){
      const path = paths[Math.floor(ctx.rnd()*paths.length)], skirt = ctx.rnd() < .22;
      const look = { skin: pick(skins), shirt: pick(shirts), pants: pick(pants), hair: pick(hairs), shoes: pick(['#2a2a2e','#f0efe9','#5a4030','#3a3f4a']),
        hairStyle: skirt ? pick(['long','bun','long']) : pick(['short','short','cap','long','bun']),
        legs: skirt ? 'skirt' : (ctx.rnd() < .2 ? 'shorts' : 'pants'), sleeves: pick(['short','long','long','none']), scale: R(.92, 1.06) };
      const st = { path, s0: ctx.rnd(), dir: ctx.rnd() < .5 ? -1 : 1, v: R(1.05, 1.5), lat: R(-.5, .5)*(path.w ?? 1.6),
                   idle: ctx.rnd() < .15, leaveAt: ctx.rnd(), ph: R(0, 6.28) };
      st.out = { x: 0, z: 0, y: y0, yaw: 0, post: 'walk', prev: 'walk', dist: 0, w: 1, armsUp: 0 };
      P.push(st);
      specs.push({ look, ph: st.ph, at: () => st.out, hidden: () => st.gone >= 1 });
    }
    const people = E.fx.people(ctx, specs, { blocky: o.blocky ?? true });
    function reset(){ for (const p of P){ p.s = p.s0; p.d = p.dir; p.gone = 0; p.dist = p.ph; p.post = 'walk'; p.switchT = -9; p.prevPost = 'walk'; } }
    reset();
    return { people,
      reset,
      update(t, dt, u = {}){
        const panic = u.panic ?? 0, leave = u.leave ?? 0, level = u.level ?? -9;
        for (const p of P){
          const a = p.path.a, b = p.path.b, len = Math.hypot(b[0]-a[0], b[1]-a[1]);
          const speed = p.idle && panic < .2 ? 0 : p.v*(1 + 2.2*panic);
          p.s += p.d*speed*dt/len; p.dist += speed*dt;
          if (p.s > 1){ p.s = 1; p.d = -1; } if (p.s < 0){ p.s = 0; p.d = 1; }
          if (p.leaveAt < leave || level > y0 + .4) p.gone = Math.min(1, p.gone + dt*2.5);
          const post = speed === 0 ? 'stand' : speed < 2 ? 'walk' : speed < 3.2 ? 'jog' : 'run';
          if (post !== p.post){ p.prevPost = p.post; p.post = post; p.switchT = t; }
          const nx = -(b[1]-a[1])/len, nz = (b[0]-a[0])/len, O = p.out;
          O.x = a[0] + (b[0]-a[0])*p.s + nx*p.lat; O.z = a[1] + (b[1]-a[1])*p.s + nz*p.lat;
          O.yaw = Math.atan2((b[0]-a[0])*p.d, (b[1]-a[1])*p.d);
          O.post = p.post; O.prev = p.prevPost; O.w = smooth(p.switchT, p.switchT + .4, t); O.dist = p.dist;
        }
        people.update(t);
      } };
  };

  // ---------- birds ----------
  E.fx.birds = function(ctx, o = {}){
    const n = o.count ?? 36, R = ctx.R, ctr = o.center ?? [0, 35, -60], rad = o.radius ?? [12, 45];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,.25, -.9,.35,-.1, 0,0,-.25,  0,0,.25, 0,0,-.25, .9,.35,-.1], 3));
    g.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: ctx.col(o.color ?? '#1d2024'), side: THREE.DoubleSide }), n);
    mesh.frustumCulled = false; ctx.scene.add(mesh);
    const B = []; for (let i=0;i<n;i++) B.push({ r: R(rad[0], rad[1]), h: R(-8, 8), w: R(.25, .45)*(ctx.rnd()<.5?-1:1), ph: R(0, 6.28), f: R(7, 10), s: R(.8, 1.2) });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    return { mesh, update(t, u = {}){
      const sc_ = u.scatter ?? 0, vis = u.visible ?? 1;
      for (let i=0;i<n;i++){
        const b = B[i], a = b.ph + t*b.w*(1 + 2*sc_), r = b.r*(1 + sc_*3);
        v.set(ctr[0] + Math.cos(a)*r, ctr[1] + b.h + Math.sin(t*.5 + b.ph)*2 + sc_*40, ctr[2] + Math.sin(a)*r);
        e.set(0, -a + (b.w > 0 ? 0 : Math.PI), 0); q.setFromEuler(e);
        const flap = Math.sin(t*b.f*(1 + sc_) + b.ph);
        m4.compose(v, q, sc.set(b.s*vis, b.s*flap*vis, b.s*vis)); mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }};
  };

  // ---------- clouds ----------
  E.fx.clouds = function(ctx, o = {}){
    const n = o.count ?? 16, R = ctx.R, spread = o.spread ?? 320, hgt = o.height ?? [70, 120], ctr = o.center ?? [0, 0, -120];
    const texs = [puffTexture(11, 9), puffTexture(23, 12), puffTexture(37, 7)];
    const C = [];
    for (let i=0;i<n;i++){
      const mat = new THREE.SpriteMaterial({ map: ctx.pick(texs), transparent: true, depthWrite: false, opacity: o.opacity ?? .9 });
      const sp = new THREE.Sprite(mat), w = R(o.size?.[0] ?? 50, o.size?.[1] ?? 110);
      sp.scale.set(w, w*R(.35, .5), 1); ctx.scene.add(sp);
      C.push({ sp, x: R(-spread/2, spread/2), y: R(hgt[0], hgt[1]), z: R(-spread*.8, spread*.2) });
    }
    return { update(t, u = {}){
      const wind = u.wind ?? 1.2, col = u.color, op = u.opacity ?? (o.opacity ?? .9);
      for (const c of C){
        let x = c.x + wind*t; x = ((x + spread/2) % spread + spread) % spread - spread/2;
        c.sp.position.set(ctr[0] + x, c.y, ctr[2] + c.z);
        if (col) c.sp.material.color.copy(col);
        c.sp.material.opacity = op;
      }
    }};
  };

  // ---------- smoke / steam / dust ----------
  // A fixed pool of puffs born at a steady rate from `origin`; each puff's state depends only on
  // its birth time, so any frame can be computed directly (seek and export stay exact).
  E.fx.smoke = function(ctx, o){
    const max = o.max ?? 140, life = o.life ?? 9, size = o.size ?? [3, 12], rise = o.rise ?? 3, drift = o.drift ?? [1.2, 0];
    const tex = puffTexture(o.seed ?? 5, 8), R = ctx.R;
    const P = [];
    for (let i=0;i<max;i++){
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: ctx.col(o.color ?? '#6b6863') });
      const sp = new THREE.Sprite(mat); sp.visible = false; ctx.scene.add(sp);
      P.push({ sp, jx: R(-1, 1), jz: R(-1, 1), rot: R(0, 6.28), k: R(.8, 1.2) });
    }
    const org = o.origin;
    return { reset(){}, update(t, dt, u = {}){
      const start = o.start ?? 0, until = o.until ?? Infinity, rate = o.rate ?? 8, op = u.opacity ?? o.opacity ?? .65;
      const col = u.color;
      for (let i=0;i<max;i++){
        const p = P[i];
        // puff i is born at start + i/rate + j*max/rate for the latest cycle j that has begun
        const period = max/rate; let born = start + i/rate;
        if (t < born){ p.sp.visible = false; continue; }
        born += Math.floor((t - born)/period)*period;
        if (born > until){ const b0 = start + i/rate; born = b0 + Math.floor((until - b0)/period)*period; }   // emitter stopped: only the last puffs, fading out
        const age = t - born, a = age/life;
        if (born < start || a > 1){ p.sp.visible = false; continue; }
        const s = (size[0] + (size[1]-size[0])*Math.sqrt(a))*p.k;
        p.sp.visible = true;
        p.sp.position.set(org[0] + drift[0]*age + p.jx*s*.3, org[1] + rise*age*(1 - a*.4), org[2] + drift[1]*age + p.jz*s*.3);
        p.sp.scale.set(s, s, 1); p.sp.material.rotation = p.rot + age*.08;
        p.sp.material.opacity = op*smooth(0, .12, a)*(1 - smooth(.55, 1, a));
        if (col) p.sp.material.color.copy(col);
      }
    }};
  };

  // ---------- smooth shapes (characters, animals) ----------
  // Unlike Merger (flat-shaded scenery) this keeps the primitives' smooth normals, so spheres and
  // tapered cylinders read as rounded bodies. Vertex colours multiply with instance colours.
  const WHITE = new THREE.Color(1, 1, 1);
  const _sM = new THREE.Matrix4(), _sQ = new THREE.Quaternion(), _sE = new THREE.Euler(), _sV = new THREE.Vector3(), _sS = new THREE.Vector3();
  kit.SPH = new THREE.SphereGeometry(1, 16, 12);
  const cylCache = {};
  kit.cyl = (rt, rb, seg = 12) => { const k = rt + '|' + rb + '|' + seg; return cylCache[k] || (cylCache[k] = new THREE.CylinderGeometry(rt, rb, 1, seg)); };
  kit.solid = function(parts){
    const P = [], N = [], C = [];
    for (const [src, p, r, s, col] of parts){
      const pp = p || [0, 0, 0], rr = r || [0, 0, 0], sc = s == null ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : s, cc = col || WHITE;
      _sE.set(rr[0], rr[1], rr[2], 'YXZ'); _sQ.setFromEuler(_sE);
      const g = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(_sM.compose(_sV.set(pp[0], pp[1], pp[2]), _sQ, _sS.set(sc[0], sc[1], sc[2])));
      const pa = g.attributes.position.array, na = g.attributes.normal.array;
      for (let i = 0; i < pa.length; i++){ P.push(pa[i]); N.push(na[i]); }
      for (let i = 0; i < pa.length/3; i++) C.push(cc.r, cc.g, cc.b);
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    return geo;
  };

  // ---------- people: rounded bodies with joints, gait cycles and seated poses ----------
  // spec.look: { skin, shirt, pants, shoes, hair (hex), hairStyle 'short'|'long'|'bun'|'cap'|'none', hat (cap colour),
  //              legs 'pants'|'shorts'|'skirt', sleeves 'short'|'long'|'none', scale (1 = 1.70 m) }
  // spec.keys: [{ t, x, z, do, yaw, y, armsUp, look:[x,y,z], talk, eat, read, throws:[t...] }]
  //   do = 'stand' | 'sit' (bench, seat .43 m) | 'ground' (sitting on the grass) | 'lie' (on the back, feet at x,z)
  //        | 'walk' | 'jog' | 'run'. Between two keys at different spots the person travels there with the later
  //   key's gait; between keys at the same spot they hold the earlier key's posture. Changes blend over ~0.5 s.
  //   Facing follows the motion, or a key's yaw (0 = +z, atan2(dx, dz)). Everything is a pure function of t.
  //   A key may give a speed v (m/s) instead of t: it is reached at that speed (plus 0.35 s to set off from a standstill).
  // spec.at(t) can replace keys: return { x, y, z, yaw, post, prev, w, dist, armsUp, look }.
  const GAIT = { walk: [.4, .85, .3, .05, .05, .06, 1.4], jog: [.6, 1.3, .48, .06, .14, .1, 1.8], run: [.72, 1.6, .62, .08, .22, .12, 2.1] };
  const STATIC = { stand: 1, sit: 1, ground: 1, lie: 1 };
  function peopleGeos(){
    const S = kit.solid, C = kit.cyl, SPH = kit.SPH, D = new THREE.Color(.09, .07, .06);
    const cap = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI*2, 0, Math.PI*.52);
    const hairTop = [cap, [0, .178, -.006], [-.32, 0, 0], [.113, .13, .122]];
    return {
      hips: S([[C(.15, .16), [0, -.03, 0], 0, [1, .2, .68]], [SPH, [0, -.13, 0], 0, [.16, .06, .11]]]),
      torso: S([[C(.175, .148), [0, .22, 0], 0, [1, .44, .62]], [SPH, [0, .43, 0], 0, [.19, .085, .12]], [SPH, [0, .29, .03], 0, [.16, .12, .09]]]),
      head: S([[C(.05, .056), [0, .03, 0], 0, [1, .1, 1]], [SPH, [0, .17, 0], 0, [.104, .122, .114]],
               [SPH, [0, .158, .108], [.25, 0, 0], [.019, .03, .024]], [SPH, [-.103, .168, -.004], 0, [.017, .032, .026]], [SPH, [.103, .168, -.004], 0, [.017, .032, .026]],
               [SPH, [-.037, .19, .1], 0, [.013, .015, .008], D], [SPH, [.037, .19, .1], 0, [.013, .015, .008], D]]),
      short: S([hairTop]),
      long: S([hairTop, [SPH, [0, .07, -.075], 0, [.112, .19, .07]], [SPH, [-.094, .11, -.02], 0, [.032, .12, .06]], [SPH, [.094, .11, -.02], 0, [.032, .12, .06]]]),
      bun: S([hairTop, [SPH, [0, .27, -.08], 0, .055]]),
      cap: S([[cap, [0, .2, 0], [-.12, 0, 0], [.117, .1, .125]], [SPH, [0, .215, .11], [-.08, 0, 0], [.1, .012, .1]]]),
      skirt: S([[C(.16, .27, 14), [0, -.24, 0], 0, [1, .42, .82]]]),
      thigh: S([[SPH, [0, 0, 0], 0, .074], [C(.078, .062), [0, -.22, 0], 0, [1, .44, 1]], [SPH, [0, -.44, 0], 0, .061]]),
      shin: S([[C(.058, .043), [0, -.21, 0], 0, [1, .42, 1]], [SPH, [0, -.12, -.012], 0, [.054, .1, .058]], [SPH, [0, -.42, 0], 0, .044]]),
      shoe: S([[SPH, [0, -.008, .045], 0, [.052, .042, .115]]]),
      upper: S([[SPH, [0, 0, 0], 0, .057], [C(.052, .044), [0, -.145, 0], 0, [1, .29, 1]]]),
      fore: S([[SPH, [0, 0, 0], 0, .045], [C(.043, .035), [0, -.125, 0], 0, [1, .25, 1]]]),
      hand: S([[SPH, [0, -.055, 0], 0, [.034, .058, .024]]]),
    };
  }
  // the same parts built from boxes: big square head, wide torso, straight box limbs (joints sit where RIG.blocky says)
  function blockyGeos(){
    const S = kit.solid, B = PRIM.box, D = new THREE.Color(.08, .06, .05);
    const top = [B, [0, .315, 0], 0, [.32, .07, .32]], back = [B, [0, .2, -.14], 0, [.32, .2, .05]];
    return {
      hips: S([[B, [0, -.05, 0], 0, [.4, .16, .22]]]),
      torso: S([[B, [0, .29, 0], 0, [.42, .58, .22]]]),
      head: S([[B, [0, .15, 0], 0, [.3, .3, .3]], [B, [-.065, .17, .151], 0, [.045, .05, .01], D], [B, [.065, .17, .151], 0, [.045, .05, .01], D],
               [B, [0, .09, .151], 0, [.09, .02, .008], new THREE.Color(.55, .3, .25)]]),
      short: S([top, back]),
      long: S([top, [B, [0, .1, -.145], 0, [.32, .42, .05]], [B, [-.155, .2, -.03], 0, [.03, .24, .25]], [B, [.155, .2, -.03], 0, [.03, .24, .25]]]),
      bun: S([top, back, [B, [0, .38, -.08], 0, [.13, .1, .13]]]),
      cap: S([[B, [0, .33, 0], 0, [.33, .09, .33]], [B, [0, .295, .2], 0, [.3, .025, .14]]]),
      skirt: S([[B, [0, -.22, 0], 0, [.44, .32, .27]]]),
      thigh: S([[B, [0, -.22, 0], 0, [.19, .46, .21]]]),
      shin: S([[B, [0, -.19, 0], 0, [.185, .4, .2]]]),
      shoe: S([[B, [0, -.04, .025], 0, [.2, .08, .26]]]),
      upper: S([[B, [0, -.12, 0], 0, [.16, .3, .18]]]),
      fore: S([[B, [0, -.13, 0], 0, [.15, .26, .17]]]),
      hand: S([[B, [0, -.05, 0], 0, [.14, .1, .15]]]),
    };
  }
  // joint offsets per body style: shoulder x / y on the torso, neck y, hip x, thigh and shin lengths
  const RIG = { round: { shx: .2, shy: .43, neck: .5, hipx: .095, thigh: .44, shin: .42, torso: .06, elbow: .29, wrist: .25 },
                blocky: { shx: .29, shy: .52, neck: .58, hipx: .095, thigh: .44, shin: .38, torso: .03, elbow: .27, wrist: .26 } };
  // posture -> joint values: 0 pelvisY 1 pelvisX 2 pelvisRoll 3 pelvisYaw 4 lean 5 torsoYaw 6 thighL 7 kneeL 8 thighR 9 kneeR
  // 10 armLfwd 11 armLout 12 elbowL 13 armRfwd 14 armRout 15 elbowR 16 headYaw 17 headUp 18 lie 19 lift
  function posture(kind, t, dist, ph, o, out, blocky){
    out.fill(0);
    const brS = Math.sin(t*.7 + ph), look = .35*Math.sin(t*.27 + ph*3) + .15*Math.sin(t*.61 + ph);
    if (GAIT[kind]){
      const [a, k, c, b, lean, tw, stride] = GAIT[kind], f = 6.2832*dist/stride + ph, s = Math.sin(f);
      out[0] = .93 - b*(1 - Math.cos(2*f))/2; out[1] = .015*s; out[2] = .03*s; out[3] = .6*tw*s;
      out[4] = lean; out[5] = -tw*s;
      out[6] = a*s; out[7] = .06 + k*Math.pow(Math.max(0, Math.cos(f + .25)), 1.3);
      out[8] = -a*s; out[9] = .06 + k*Math.pow(Math.max(0, Math.cos(f + Math.PI + .25)), 1.3);
      const e0 = kind === 'walk' ? .25 : 1.25;
      out[10] = -c*s; out[11] = .08; out[12] = e0 + .2*Math.max(0, -s);
      out[13] = c*s;  out[14] = .08; out[15] = e0 + .2*Math.max(0, s);
      out[16] = -out[5]*.8 + .15*look; out[17] = -lean*.6;
      if (blocky){ out[7] *= .35; out[9] *= .35; out[10] *= 1.2; out[13] *= 1.2; out[11] = out[14] = .03; out[12] *= .4; out[15] *= .4; }   // box people: stiffer, bigger swings
      const up = o.armsUp || 0;
      if (up){ const fl = Math.sin(t*11 + ph);
        out[10] += (2.7 + .3*fl - out[10])*up; out[13] += (2.7 - .3*fl - out[13])*up;
        out[11] += .35*up; out[14] += .35*up; out[12] += (.5 - out[12])*up; out[15] += (.5 - out[15])*up; out[17] += .25*up; }
      return out;
    }
    if (kind === 'sit'){
      out[0] = .54; out[4] = -.07; out[6] = out[8] = 1.5; out[7] = out[9] = 1.48;
      out[10] = out[13] = .55; out[11] = out[14] = .12; out[12] = out[15] = .9;
    } else if (kind === 'ground'){
      const knees = ph % 1 < .6;
      out[0] = .12; out[4] = -.05;
      if (knees){ out[6] = 2.0; out[7] = 1.0; out[8] = 1.9; out[9] = .95; out[10] = out[13] = 1.0; out[12] = out[15] = .25; out[11] = out[14] = .15; }
      else { out[6] = out[8] = 1.5; out[7] = .05; out[9] = .2; out[4] = -.32; out[10] = out[13] = -.55; out[11] = out[14] = .25; out[12] = out[15] = 0; }
    } else if (kind === 'lie'){
      out[0] = .93; out[18] = -1.5708; out[19] = .11; out[11] = out[14] = .14; out[12] = out[15] = .1;
      out[16] = .25*Math.sin(t*.2 + ph); return out;
    } else {                                          // stand
      out[0] = .925; out[1] = .015*brS; out[2] = .02*brS;
      out[6] = .03*brS; out[7] = .06 + .04*Math.max(0, brS); out[8] = -.03*brS; out[9] = .06 + .04*Math.max(0, -brS);
      out[10] = out[13] = .05; out[11] = out[14] = blocky ? .03 : .1; out[12] = out[15] = blocky ? .08 : .22;
    }
    out[16] = look; out[17] = .05*Math.sin(t*.4 + ph);
    if (o.talk){ out[13] += .45 + .25*Math.sin(t*2.3 + ph); out[15] += .8 + .4*Math.sin(t*3.1 + ph); out[14] += .1; out[17] += .03*Math.sin(t*5 + ph); }
    if (o.eat){ const cy = ((t + ph*2) % 3.4)/3.4, m = Math.sin(Math.min(1, cy/.35)*Math.PI);
      out[13] += (1.15 - out[13])*m; out[15] += (2.1 - out[15])*m; out[14] += .15*m; }
    if (o.read){ out[10] = out[13] = .95; out[12] = out[15] = 1.35; out[11] = out[14] = .2; out[17] = -.45; out[16] *= .2; }
    if (o.armsUp){ const u = o.armsUp, fl = Math.sin(t*9 + ph);
      out[10] += (2.6 + .25*fl - out[10])*u; out[13] += (2.6 - .25*fl - out[13])*u; out[12] *= 1 - u*.6; out[15] *= 1 - u*.6; out[11] += .3*u; out[14] += .3*u; out[17] += .3*u; }
    if (o.throws){ for (const T of o.throws){ const u = t - T; if (u < -.8 || u > .6) continue;
      out[13] += -1.1*Math.exp(-Math.pow((u + .3)/.18, 2)) + 1.6*Math.exp(-Math.pow((u - .05)/.1, 2)); out[14] += .5*Math.exp(-Math.pow(u/.3, 2)); } }
    return out;
  }
  function track(keys){
    const K = keys.map(k => Object.assign({}, k));
    let d = 0; K[0].d = 0;
    for (let i=1;i<K.length;i++){ const a = K[i-1], b = K[i]; if (b.x === undefined){ b.x = a.x; b.z = a.z; }
      const L = Math.hypot(b.x - a.x, b.z - a.z); d += L; b.d = d;
      if (b.t == null) b.t = a.t + (L > .02 ? L/(b.v || 1.3) + (a.v ? 0 : .35) : .3);   // a key with a speed v instead of a time
    }
    let yaw = K[0].yaw ?? 0;
    K.forEach((k, i) => {
      const n = K[i+1], moving = !!n && Math.hypot(n.x - k.x, n.z - k.z) > .02;
      k.post = moving ? (STATIC[n.do] || !n.do ? 'walk' : n.do) : (STATIC[k.do] ? k.do : 'stand');
      if (moving) yaw = Math.atan2(n.x - k.x, n.z - k.z); else if (k.yaw != null) yaw = k.yaw;
      k.face = yaw; k.moving = moving;
      k.arms = moving ? (n.armsUp || 0) : (k.armsUp || 0);
      k.lookAt = moving ? n.look : k.look;
    });
    return K;
  }
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  function trackAt(K, t, out){
    let i = 0; while (i < K.length - 1 && t >= K[i+1].t) i++;
    const k = K[i], n = K[i+1], p = K[i-1];
    if (t < k.t || !k.moving){ out.x = k.x; out.z = k.z; out.dist = k.d; }
    else { const u = clamp((t - k.t)/(n.t - k.t), 0, 1); out.x = k.x + (n.x - k.x)*u; out.z = k.z + (n.z - k.z)*u; out.dist = k.d + (n.d - k.d)*u; }
    out.post = k.post; out.prev = p ? p.post : k.post;
    const both = GAIT[out.post] && GAIT[out.prev], w = p ? smooth(k.t, k.t + (both ? .3 : .5), t) : 1;
    out.w = w; out.y = k.y ?? 0;
    out.yaw = p ? p.face + wrap(k.face - p.face)*smooth(k.t, k.t + .4, t) : k.face;
    out.armsUp = p ? p.arms + (k.arms - p.arms)*w : k.arms;
    out.look = k.lookAt || null; out.talk = k.talk; out.eat = k.eat; out.read = k.read; out.throws = k.throws;
    return out;
  }
  E.fx.people = function(ctx, specs, opt = {}){
    const n = specs.length, c = ctx.col, BL = !!opt.blocky, G = BL ? blockyGeos() : peopleGeos(), J = RIG[BL ? 'blocky' : 'round'];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: BL ? .88 : .82 });
    const inst = (geo, count) => { const m = new THREE.InstancedMesh(geo, mat, count); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; ctx.scene.add(m); return m; };
    const M = { hips: inst(G.hips, n), torso: inst(G.torso, n), head: inst(G.head, n), skirt: inst(G.skirt, n),
                short: inst(G.short, n), long: inst(G.long, n), bun: inst(G.bun, n), cap: inst(G.cap, n),
                thigh: inst(G.thigh, 2*n), shin: inst(G.shin, 2*n), shoe: inst(G.shoe, 2*n), upper: inst(G.upper, 2*n), fore: inst(G.fore, 2*n), hand: inst(G.hand, 2*n) };
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    specs.forEach((s, i) => {
      const L = s.look, skin = c(L.skin), shirt = c(L.shirt), pants = c(L.pants), hair = c(L.hair || '#2a1d14');
      s._style = L.hairStyle || 'short'; s._skirt = L.legs === 'skirt'; s._ph = s.ph ?? ((i*.618034) % 1)*6.283;
      M.hips.setColorAt(i, pants); M.torso.setColorAt(i, shirt); M.head.setColorAt(i, skin); M.skirt.setColorAt(i, pants);
      for (const h of ['short', 'long', 'bun', 'cap']) M[h].setColorAt(i, h === 'cap' ? c(L.hat || L.shirt) : hair);
      for (let j=0;j<2;j++){ const k = 2*i + j;
        M.thigh.setColorAt(k, L.legs === 'skirt' ? skin : pants); M.shin.setColorAt(k, L.legs === 'pants' || !L.legs ? pants : skin);
        M.shoe.setColorAt(k, c(L.shoes || '#3a3a3e')); M.upper.setColorAt(k, L.sleeves === 'none' ? skin : shirt);
        M.fore.setColorAt(k, L.sleeves === 'long' ? shirt : skin); M.hand.setColorAt(k, skin); }
      if (s.keys) s._track = track(s.keys);
      s.hand = [new THREE.Vector3(), new THREE.Vector3()];
    });
    // one shared rig: posed per person, its joint matrices copied into the instanced parts
    const O = () => new THREE.Object3D();
    const root = O(), pelvis = O(), torso = O(), neck = O(); root.rotation.order = 'YXZ';
    root.add(pelvis); pelvis.add(torso); torso.add(neck); torso.position.y = J.torso; neck.position.y = J.neck;
    const sh = [-1, 1].map(s => { const o = O(); o.position.set(s*J.shx, J.shy, 0); torso.add(o); return o; });
    const el = sh.map(o => { const e = O(); e.position.y = -J.elbow; o.add(e); return e; });
    const wr = el.map(o => { const w = O(); w.position.y = -J.wrist; o.add(w); return w; });
    const hp = [-1, 1].map(s => { const o = O(); o.position.set(s*J.hipx, -.03, 0); pelvis.add(o); return o; });
    const kn = hp.map(o => { const k = O(); k.position.y = -J.thigh; o.add(k); return k; });
    const an = kn.map(o => { const a = O(); a.position.y = -J.shin; o.add(a); return a; });
    const A = new Float32Array(20), B = new Float32Array(20), P = {}, tmp = new THREE.Vector3();
    function pose(s, t){
      const p = s._track ? trackAt(s._track, t, P) : s.at(t);
      posture(p.post, t, p.dist || 0, s._ph, p, B, BL);
      if (p.w != null && p.w < 1){ posture(p.prev, t, p.dist || 0, s._ph, p, A, BL); for (let j=0;j<20;j++) B[j] = A[j] + (B[j] - A[j])*p.w; }
      if (p.look){ const dx = p.look[0] - p.x, dz = p.look[2] - p.z;
        B[16] = clamp(wrap(Math.atan2(dx, dz) - p.yaw), -1.1, 1.1); B[17] = clamp(Math.atan2(p.look[1] - 1.6, Math.hypot(dx, dz)), -.5, .6); }
      const sc = s.look.scale || 1;
      root.position.set(p.x, (p.y || 0) + B[19]*sc, p.z); root.rotation.set(B[18], p.yaw, 0); root.scale.setScalar(sc);
      pelvis.position.set(B[1], B[0], 0); pelvis.rotation.set(0, B[3], B[2]);
      torso.rotation.set(B[4], B[5], 0); torso.scale.y = 1 + .012*Math.sin(t*1.7 + s._ph);
      neck.rotation.set(-B[17], B[16] - B[5] - B[3], 0);
      sh[0].rotation.set(-B[10], 0, -B[11]); sh[1].rotation.set(-B[13], 0, B[14]);
      el[0].rotation.x = -B[12]; el[1].rotation.x = -B[15];
      hp[0].rotation.set(-B[6], 0, -.02); hp[1].rotation.set(-B[8], 0, .02);
      kn[0].rotation.x = B[7]; kn[1].rotation.x = B[9];
      an[0].rotation.x = (B[6] - B[7])*.9; an[1].rotation.x = (B[8] - B[9])*.9;
      root.updateMatrixWorld(true);
    }
    return { mesh: M,
      update(t){
        for (let i=0;i<n;i++){
          const s = specs[i];
          if (s.hidden && s.hidden(t)){ for (const k in M){ const m = M[k]; if (m.count === n) m.setMatrixAt(i, ZERO); else { m.setMatrixAt(2*i, ZERO); m.setMatrixAt(2*i+1, ZERO); } } continue; }
          pose(s, t);
          M.hips.setMatrixAt(i, pelvis.matrixWorld); M.skirt.setMatrixAt(i, s._skirt ? pelvis.matrixWorld : ZERO);
          M.torso.setMatrixAt(i, torso.matrixWorld); M.head.setMatrixAt(i, neck.matrixWorld);
          for (const h of ['short', 'long', 'bun', 'cap']) M[h].setMatrixAt(i, s._style === h ? neck.matrixWorld : ZERO);
          for (let j=0;j<2;j++){ const k = 2*i + j;
            M.thigh.setMatrixAt(k, hp[j].matrixWorld); M.shin.setMatrixAt(k, kn[j].matrixWorld); M.shoe.setMatrixAt(k, an[j].matrixWorld);
            M.upper.setMatrixAt(k, sh[j].matrixWorld); M.fore.setMatrixAt(k, el[j].matrixWorld); M.hand.setMatrixAt(k, wr[j].matrixWorld);
            s.hand[j].copy(tmp.set(0, -.07, 0).applyMatrix4(wr[j].matrixWorld)); }
        }
        for (const k in M){ M[k].instanceMatrix.needsUpdate = true; }
      },
      hand(i, side = 1){ return specs[i].hand[side]; } };
  };
  E.fx.people.track = track;

  // ---------- the mascot since 004: Tung Tung Tung Sahur, a small wooden log with a face and a bat ----------
  // Built 1.78 units tall (feet on y = 0, face towards +z) and scaled to o.height metres.
  // update(t, st): speed m/s and dir (+1 forwards, -1 backwards) drive the steps; look: world point the eyes follow;
  // surprise 0..1 (wide eyes, raised brows, open mouth); raise 0..1 (bat overhead); swing 0..1 (bat comes down);
  // jump (m, in model units), lean (radians, + = backwards, to look up).
  E.fx.sahur = function(ctx, o = {}){
    const c = ctx.col, S = kit.solid, C = kit.cyl, SPH = kit.SPH, H = o.height ?? .65;
    const WOOD = c(o.wood ?? '#b9672c'), LIMB = c('#c57a3e'), TOP = c('#d99a5c'), GRAIN = c('#8a4a1c'), DARK = c('#3a1a0a'),
          SOCK = c('#7a3c18'), EYE = c('#fbf8f2'), IRIS = c('#3d2414'), PUP = c('#0d0806'), BAT = c(o.bat ?? '#a95e28'), KNOB = c('#7a3f16');
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: 0 });
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const mesh = (parts, parent) => { const m = new THREE.Mesh(S(parts), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const root = new THREE.Group(), body = grp(root, 0, .725, 0);
    root.scale.setScalar(H/1.78); ctx.scene.add(root);
    // the log, its lighter end grain on top, vertical grain lines round the back and sides
    const RL = .205;   // log radius
    const log = [[C(RL, RL, 26), [0, .5, 0], 0, 1, WOOD], [SPH, [0, 1, 0], 0, [RL, .045, RL], TOP]];
    [1.0, 1.35, 1.8, 2.3, 2.75, 3.15, 3.6, 4.05, 4.5, 4.95, 5.3].forEach((a, k) => { const L = .45 + .4*((k*.618) % 1);
      log.push([C(.005, .005, 4), [Math.sin(a)*RL, .08 + L/2 + .1*((k*.37) % 1), Math.cos(a)*RL], 0, [1, L, 1], GRAIN]); });
    mesh(log, body);
    // face: sockets, nose, brows (animated), eyes (blink, gaze), smile / open mouth
    mesh([[SPH, [-.085, .69, .155], 0, [.088, .094, .05], SOCK], [SPH, [.085, .69, .155], 0, [.088, .094, .05], SOCK],
          [SPH, [0, .58, .2], [.18, 0, 0], [.036, .09, .052], LIMB], [SPH, [0, .51, .222], 0, [.048, .034, .04], LIMB],
          [SPH, [-.112, .47, .17], 0, .016, SOCK], [SPH, [.112, .47, .17], 0, .016, SOCK]], body);
    const brows = [-1, 1].map(s => { const g = grp(body, s*.085, .8, .18); mesh([[SPH, [0, 0, 0], [0, 0, -s*.22], [.072, .017, .024], DARK]], g); return g; });
    const eyes = [-1, 1].map(s => { const g = grp(body, s*.085, .69, .172);
      mesh([[SPH, [0, 0, 0], 0, [.074, .079, .05], EYE]], g);
      const iris = grp(g, 0, 0, 0); mesh([[SPH, [0, 0, .034], 0, [.04, .042, .018], IRIS], [SPH, [0, 0, .043], 0, [.025, .026, .013], PUP], [SPH, [.013, .014, .053], 0, .009, EYE]], iris);
      return { g, iris }; });
    const arc = new THREE.Curve();
    arc.getPoint = (u, v = new THREE.Vector3()) => { const a = Math.PI*(1.17 + .66*u), x = Math.cos(a)*.1; return v.set(x, .44 + Math.sin(a)*.05, Math.sqrt(RL*RL - x*x) + .004); };
    const smile = new THREE.Mesh(new THREE.TubeGeometry(arc, 20, .009, 6, false), new THREE.MeshStandardMaterial({ color: DARK, roughness: .6 }));
    body.add(smile);
    const mouthO = grp(body, 0, .41, .19); mesh([[SPH, [0, 0, 0], 0, [.042, .054, .024], DARK]], mouthO); mouthO.visible = false;
    // limbs: thin arms from the sides, the right hand holds the bat; long thin legs and big bare feet
    const arms = [-1, 1].map(s => { const sh = grp(body, s*.215, .34, 0), el = grp(sh, 0, -.26, 0), hd = grp(el, 0, -.24, 0);
      mesh([[SPH, [0, 0, 0], 0, .03, LIMB], [C(.026, .021, 10), [0, -.13, 0], 0, [1, .26, 1], LIMB]], sh);
      mesh([[SPH, [0, 0, 0], 0, .024, LIMB], [C(.022, .018, 10), [0, -.12, 0], 0, [1, .24, 1], LIMB]], el);
      mesh([[SPH, [0, -.035, .004], 0, [.022, .04, .03], LIMB], [SPH, [0, -.02, .03], 0, .012, LIMB]], hd);
      return { sh, el, hd }; });
    const bat = grp(arms[1].hd, 0, -.04, .01);
    mesh([[SPH, [0, .05, 0], 0, [.028, .012, .028], KNOB], [C(.017, .046, 14), [0, -.31, 0], 0, [1, .72, 1], BAT], [SPH, [0, -.67, 0], 0, [.046, .022, .046], BAT]], bat);
    bat.rotation.set(-.3, 0, .3);
    const legs = [-1, 1].map(s => { const hp = grp(body, s*.085, .01, 0), kn = grp(hp, 0, -.34, 0), an = grp(kn, 0, -.33, 0);
      mesh([[SPH, [0, 0, 0], 0, .036, LIMB], [C(.032, .025, 10), [0, -.17, 0], 0, [1, .34, 1], LIMB]], hp);
      mesh([[SPH, [0, 0, 0], 0, .034, LIMB], [C(.025, .021, 10), [0, -.165, 0], 0, [1, .33, 1], LIMB]], kn);
      const foot = [[SPH, [0, -.03, .065], 0, [.066, .036, .145], LIMB]];
      for (let k=0;k<5;k++) foot.push([SPH, [(k - 2)*.025, -.036, .2 - Math.abs(k - 2)*.009], 0, .022 - Math.abs(k - 2)*.002, LIMB]);
      mesh(foot, an);
      return { hp, kn, an }; });
    const v = new THREE.Vector3();
    return { object: root, body, update(t, st = {}){
      const a = clamp((st.speed || 0)/.9, 0, 1.3), dir = st.dir ?? 1, f = st.phase ?? t*6.2832*2.2, s = Math.sin(f);
      const sur = st.surprise || 0, up = st.raise || 0, sw = st.swing || 0;
      legs.forEach((L, k) => { const g = f + k*Math.PI;
        L.hp.rotation.x = -dir*.5*a*Math.sin(g); L.kn.rotation.x = .9*a*Math.pow(Math.max(0, Math.cos(g + .25)), 1.3);
        L.an.rotation.x = -L.hp.rotation.x - L.kn.rotation.x; });
      body.position.y = .725 + .025*a*Math.abs(Math.cos(f)) + (st.jump || 0) - .02*a;
      body.rotation.set(-(st.lean || 0) + .04*a*dir, 0, .05*a*s + .03*sur*Math.sin(t*31));
      // arms: free arm swings, bat arm hangs; raise lifts both hands, swing brings the bat down
      arms[0].sh.rotation.set(-(.35*a*s*dir) - 2.3*up + .2*sur, 0, -.18 - .35*sur - .1*up);
      arms[0].el.rotation.x = -.3 - .5*up;
      const raise = up*(1 - sw);
      arms[1].sh.rotation.set(.18*a*s*dir - 2.7*raise - .9*sw, 0, .16 + .2*sur*(1 - up));
      arms[1].el.rotation.x = -.25 - .5*raise;
      bat.rotation.x = -.3 + .5*raise - .3*sw; bat.rotation.z = .3*(1 - raise);
      // face
      const blink = sur < .5 && ((t + .4) % 3.3) < .11 ? .12 : 1, k = 1 + .32*sur;
      let gx = 0, gy = 0;
      if (st.look){ body.updateMatrixWorld(true); body.worldToLocal(v.copy(st.look)); v.sub(new THREE.Vector3(0, .69, .2)); const L = v.length() || 1;
        gx = clamp(v.x/L, -1, 1)*.022; gy = clamp(v.y/L, -1, 1)*.018; }
      eyes.forEach(e => { e.g.scale.set(k, k*blink, 1); e.iris.position.set(gx, gy, -(gx*gx + gy*gy)*6); });
      brows.forEach((b, i) => { b.position.y = .785 + .035*sur; b.rotation.z = (i ? -1 : 1)*.18*sur; });
      smile.visible = sur < .45; mouthO.visible = !smile.visible; mouthO.scale.set(1, .6 + .5*sur, 1);
    }};
  };
})();
