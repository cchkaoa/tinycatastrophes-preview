/* Game kit for the series "X, explained using Fortnite": a cartoon battle-royale look built from generic genre cues
   (rarity colours, loot beams, a coin of our own, price boards, word-by-word captions, health/shield bars), never
   Epic's assets (no skins, logos, V-Bucks icon, bus, llama or emotes). Load after kit.js (and cast.js if used).
   Colours go through ctx.col. Everything time-based runs on simulation time (exports match live playback).

   Engine.game.RARITY            { common, uncommon, rare, epic, legendary } -> hex (generic genre colours)
   Engine.game.fonts()           promise: the heavy display face is ready for canvas text (call before Engine.create)
   Engine.game.hills([{x, z, r, h, flat}], base) -> (x, z) => y   smooth bumps (cosine falloff, flat top of radius flat)
   Engine.game.terrain(ctx, {size:[w, d], center:[x, z], seg:[nx, nz], height, grass, dark, dry, paint(x, z, y, color)})
     -> { mesh, height }   smooth-shaded rolling ground, saturated grass with darker patches and mown stripes
   Engine.game.trees(ctx, [{x, z, s, kind: 'round'|'pine'|'bush'|'flowers', far}], height) -> mesh   puffy cartoon trees,
     two draw calls (far: lighter blobs, no shadows)
   Engine.game.beam(ctx, {color, radius, height, at, behind}) -> { group, set(k) }   loot-style light column + ground
     ring (blooms); behind (m) moves the column back along -z so a character standing in the ring stays clear of it
   Engine.game.coin(size) -> canvas   our currency icon (gold coin with the channel cube), for signs and the HUD
   Engine.game.coins(ctx, n, size) -> InstancedMesh of 3D coins (set matrices yourself)
   Engine.game.board(ctx, {w, h, rows:[{text, size, color, coin, align}], style:'wood'|'stone'|'shop', title, posts})
     -> THREE.Group   a sign with crisp canvas text; '{c}' in a row's text draws the coin icon inline
   Engine.game.captions(ctx, [[t, 'Words with *orange* stress'], [t0, t1, '...']], {pace, words}) -> { update(t) }
     big white bold words in the centre, one at a time, popping in; each line runs from its time to the next line
     (or t1), its words spread by length at most `pace` words/s (default 3.2), then it clears. Once the voice-over is
     recorded, pass its word timestamps instead: words: [[t0, t1, 'word'], ...] (lines are then ignored). CSS vars
     --cap-y (centre height, default 58%) and --cap-size on .stage move / resize them
   Engine.game.card(ctx, {rarity, name, line, role}) -> { el, set(k) }   rarity name card (lower third), k 0..1 in/out
   Engine.game.bars(ctx) -> { set(i, {at: Vector3, hp, shield, name, show}) }   health / shield bars over characters
   Engine.game.feed(ctx) -> { update(t, [[t, 'A', 'B', 'how'], ...]) }   elimination log, top left
   Engine.game.barrier(ctx, {x0, x1, z, h, color}) -> { mesh, set(k) }   the edge of the map: a glowing grid wall along x
   Engine.game.fit(points, {yaw, pitch, fov, aspect, side, top, bottom, push}) -> { pos, look, dist }   frames a shot:
     the camera looking along yaw (0 = +z) / pitch (rad) at the closest distance where every [x, y, z] point lies within
     `side` of the half-width (default .82) and between `top` and `bottom` (fractions of the frame from the top; default
     .14 / .56, which keeps subjects clear of the brand, the captions and the platform UI); push > 1 backs off further */
(function(){
  'use strict';
  const THREE = window.THREE, E = window.Engine;
  if (!THREE || !E || !E.kit) { console.error('kit-game.js: load engine.js and kit.js first'); return; }
  const { clamp, smooth } = E, kit = E.kit;
  const G = E.game = {};
  G.RARITY = { common: '#b8bec6', uncommon: '#62d13f', rare: '#38a6ff', epic: '#bf63ff', legendary: '#ffa82e' };
  const FACE = '"Barlow Semi Condensed","Bahnschrift","Arial Narrow",sans-serif';
  G.FACE = FACE;
  G.fonts = () => (document.fonts && document.fonts.load) ? Promise.all(['800 40px', 'italic 900 40px', '600 40px'].map(f => document.fonts.load(f + ' "Barlow Semi Condensed"').catch(() => null))) : Promise.resolve();

  // ---------- ground ----------
  G.hills = (list, base = 0) => (x, z) => {
    let y = base;
    for (const b of list){ const f = b.flat ?? 0, d = Math.max(0, Math.hypot(x - b.x, z - b.z) - f)/(b.r - f); if (d < 1) y += b.h*(.5 + .5*Math.cos(Math.PI*d)); }
    return y;
  };
  function canvasTex(w, h, draw, rep){
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }
  G.canvasTex = canvasTex;
  G.terrain = function(ctx, o = {}){
    const [w, d] = o.size ?? [400, 400], [cx, cz] = o.center ?? [0, 0], [nx, nz] = o.seg ?? [160, 160], H = o.height ?? (() => 0);
    const geo = new THREE.PlaneGeometry(w, d, nx, nz); geo.rotateX(-Math.PI/2); geo.translate(cx, 0, cz);
    const P = geo.attributes.position.array, cols = [], c = ctx.col;
    const g0 = c(o.grass ?? '#6cc04a'), g1 = c(o.dark ?? '#4f9e3a'), g2 = c(o.dry ?? '#a8c94e'), tmp = new THREE.Color();
    for (let i = 0; i < P.length; i += 3){
      const x = P[i], z = P[i+2], y = H(x, z); P[i+1] = y;
      const patch = .5 + .5*Math.sin(x*.045 + Math.sin(z*.03)*2)*Math.sin(z*.052 - x*.017);
      tmp.copy(g0).lerp(g1, .55*patch).lerp(g2, clamp(y*.025 - .15, 0, .45));
      const stripe = (Math.floor((x + z*.35 + 2000)/5) % 2) ? 1.03 : .97;
      tmp.multiplyScalar(stripe*(1 + ctx.R(-.02, .02)));
      if (o.paint) o.paint(x, z, y, tmp);
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
    const tex = canvasTex(256, 256, g => { g.fillStyle = '#efefef'; g.fillRect(0, 0, 256, 256); const r = E.mulberry32(91);
      for (let i = 0; i < 7000; i++){ const v = 190 + Math.floor(r()*65); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r()*256, r()*256, 1 + r()*1.5, 2 + r()*3); } }, [w/3, d/3]);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: .95, envMapIntensity: .5 }));
    mesh.receiveShadow = true; ctx.scene.add(mesh);
    return { mesh, height: H };
  };

  // ---------- puffy cartoon trees: trunk + overlapping smooth blobs; pines as stacked cones ----------
  const BLOB = new THREE.IcosahedronGeometry(1, 2), BLOB_FAR = new THREE.IcosahedronGeometry(1, 1);
  G.trees = function(ctx, list, height = () => 0, o = {}){
    const c = ctx.col, R = ctx.R, near = [], farParts = [];
    let parts = near;
    const greens = (o.greens ?? ['#3f9a3a', '#4fae3f', '#5cbd45', '#368c3a', '#6cc94c']).map(h => c(h));
    const bark = c('#7a5236'), pineG = (o.pines ?? ['#2f7d4a', '#2a6f43', '#368a50']).map(h => c(h));
    for (const t of list){
      const s = t.s ?? 1, y = height(t.x, t.z) - .1*s, far = t.far, B = far ? BLOB_FAR : BLOB;
      parts = far ? farParts : near;
      if (t.kind === 'pine'){
        parts.push([kit.cyl(.16, .24, 8), [t.x, y + .9*s, t.z], 0, [s, 1.8*s, s], bark]);
        for (let k = 0; k < 3; k++) parts.push([kit.cyl(0, 1, far ? 8 : 14), [t.x, y + (2.1 + k*1.25)*s, t.z], [0, R(0, 3), 0], [(1.6 - k*.38)*s, 2.1*s, (1.6 - k*.38)*s], ctx.pick(pineG)]);
        continue;
      }
      if (t.kind === 'flowers'){ const fl = (o.flowers ?? ['#ffffff', '#ffd23f', '#ff6f91', '#b38cff']).map(h => c(h)), fc = ctx.pick(fl);
        parts.push([BLOB_FAR, [t.x, y + .12*s, t.z], 0, [.38*s, .16*s, .38*s], ctx.pick(greens)]);
        for (let k = 0; k < 6; k++) parts.push([BLOB_FAR, [t.x + R(-.3, .3)*s, y + R(.22, .32)*s, t.z + R(-.3, .3)*s], 0, .065*s, fc]);
        continue; }
      if (t.kind === 'bush'){ for (let k = 0; k < 3; k++) parts.push([B, [t.x + R(-.5, .5)*s, y + .45*s, t.z + R(-.5, .5)*s], 0, [R(.6, .8)*s, R(.5, .65)*s, R(.6, .8)*s], ctx.pick(greens)]); continue; }
      parts.push([kit.cyl(.17, .27, 8), [t.x, y + 1.1*s, t.z], [0, 0, R(-.06, .06)], [s, 2.2*s, s], bark]);
      const n = 3 + Math.floor(ctx.rnd()*2);
      for (let k = 0; k < n; k++){ const a = k*2.4 + R(0, 1), rr = k ? R(.55, .8)*s : 0, cs = (k ? R(.85, 1.05) : 1.25)*s;
        parts.push([B, [t.x + Math.cos(a)*rr, y + (2.75 + (k ? R(-.35, .25) : .25))*s, t.z + Math.sin(a)*rr], 0, [cs, cs*.88, cs], ctx.pick(greens)]); }
    }
    // far trees: lighter blobs, no shadow pass (they sit outside the shadow map anyway)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, envMapIntensity: .6 });
    const mesh = new THREE.Mesh(kit.solid(near.length ? near : [[BLOB_FAR, [0, -50, 0], 0, .01]]), mat);
    mesh.castShadow = mesh.receiveShadow = true; ctx.scene.add(mesh);
    if (farParts.length){ const f = new THREE.Mesh(kit.solid(farParts), mat); f.receiveShadow = true; ctx.scene.add(f); mesh.userData.far = f; }
    return mesh;
  };

  // ---------- loot beam: a soft column of light + a glowing ring on the ground ----------
  let beamTex = null, ringTex = null;
  G.beam = function(ctx, o = {}){
    // the shaft is a camera-facing card: soft across its width, fading upwards (a cylinder reads as a flat band)
    beamTex = beamTex || canvasTex(64, 256, (g, w, h) => { const d = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ const u = (x + .5)/w*2 - 1, v = 1 - y/h;
        const a = Math.exp(-u*u*5)*(.55 + .45*Math.exp(-u*u*40))*Math.pow(1 - v, 1.6)*smooth(0, .04, v + .01), i = (y*w + x)*4;
        d.data[i] = d.data[i+1] = d.data[i+2] = 255; d.data[i+3] = Math.round(255*a); }
      g.putImageData(d, 0, 0); });
    ringTex = ringTex || canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w/2, w/2, 0, w/2, w/2, w/2);
      gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.62, 'rgba(255,255,255,.3)'); gr.addColorStop(.8, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w); });
    const r = o.radius ?? .7, h = o.height ?? 7, col = ctx.col(o.color ?? '#ffffff');
    const mk = map => new THREE.MeshBasicMaterial({ map, color: col.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const group = new THREE.Group(), bz = -(o.behind ?? 0);
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(r*2.6, h), mk(beamTex)); shaft.position.set(0, h/2, bz);
    const core = new THREE.Mesh(new THREE.PlaneGeometry(r*.9, h*.85), mk(beamTex)); core.position.set(0, h*.425, bz + .01);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(o.ring ?? r*3.2, o.ring ?? r*3.2), mk(ringTex)); ring.rotation.x = -Math.PI/2; ring.position.y = .03;
    const wp = new THREE.Vector3();
    for (const m of [shaft, core]) m.onBeforeRender = (rd, sc, cam) => { m.getWorldPosition(wp); m.rotation.y = Math.atan2(cam.position.x - wp.x, cam.position.z - wp.z) - group.rotation.y; m.updateMatrixWorld(); };
    [shaft, core, ring].forEach(m => { m.renderOrder = 2; m.castShadow = false; group.add(m); });
    if (o.at) group.position.set(o.at[0], o.at[1], o.at[2]);
    ctx.scene.add(group);
    return { group, set(k, boost = 1.8){
      group.visible = k > .001; const kk = clamp(k, 0, 1), grow = .15 + .85*smooth(0, .6, kk);
      shaft.material.opacity = .7*kk; core.material.opacity = .9*kk; ring.material.opacity = .8*kk;
      for (const m of [shaft, core, ring]) m.material.color.copy(col).multiplyScalar(boost);
      shaft.scale.y = core.scale.y = grow; shaft.position.y = h/2*grow; core.position.y = h*.425*grow;
    } };
  };

  // ---------- currency: our own coin (gold, with the channel's cube stamped on it) ----------
  const coinCache = {};
  G.coin = function(size = 128){
    if (coinCache[size]) return coinCache[size];
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'), r = size/2;
    const gr = g.createRadialGradient(r*.7, r*.6, r*.1, r, r, r);
    gr.addColorStop(0, '#fff2a8'); gr.addColorStop(.55, '#ffc531'); gr.addColorStop(1, '#d9861a');
    g.fillStyle = '#9a5410'; g.beginPath(); g.arc(r, r*1.04, r*.96, 0, 6.283); g.fill();          // edge
    g.fillStyle = gr; g.beginPath(); g.arc(r, r, r*.92, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(160,90,10,.55)'; g.lineWidth = r*.07; g.beginPath(); g.arc(r, r, r*.74, 0, 6.283); g.stroke();
    // isometric cube, one block knocked loose (the logo, simplified)
    const k = r*.3, top = (x, y, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(x, y - k*.5); g.lineTo(x + k*.87, y); g.lineTo(x, y + k*.5); g.lineTo(x - k*.87, y); g.fill(); };
    const side = (x, y, c, s) => { g.fillStyle = c; g.beginPath(); g.moveTo(x, y + k*.5); g.lineTo(x + s*k*.87, y); g.lineTo(x + s*k*.87, y + k); g.lineTo(x, y + k*1.5); g.fill(); };
    const cx = r*.97, cy = r*.82;
    side(cx, cy, '#b4650f', -1); side(cx, cy, '#8f4c0a', 1); top(cx, cy, '#ffe48a');
    top(cx + k*.87*.95, cy - k*.95, '#ff5a1f'); side(cx + k*.87*.95, cy - k*.95, '#c2400f', 1); side(cx + k*.87*.95, cy - k*.95, '#e34f17', -1);
    return coinCache[size] = cv;
  };
  G.coins = function(ctx, n, size = .3){
    const face = new THREE.CanvasTexture(G.coin(128)); face.encoding = THREE.sRGBEncoding;
    const gold = new THREE.MeshStandardMaterial({ color: ctx.col('#e8a524'), roughness: .3, metalness: .85 });
    const faceM = new THREE.MeshStandardMaterial({ map: face, roughness: .35, metalness: .6 });
    const geo = new THREE.CylinderGeometry(size/2, size/2, size*.14, 24);
    const mesh = new THREE.InstancedMesh(geo, [gold, faceM, faceM], n); mesh.castShadow = true; mesh.frustumCulled = false;
    ctx.scene.add(mesh); return mesh;
  };

  // ---------- signs with crisp canvas text ----------
  G.board = function(ctx, o){
    const w = o.w ?? 2.4, h = o.h ?? 1.6, PX = o.px ?? 360, style = o.style ?? 'wood', c = ctx.col;
    const cv = document.createElement('canvas'); cv.width = Math.round(w*PX); cv.height = Math.round(h*PX);
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, coinImg = G.coin(256);
    const bg = { wood: ['#b9773e', '#8e5329'], stone: ['#c9c3b8', '#9c958a'], shop: ['#2a2f6e', '#191c47'], paper: ['#f4e6c4', '#dcc89c'] }[style];
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (style === 'wood'){ const rnd = E.mulberry32(5); g.strokeStyle = 'rgba(70,35,10,.35)'; g.lineWidth = 3;
      for (let y = H/5; y < H; y += H/5){ g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let i = 0; i < 60; i++){ g.strokeStyle = `rgba(70,35,10,${.06 + rnd()*.08})`; g.beginPath(); const y = rnd()*H; g.moveTo(rnd()*W, y); g.lineTo(rnd()*W, y + rnd()*4 - 2); g.stroke(); } }
    if (style === 'shop'){ g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = -H; i < W; i += 46) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 22, 0); g.lineTo(i + 22 + H*.6, H); g.lineTo(i + H*.6, H); g.fill(); } }
    g.strokeStyle = style === 'shop' ? '#ffd23f' : 'rgba(40,20,5,.6)'; g.lineWidth = W*.018; g.strokeRect(g.lineWidth/2, g.lineWidth/2, W - g.lineWidth, H - g.lineWidth);
    let y = H*(o.top ?? .1);
    for (const row of o.rows || []){
      let size = (row.size ?? .16)*H; const weight = row.weight ?? 800, parts = String(row.text).split('{c}');
      const font = () => { g.font = `${row.italic === false ? '' : 'italic '}${weight} ${size}px ${FACE}`; };
      font(); g.textBaseline = 'middle';
      const width = () => parts.reduce((a, p) => a + g.measureText(p).width, 0) + (parts.length - 1)*size*1.05;
      const fit = Math.min(1, W*.88/width()); if (fit < 1){ size *= fit; font(); }   // long rows shrink to fit the board
      const coinW = size*1.05, total = width();
      let x = row.align === 'left' ? W*.07 : (W - total)/2; y += size*.62;
      parts.forEach((p, i) => {
        g.lineWidth = size*.16; g.strokeStyle = row.stroke ?? 'rgba(20,10,0,.85)'; g.lineJoin = 'round';
        if (row.stroke !== false) g.strokeText(p, x, y);
        g.fillStyle = row.color ?? '#ffffff'; g.fillText(p, x, y); x += g.measureText(p).width;
        if (i < parts.length - 1){ g.drawImage(coinImg, x + coinW*.06, y - coinW*.47, coinW*.9, coinW*.9); x += coinW; }
      });
      y += size*.62 + (row.gap ?? .04)*H;
    }
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    const grp = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: .8, envMapIntensity: .4 }));
    const frameC = c(style === 'shop' ? '#ffd23f' : style === 'stone' ? '#7d766c' : '#6b3d1d');
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + .12, h + .12, .1), new THREE.MeshStandardMaterial({ color: frameC, roughness: .85 }));
    back.position.z = -.055; face.position.z = .001; face.receiveShadow = true; back.castShadow = back.receiveShadow = true;
    const lift = o.posts === false ? 0 : (o.lift ?? 1.1);
    face.position.y = back.position.y = lift + h/2; grp.add(back, face);
    if (o.posts !== false) for (const s of [-1, 1]){ const p = new THREE.Mesh(new THREE.BoxGeometry(.12, lift + h*.8, .12), new THREE.MeshStandardMaterial({ color: c('#5e3519'), roughness: .9 }));
      p.position.set(s*(w/2 - .2), (lift + h*.8)/2, -.1); p.castShadow = true; grp.add(p); }
    ctx.scene.add(grp); grp.userData.canvas = cv;
    return grp;
  };

  // ---------- the map's edge: a translucent wall of glowing grid lines ----------
  G.barrier = function(ctx, o = {}){
    const x0 = o.x0 ?? -50, x1 = o.x1 ?? 50, h = o.h ?? 12, w = x1 - x0;
    const tex = canvasTex(128, 128, (g, W) => { g.clearRect(0, 0, W, W); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 0, W, W);
      g.fillStyle = 'rgba(255,255,255,.95)'; g.fillRect(0, 0, W, 4); g.fillRect(0, 0, 4, W); }, [w/2.5, h/2.5]);
    const fade = canvasTex(4, 128, (g, W, H) => { const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, W, H); });
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: fade, color: ctx.col(o.color ?? '#5ec8ff'), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.position.set((x0 + x1)/2, (o.y ?? 0) + h/2, o.z ?? 0); mesh.renderOrder = 3;
    ctx.scene.add(mesh); const base = mat.color.clone();
    return { mesh, set(k, t = 0){ mesh.visible = k > .001; mat.opacity = clamp(k, 0, 1); mat.color.copy(base).multiplyScalar(1.4 + .4*Math.sin(t*4)); tex.offset.y = -t*.15; } };
  };

  // ---------- framing: the closest camera along a direction that fits a set of points into a band of the frame ----------
  G.fit = function(points, o = {}){
    const yaw = o.yaw ?? 0, pitch = o.pitch ?? 0, fov = o.fov ?? 34, aspect = o.aspect ?? 9/16;
    const tV = Math.tan(fov*Math.PI/360), tH = tV*aspect, side = (o.side ?? .82)*tH;
    const hi = (1 - 2*(o.top ?? .14))*tV, lo = (1 - 2*(o.bottom ?? .56))*tV;   // tan bounds above / below the axis
    const f = new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), Math.cos(yaw)*Math.cos(pitch));
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), u = new THREE.Vector3().crossVectors(r, f);
    const c = new THREE.Vector3(); points.forEach(p => c.add(new THREE.Vector3(...p))); c.divideScalar(points.length);
    const P = points.map(p => { const d = new THREE.Vector3(...p).sub(c); return [d.dot(r), d.dot(u), d.dot(f)]; });
    const solve = D => { let x0 = -1e9, x1 = 1e9, y0 = -1e9, y1 = 1e9;
      for (const [x, y, z] of P){ const zz = z + D; if (zz < .3) return null;
        x0 = Math.max(x0, x - side*zz); x1 = Math.min(x1, x + side*zz); y0 = Math.max(y0, y - hi*zz); y1 = Math.min(y1, y - lo*zz); }
      return x0 <= x1 && y0 <= y1 ? [(x0 + x1)/2, (y0 + y1)/2] : null; };
    let a = .3, b = 400; for (let i = 0; i < 50; i++){ const m = (a + b)/2; if (solve(m)) b = m; else a = m; }
    const D = b*(o.push ?? 1), [ox, oy] = solve(D) || solve(b);
    const pos = c.clone().addScaledVector(r, ox).addScaledVector(u, oy).addScaledVector(f, -D);
    return { pos: pos.toArray(), look: pos.clone().addScaledVector(f, 10).toArray(), dist: D, fov };
  };

  // ---------- HUD pieces (DOM, on simulation time) ----------
  function el(cls, parent, tag = 'div'){ const e = document.createElement(tag); e.className = cls; (parent || document.querySelector('.stage')).appendChild(e); return e; }
  // a line's words get times by length, at most `pace` words a second; *word* = orange stress
  G.captions = function(ctx, lines, o = {}){
    const pace = o.pace ?? 3.2, box = el('game-captions', ctx.stage), W = [];
    // exact timings from the recorded voice-over (e.g. Whisper word timestamps): o.words = [[t0, t1, 'word'], ...]
    if (o.words) o.words.forEach(([t0, t1, w], i) => W.push({ t0, t1, w, end: Math.min(t1 + .35, o.words[i+1] ? o.words[i+1][0] : t1 + .5) }));
    else lines.forEach((L, i) => {
      const t0 = L[0], text = L.length > 2 ? L[2] : L[1], next = lines[i+1] ? lines[i+1][0] : t0 + 99;
      const words = text.split(/\s+/).filter(Boolean), weight = words.map(w => .55 + w.replace(/[^\w]/g, '').length*.11 + (/[,.!?:;]$/.test(w) ? .45 : 0));
      const tot = weight.reduce((a, b) => a + b, 0), span = Math.min(L.length > 2 ? L[1] - t0 : next - t0 - .15, tot/pace); let t = t0;
      words.forEach((w, k) => { const d = span*weight[k]/tot; W.push({ t0: t, t1: t + d, w, end: k === words.length - 1 ? Math.min(t + d + .5, next) : t + d }); t += d; });
    });
    const span = el('word', box, 'span'); let cur = -1;
    return { update(t){
      let k = -1; for (let i = 0; i < W.length; i++){ if (t >= W[i].t0 && t < W[i].end) k = i; if (W[i].t0 > t) break; }
      if (k !== cur){ cur = k; if (k >= 0){ const w = W[k].w, stress = /^\*.*\*[,.!?:;]*$/.test(w);
        span.textContent = w.replace(/\*/g, ''); span.classList.toggle('stress', stress); } else span.textContent = ''; }
      if (k >= 0){ const u = clamp((t - W[k].t0)/.13, 0, 1); span.style.transform = `scale(${(1.18 - .18*u*u*(3 - 2*u)).toFixed(3)})`; span.style.opacity = '1'; }
      else span.style.opacity = '0';
    }, words: W };
  };
  G.card = function(ctx, o){
    const card = el('game-card', ctx.stage), col = G.RARITY[o.rarity] || o.rarity;
    card.style.setProperty('--rar', col);
    el('rar', card).textContent = (o.rarityLabel || o.rarity || '').toUpperCase();
    el('name', card).textContent = o.name || '';
    if (o.role) el('role', card).textContent = o.role;
    if (o.line) el('line', card).textContent = o.line;
    return { el: card, set(k){ card.style.opacity = clamp(k*1.6, 0, 1).toFixed(3); card.style.transform = `translate(-50%, ${((1 - smooth(0, 1, k))*6).toFixed(2)}cqw) skewX(-6deg)`; card.hidden = k <= 0; } };
  };
  G.bars = function(ctx){
    const B = [], v = new THREE.Vector3();
    return { set(i, s){
      let b = B[i]; if (!b){ const e = el('game-bars', ctx.stage); b = B[i] = { e, name: el('who', e), sh: el('bar shield', e), hp: el('bar hp', e) };
        b.shF = el('fill', b.sh); b.hpF = el('fill', b.hp); b.shN = el('num', b.sh, 'span'); b.hpN = el('num', b.hp, 'span'); }
      b.e.hidden = !s.show; if (!s.show) return;
      v.copy(s.at).project(ctx.camera);
      b.e.style.left = ((v.x*.5 + .5)*100).toFixed(2) + '%'; b.e.style.top = ((-v.y*.5 + .5)*100).toFixed(2) + '%';
      b.e.style.opacity = String(clamp(s.show, 0, 1));
      b.name.textContent = s.name || ''; b.shF.style.width = clamp(s.shield, 0, 100) + '%'; b.hpF.style.width = clamp(s.hp, 0, 100) + '%';
      b.shN.textContent = Math.round(s.shield); b.hpN.textContent = Math.round(s.hp);
    } };
  };
  G.feed = function(ctx){
    const box = el('game-feed', ctx.stage), rows = [];
    return { update(t, list){
      list.forEach((r, i) => { let e = rows[i]; if (!e){ e = rows[i] = el('row', box); e.innerHTML = '<b></b><i></i><b></b>'; }
        const age = t - r[0], on = age >= 0 && age < (r[4] ?? 5);
        e.hidden = !on; if (!on) return;
        e.children[0].textContent = r[1]; e.children[1].textContent = r[3]; e.children[2].textContent = r[2];
        e.style.opacity = (smooth(0, .2, age)*(1 - smooth((r[4] ?? 5) - .4, r[4] ?? 5, age))).toFixed(3); });
    } };
  };
})();
