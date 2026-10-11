/* Sets for the brainrot series: toy dioramas (a small world on a floating island, soft pastel colours, rounded
   shapes like the cast), built in code and animated as a pure function of time and state. Load after kit.js and
   kit-game.js (signs use Engine.game.coin and the series' display face: call Engine.game.fonts() before
   Engine.create). Colours go through ctx.col. The ground of a set is y = 0, so the cast stands on it as it is.

   Engine.fx.set(ctx, kind, o) -> { object, update(t, st), spots, ground(x, z), water }
     ground(x, z) is the height to stand on there (sand, a jetty deck, 0 on paving); water the sea level (null if none)
     kind 'market'   a town square on a floating island (~28 m across, open towards +z): cobbles, a fountain, six
                     market stalls (painted name signs, chalk price boards), a bell tower with a working clock, the
                     town hall (arcade, a balcony for speeches, a flag), a bank with columns, a bakery, a cafe, houses
                     with shutters, window boxes, balconies and laundry, bunting over the square, lamps, planters,
                     benches, pigeons, clouds round the island
       o  { stalls: [{ goods, name, price }] (six, in the order of spots.stalls; goods 'fruit' | 'melons' | 'bread' |
            'fish' | 'cheese' | 'flowers') }
       st { prices: ['3{c}', ...] per stall ('{c}' draws the coin; a board is redrawn only when its text changes),
            wind (0..1, default .4), night (0..1: windows, lamps and the clock face light up), clock (hours shown by
            the tower clock; default 10:10 creeping with t), bell (0..1: the bell swings), scatter (seconds since the
            pigeons took off; 0 = pecking on the ground), water (0..1 fountain flow, default 1) }
       spots { center, fountain: { at, r }, stalls: [{ goods, name, at, seller, yaw, view, board, sign }], balcony,
               hallDoor, bankDoor, bakeryDoor, cafe, clock, benches, ins: { front, left, right } }
               [x, z] on the ground, [x, y, z] in the air; a stall's yaw faces its customers (0 = +z),
               its view is the yaw of a camera that frames it with its board (G.fit) clear of the fountain. The page sets
               the sky (pastel: look.setSky) and the shadow box (the island fits in +-16 m).
     kind 'harbor'   a beach and a harbour on a floating island: a promenade along the back (HOTEL, a house with laundry,
                     ICE CREAM with a giant cone, the HARBOR office with signal flags, the FISH MARKET, a CARGO warehouse,
                     lamps, benches, barrels, crates, a crane with a swinging load), a sandy beach on the left running into
                     a translucent sea (foam at the shore, the water seen through the island's side), umbrellas, towels,
                     loungers, a lifeguard tower, a sandcastle, palms; a wooden jetty with a rowing boat, a stone pier with a
                     fishing boat and a harbour light, a breakwater, a lighthouse on a rocky islet, a sailing boat, gulls
       st { wind, night (also turns the lighthouse beam on), waves (0..1, default .5), sail (0..1 round its course;
            default creeps with t), scatter (gulls on the ground fly off) }
       spots { water, beach, shore, towels, loungers, lifeguard ([x, y, z] on the platform), sandcastle,
               jetty: { start, end ([x, y, z] on the deck) }, pier: { start, end }, boat ([x, y, z] on deck), iceCream,
               harbor, hotel, fishMarket, warehouse, quay, crane, lighthouse, benches, ins: { left, right } } */
(function(){
  'use strict';
  const THREE = window.THREE, E = window.Engine;
  if (!THREE || !E || !E.kit || !E.game) { console.error('sets.js: load engine.js, kit.js and kit-game.js first'); return; }
  const { clamp, smooth } = E, G = E.game, cyl = E.kit.cyl;
  const SPH = new THREE.SphereGeometry(1, 16, 12), SPL = new THREE.SphereGeometry(1, 9, 7), SPX = new THREE.SphereGeometry(1, 6, 5), BOX = new THREE.BoxGeometry(1, 1, 1);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
  const PI = Math.PI;

  // ---------- geometry helpers ----------
  // parts [geometry, [x,y,z], [rx,ry,rz] (order YXZ), scale, colour | (x,y,z,nx,ny,nz) => colour | null (the geometry's own colours)]
  function solid(parts){
    const P = [], N = [], Cc = [];
    for (const [src, p, r, s, col] of parts){
      const sc = s == null ? [1, 1, 1] : typeof s === 'number' ? [s, s, s] : s, rr = r || [0, 0, 0];
      _e.set(rr[0], rr[1], rr[2], 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(...(p || [0, 0, 0])), _q, _s.set(...sc));
      const g = (src.index ? src.toNonIndexed() : src.clone()).applyMatrix4(_m);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (sc[0]*sc[1]*sc[2] < 0) for (const a of [g.attributes.position.array, g.attributes.normal.array])
        for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++){ const t = a[i+3+k]; a[i+3+k] = a[i+6+k]; a[i+6+k] = t; }
      const pa = g.attributes.position.array, na = g.attributes.normal.array, ca = g.attributes.color && g.attributes.color.array;
      for (let i = 0; i < pa.length; i += 3){
        P.push(pa[i], pa[i+1], pa[i+2]); N.push(na[i], na[i+1], na[i+2]);
        const c = col == null ? null : typeof col === 'function' ? col(pa[i], pa[i+1], pa[i+2], na[i], na[i+1], na[i+2]) : col;
        if (c) Cc.push(c.r, c.g, c.b); else Cc.push(ca[i], ca[i+1], ca[i+2]);
      }
      g.dispose();
    }
    return buf(P, N, Cc);
  }
  function buf(P, N, Cc){
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (N) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); if (Cc) g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    return g;
  }
  function merge(list){
    const out = { position: [], normal: [], color: [] };
    for (const g of list) for (const k in out){ const a = g.attributes[k].array; for (let i = 0; i < a.length; i++) out[k].push(a[i]); }
    return buf(out.position, out.normal, out.color);
  }
  // a box with rounded edges (radius r), centred on the origin, flat faces exactly flat
  const RB = {};
  function rbox(w, h, d, r = .05){
    r = Math.min(r, w/2, h/2, d/2)*.999; const key = [w, h, d, r].map(v => v.toFixed(3)).join(); if (RB[key]) return RB[key];
    const n = r < .035 ? 1 : r < .07 ? 2 : 3, P = [], N = [], I = [], hx = w/2 - r, hy = h/2 - r, hz = d/2 - r, ths = [], phs = [];
    for (let i = 0; i <= n; i++) ths.push([PI/2*i/n, 1]); for (let i = 0; i <= n; i++) ths.push([PI/2 + PI/2*i/n, -1]);
    for (let q = 0; q < 4; q++) for (let j = 0; j <= n; j++){ const m = PI/2*(q + .5); phs.push([PI/2*(q + j/n), Math.sign(Math.cos(m)), Math.sign(Math.sin(m))]); }
    for (const [th, sy] of ths) for (const [ph, sx, sz] of phs){ const dx = Math.sin(th)*Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th)*Math.sin(ph);
      P.push(r*dx + sx*hx, r*dy + sy*hy, r*dz + sz*hz); N.push(dx, dy, dz); }
    const C = phs.length, R = ths.length;
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < C; j++){ const j2 = (j + 1)%C, a = i*C + j, b = i*C + j2, c = (i + 1)*C + j, d = (i + 1)*C + j2; I.push(a, c, b, b, c, d); }
    const top = [0, 1, 2, 3].map(q => q*(n + 1)), bot = top.map(k => (R - 1)*C + k);
    I.push(top[0], top[1], top[2], top[0], top[2], top[3], bot[0], bot[2], bot[1], bot[0], bot[3], bot[2]);
    for (let k = 0; k < I.length; k += 3){   // every face outwards
      const [a, b, c] = [I[k], I[k+1], I[k+2]], A = new THREE.Vector3(P[a*3], P[a*3+1], P[a*3+2]), Bv = new THREE.Vector3(P[b*3], P[b*3+1], P[b*3+2]), Cv = new THREE.Vector3(P[c*3], P[c*3+1], P[c*3+2]);
      const f = Bv.sub(A).cross(Cv.sub(A)), nn = new THREE.Vector3(N[a*3] + N[b*3] + N[c*3], N[a*3+1] + N[b*3+1] + N[c*3+1], N[a*3+2] + N[b*3+2] + N[c*3+2]);
      if (f.dot(nn) < 0){ I[k+1] = c; I[k+2] = b; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
    return RB[key] = g;
  }
  // a round-topped panel w x h, bottom at y = 0, d thick, centred on x and z
  const AR = {};
  function arch(w, h, d){
    const key = [w, h, d].map(v => v.toFixed(3)).join(); if (AR[key]) return AR[key];
    const s = new THREE.Shape(); s.moveTo(-w/2, 0); s.lineTo(w/2, 0); s.lineTo(w/2, h - w/2); s.absarc(0, h - w/2, w/2, 0, PI, false); s.lineTo(-w/2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 14 }); g.translate(0, 0, -d/2); return AR[key] = g;
  }
  // a triangular prism: base w (x) by d (z), apex `rise` above the base's middle line (a gable, a pediment)
  function prism(w, d, rise){
    const s = new THREE.Shape(); s.moveTo(-d/2, 0); s.lineTo(d/2, 0); s.lineTo(0, rise); s.lineTo(-d/2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w/2); g.rotateY(PI/2); return g;
  }
  function lathe(pts, seg = 32){ return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), seg); }
  // a tiled roof slope (own colours): len across (x), run up the slope (y), tiles bulging towards +z
  function tiles(len, run, c, rnd){
    const nx = Math.max(2, Math.round(len/.3)), ny = Math.max(2, Math.round(run/.36)), tw = len/nx, th = run/ny;
    const g = new THREE.PlaneGeometry(len, run, nx*3, ny*3), p = g.attributes.position, cols = [], base = c('#c8643f'), lo = c('#a9492c'), hi = c('#dc8452'), tc = new THREE.Color();
    const hash = (i, j) => { const s = Math.sin(i*12.9898 + j*78.233)*43758.5453; return s - Math.floor(s); };
    for (let i = 0; i < p.count; i++){
      const x = p.getX(i) + len/2, y = p.getY(i) + run/2, fx = x/tw - Math.floor(x/tw + 1e-6), fy = y/th - Math.floor(y/th + 1e-6), ix = Math.floor(x/tw + 1e-6), iy = Math.floor(y/th + 1e-6);
      const bulge = Math.pow(Math.sin(PI*clamp(fx, 0, 1)), .6), z = .045*bulge + .045*(1 - fy);
      p.setZ(i, z); const h = hash(ix + (iy%2)*.5, iy);
      tc.copy(base).lerp(h < .5 ? lo : hi, Math.abs(h - .5)*1.2).multiplyScalar(.82 + .18*bulge); cols.push(tc.r, tc.g, tc.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
  }

  // ---------- canvas textures ----------
  function canvas(w, h, draw){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; if (draw) draw(cv.getContext('2d'), w, h); return cv; }
  function tex(cv, rep){ const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
  function rrect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // cobbles: a colour map and a bump map that tile; rows of rounded stones in warm greys
  function cobbles(rnd){
    const S = 1024, col = canvas(S, S), bump = canvas(S, S), g = col.getContext('2d'), b = bump.getContext('2d');
    g.fillStyle = '#5f574f'; g.fillRect(0, 0, S, S); b.fillStyle = '#000'; b.fillRect(0, 0, S, S);
    const pal = ['#b9ada0', '#a99d90', '#c4b8a6', '#9f9386', '#b5a491', '#c2aa9c', '#aeaa9f', '#bcae9a'];
    const stone = (x, y, w, h, fill) => {
      for (const ox of [0, -S, S]){ const X = x + ox; if (X > S || X + w < 0) continue;
        const m = 3 + rnd()*3; rrect(g, X + m, y + m, w - 2*m, h - 2*m, 15); g.fillStyle = fill; g.fill();
        const gr = g.createLinearGradient(X, y, X + w*.6, y + h); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.22)');
        g.fillStyle = gr; g.fill();
        rrect(b, X + m, y + m, w - 2*m, h - 2*m, 15); const rg = b.createRadialGradient(X + w/2, y + h/2, 2, X + w/2, y + h/2, Math.max(w, h)*.6);
        rg.addColorStop(0, '#fff'); rg.addColorStop(.7, '#bbb'); rg.addColorStop(1, '#555'); b.fillStyle = rg; b.fill(); }
    };
    for (let y = 0; y < S; y += 64){ let x = -rnd()*70; while (x < S){ const w = 54 + rnd()*46; stone(x, y, w, 64, pal[Math.floor(rnd()*pal.length)]); x += w; } }
    return { map: tex(col, [1, 1]), bump: tex(bump, [1, 1]) };
  }
  // the fan of stones round the fountain: rings of stones, every fourth ring darker
  function rosette(rnd){
    const S = 1024, col = canvas(S, S), bump = canvas(S, S), g = col.getContext('2d'), b = bump.getContext('2d'), c = S/2;
    g.fillStyle = '#5f574f'; g.fillRect(0, 0, S, S); b.fillStyle = '#000'; b.fillRect(0, 0, S, S);
    for (let k = 0, r = 150; r < c; k++, r += 30){ const n = Math.round(2*PI*r/52), dark = k%4 === 3;
      for (let i = 0; i < n; i++){ const a0 = (i + .08)/n*2*PI + k*.3, a1 = (i + .92)/n*2*PI + k*.3;
        const path = ctx2 => { ctx2.beginPath(); ctx2.arc(c, c, r + 3, a0, a1); ctx2.arc(c, c, r + 27, a1, a0, true); ctx2.closePath(); };
        path(g); g.fillStyle = dark ? ['#8f8377', '#978b7e'][i%2] : ['#c9bdab', '#bfb2a0', '#d1c5b2', '#b8ab99'][Math.floor(rnd()*4)]; g.fill();
        path(b); b.fillStyle = '#ccc'; b.fill(); } }
    return { map: tex(col), bump: tex(bump) };
  }
  function grassTex(rnd){
    return tex(canvas(512, 512, (g, W, H) => { g.fillStyle = '#6fb84c'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 2600; i++){ const x = rnd()*W, y = rnd()*H, l = 6 + rnd()*10; g.strokeStyle = ['#5fa63f', '#82c95a', '#68b247', '#8fd166'][Math.floor(rnd()*4)]; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5)*5, y - l); g.stroke(); } }), [10, 10]);
  }
  // a painted sign: rounded board, a darker edge, heavy italic letters
  function signCanvas(text, o = {}){
    const W = o.w ?? 1024, H = o.h ?? 256;
    return canvas(W, H, g => { const r = H*.2; rrect(g, 2, 2, W - 4, H - 4, r); g.fillStyle = o.edge ?? '#5b3a1e'; g.fill();
      rrect(g, H*.07, H*.07, W - H*.14, H - H*.14, r*.75); g.fillStyle = o.bg ?? '#7a4b25'; g.fill();
      let size = H*.58; g.font = `italic 900 ${size}px ${G.FACE}`; const w = g.measureText(text).width; if (w > W*.84){ size *= W*.84/w; g.font = `italic 900 ${size}px ${G.FACE}`; }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.25)'; g.fillText(text, W/2 + 4, H*.54 + 5);
      g.fillStyle = o.ink ?? '#ffe9b8'; g.fillText(text, W/2, H*.54); });
  }
  function signMesh(text, w, h, o){ const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex(signCanvas(text, Object.assign({ w: Math.min(2048, Math.round(256*w/h)), h: 256 }, o))), roughness: .7, alphaTest: .5 }));
    m.castShadow = true; return m; }
  // a chalk price board: wooden frame, slate, the goods' name small and the price big ('{c}' = the coin)
  function drawChalk(cv, name, price){
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, rnd = E.mulberry32(7);
    g.clearRect(0, 0, W, H); rrect(g, 0, 0, W, H, 26); g.fillStyle = '#8a5a32'; g.fill();
    rrect(g, 26, 26, W - 52, H - 52, 12); g.fillStyle = '#28322f'; g.fill();
    for (let i = 0; i < 26; i++){ g.fillStyle = `rgba(255,255,255,${.015 + rnd()*.03})`; g.beginPath(); g.ellipse(40 + rnd()*(W - 80), 40 + rnd()*(H - 80), 20 + rnd()*70, 8 + rnd()*20, rnd()*3, 0, 2*PI); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(246,244,234,.85)';
    g.font = `italic 800 ${H*.11}px ${G.FACE}`; g.fillText(name, W/2, H*.2);
    g.strokeStyle = 'rgba(246,244,234,.6)'; g.lineWidth = 5; g.beginPath(); for (let x = W*.22; x <= W*.78; x += 8) g.lineTo(x, H*.29 + 3*Math.sin(x*.09)); g.stroke();
    const parts = String(price).split('{c}'), coin = G.coin(256); let size = H*.36;
    const width = () => { g.font = `italic 900 ${size}px ${G.FACE}`; return parts.reduce((a, p) => a + g.measureText(p).width, 0) + (parts.length - 1)*size*1.0; };
    const fit = Math.min(1, W*.82/width()); size *= fit; const total = width(); let x = (W - total)/2; const y = H*.62;
    g.textAlign = 'left'; g.fillStyle = '#f7f4ea';
    parts.forEach((p, i) => { g.fillText(p, x, y); x += g.measureText(p).width; if (i < parts.length - 1){ g.drawImage(coin, x + size*.08, y - size*.44, size*.86, size*.86); x += size; } });
  }

  // ---------- shared builders: every set gets a kit (its root, one bucket of geometry per material, the island,
  // façades and houses, street furniture, strings of flags or laundry, birds, clouds) ----------
  function kit(ctx, seed){
    const c = ctx.col, R = E.mulberry32(seed), root = new THREE.Group(), tmp = new THREE.Color();
    ctx.scene.add(root);
    const B = { body: [], gloss: [], glass: [], lit: [], lamp: [] };   // world-space geometry per material
    const bake = (L, mat) => { for (const k in B) if (L[k] && L[k].length){ const g = solid(L[k]); if (mat) g.applyMatrix4(mat); B[k].push(g); } };
    const parts = () => ({ body: [], gloss: [], glass: [], lit: [], lamp: [] });
    const placeM = (x, z, yaw = 0, y = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const toWorld = (M, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M);
    const group = (M) => { const g = new THREE.Group(); g.applyMatrix4(M); root.add(g); return g; };
    const IRON = c('#2f3a38'), WOOD = c('#9a6a3e'), WOODL = c('#c89462'), TERRA = c('#c4673f'), STONE = c('#cfc3b1'), LEAF = c('#5aa548'), LEAF2 = c('#7cc25a');
    const BLOOMS = ['#e8414f', '#ff8fb1', '#ffffff', '#ffd23f', '#b07ce8', '#ff7a3d'].map(h => c(h));
    const dyn = [];   // things animated in update

    const HW = 14.2, RC = 5;
    const rrShape = (hw, hd, r) => { const p = new THREE.Shape(); p.moveTo(-hw + r, -hd); p.lineTo(hw - r, -hd); p.quadraticCurveTo(hw, -hd, hw, -hd + r); p.lineTo(hw, hd - r);
      p.quadraticCurveTo(hw, hd, hw - r, hd); p.lineTo(-hw + r, hd); p.quadraticCurveTo(-hw, hd, -hw, hd - r); p.lineTo(-hw, -hd + r); p.quadraticCurveTo(-hw, -hd, -hw + r, -hd); return p; };
    // the island: a rounded square whose top edge follows top(x, z) (default 0, coloured lip(x, z, y), default grass),
    // soil then rock below, tapering to a point; a few rocks float underneath. Returns the edge ring [[x, z], ...]
    const rockC = c('#867870'), rockD = c('#5f554f');
    function island(o = {}){
      const N = o.n ?? 160, ring = rrShape(HW, HW, RC).getSpacedPoints(N).slice(0, N).map(v => [v.x, v.y]), LV = [[0, 1, 0], [-.22, 1.012, 0], [-.4, 1.0, .01], [-1.1, .993, .02], [-1.8, .975, .04], [-2.8, .92, .08], [-4.3, .8, .12], [-6.0, .6, .14], [-7.5, .4, .14], [-8.7, .2, .12], [-9.5, .06, .08]];
      const P = [], Cc = [], I = [], grass = c('#5ea944'), soil = [c('#a3714a'), c('#8c5d3b'), c('#b07e52')];
      LV.forEach(([y, s, amp], li) => ring.forEach(([x, z]) => { const a = Math.atan2(z, x), nz = 1 + amp*(.5*Math.sin(5*a + 1.3*li) + .3*Math.sin(11*a + 2.1*li) + .2*Math.sin(23*a + .7*li));
        const h0 = o.top ? o.top(x, z) : 0, yy = li < 2 ? h0 + y : Math.min(y + (li > 2 ? .25*Math.sin(7*a + li) : 0), h0 - .2*li);
        P.push(x*s*nz, yy, z*s*nz);
        if (li < 2) tmp.copy(o.lip ? o.lip(x, z, h0) : grass); else if (yy > -1.9) tmp.copy(soil[((Math.floor(-yy*3.2 + .4*Math.sin(3*a))%3) + 3)%3]);
        else tmp.copy(rockC).lerp(rockD, smooth(-2.5, -9, yy)).multiplyScalar(.92 + .16*(.5 + .5*Math.sin(17*a + li*2.3)));
        Cc.push(tmp.r, tmp.g, tmp.b); }));
      for (let i = 0; i < LV.length - 1; i++) for (let j = 0; j < N; j++){ const j2 = (j + 1)%N, a = i*N + j, b = i*N + j2, d = (i + 1)*N + j, e = (i + 1)*N + j2; I.push(a, b, d, b, e, d); }
      const tip = P.length/3; P.push(0, -10.2, 0); Cc.push(rockD.r, rockD.g, rockD.b); for (let j = 0; j < N; j++){ const a = (LV.length - 1)*N + j, b = (LV.length - 1)*N + (j + 1)%N; I.push(a, b, tip); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setIndex(I); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 })); m.receiveShadow = true; m.castShadow = true; root.add(m);
      const rk = [];
      for (let i = 0; i < 6; i++){ const a = i*1.13 + .4, d = 9 + 4*R(), y = -4 - 4*R(), s = .5 + .7*R();
        rk.push([new THREE.DodecahedronGeometry(1, 1), [Math.cos(a)*d, y, Math.sin(a)*d], [R()*3, R()*3, 0], [s, s*.8, s], (x, yy) => tmp.copy(rockC).lerp(rockD, smooth(y + s, y - s, yy)).clone()]); }
      const rocks = new THREE.Mesh(solid(rk), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true })); rocks.castShadow = true; root.add(rocks);
      dyn.push(t => { rocks.position.y = .25*Math.sin(t*.5); });
      return ring;
    }

    // ----- façade pieces (house space: façade on z = 0 facing +z, x across, y up) -----
    function win(L, x, y, w, h, s){
      const T = s.trim, t = .08;
      if (s.arch){ L.body.push([arch(w + 2*t, h + t, .06), [x, y - h/2 - t, .03], 0, 1, T]); (s.lit ? L.lit : L.glass).push([arch(w, h, .02), [x, y - h/2, .065], 0, 1, c('#5f8fbf')]); }
      else { L.body.push([rbox(w + 2*t, h + 2*t, .06, .02), [x, y, .03], 0, 1, T]); (s.lit ? L.lit : L.glass).push([BOX, [x, y, .065], 0, [w, h, .02], c('#5f8fbf')]); }
      L.body.push([BOX, [x, y - (s.arch ? .1 : 0), .082], 0, [.035, h - (s.arch ? .2 : 0), .018], T], [BOX, [x, y + h*.16, .082], 0, [w, .035, .018], T]);
      L.body.push([rbox(w + .3, .07, .17, .02), [x, y - h/2 - t - .02, .085], 0, 1, T]);
      if (s.cap) L.body.push([rbox(w + .36, .1, .13, .03), [x, y + h/2 + t + .08, .065], 0, 1, T]);
      if (s.shut){ const sc = s.shut, sd = sc.clone().multiplyScalar(.78), n = Math.max(4, Math.round(h/.12));
        for (const sg of [-1, 1]){ const cx = x + sg*(w/2 + t + w/4 + .02);
          L.body.push([rbox(w/2, h + .04, .035, .01), [cx, y, .02], 0, 1, sc]);
          for (let k = 0; k < n; k++) L.body.push([BOX, [cx, y - h/2 + (k + .5)*(h + .04)/n, .042], [-.35, 0, 0], [w/2 - .07, .025, .018], sd]); } }
      if (s.box){ L.body.push([rbox(w + .16, .17, .2, .03), [x, y - h/2 - t - .16, .13], 0, 1, TERRA]);
        for (let k = 0; k < 7; k++){ const px = x - w/2 + (k + .5)*w/7; L.body.push([SPX, [px, y - h/2 - t - .04, .13 + (R() - .5)*.06], 0, [.09, .07, .08], (xx, yy, zz, nx, ny) => tmp.copy(LEAF).lerp(LEAF2, .5 + .5*ny).clone()]);
          if (k%2 === 0 || R() < .4) L.body.push([SPX, [px + (R() - .5)*.05, y - h/2 - t + .02 + R()*.04, .17], 0, .045, s.bloom ?? BLOOMS[Math.floor(R()*BLOOMS.length)]]); } }
    }
    function door(L, x, w, h, s){
      L.body.push([arch(w + .24, h + .12, .06), [x, 0, .03], 0, 1, s.trim], [arch(w, h, .05), [x, 0, .055], 0, 1, s.door]);
      const dk = s.door.clone().multiplyScalar(.78);
      for (const sg of [-1, 1]) L.body.push([rbox(w/2 - .12, h - w/2 - .4, .02, .01), [x + sg*w/4, (h - w/2)/2 + .1, .085], 0, 1, dk]);
      L.gloss.push([SPL, [x + w*.3, h*.45, .1], 0, .035, c('#d9a93a')]);
      L.body.push([rbox(w + .55, .12, .45, .03), [x, .06, .2], 0, 1, STONE]);
    }
    function balcony(L, x, y, w){
      L.body.push([rbox(w, .12, .75, .03), [x, y, .37], 0, 1, STONE]);
      for (const sg of [-1, 1]) L.body.push([rbox(.12, .22, .5, .03), [x + sg*(w/2 - .2), y - .15, .25], 0, 1, STONE]);
      const n = Math.round(w/.14);
      for (let k = 0; k <= n; k++) L.gloss.push([cyl(.012, .012, 6), [x - w/2 + .06 + k*(w - .12)/n, y + .48, .68], 0, [1, .85, 1], IRON]);
      for (let k = 0; k < 4; k++) L.gloss.push([cyl(.012, .012, 6), [x + (k%2 ? 1 : -1)*(w/2 - .06), y + .48, .12 + .17*(k >> 1 ? 2 : 1)], 0, [1, .85, 1], IRON]);
      L.gloss.push([cyl(.025, .025, 8), [x, y + .92, .68], [0, 0, PI/2], [1, w - .1, 1], IRON], [cyl(.016, .016, 8), [x, y + .12, .68], [0, 0, PI/2], [1, w - .1, 1], IRON]);
      for (const sg of [-1, 1]) L.gloss.push([cyl(.025, .025, 8), [x + sg*(w/2 - .06), y + .92, .37], [PI/2, 0, 0], [1, .65, 1], IRON]);
      for (const sg of [-1, 1]){ L.body.push([lathe([[0, 0], [.1, 0], [.13, .2], [.14, .22], [0, .22]], 12), [x + sg*(w/2 - .3), y + .06, .45], 0, 1, TERRA]);
        L.body.push([SPL, [x + sg*(w/2 - .3), y + .38, .45], 0, [.17, .16, .17], (xx, yy, zz, nx, ny) => tmp.copy(LEAF).lerp(LEAF2, .5 + .5*ny).clone()]);
        for (let k = 0; k < 4; k++) L.body.push([SPX, [x + sg*(w/2 - .3) + (R() - .5)*.2, y + .44 + R()*.08, .45 + (R() - .5)*.2], 0, .04, BLOOMS[(k + (sg > 0 ? 2 : 0))%BLOOMS.length]]); }
    }
    // a striped canvas awning: slope from the wall (y = 0, z = 0) down to (y = -drop, z = dep), scalloped valance
    const AWT = {};
    function awning(w, dep, drop, a, b){
      const key = a + b; if (!AWT[key]) AWT[key] = tex(canvas(256, 256, g => {
        for (let i = 0; i < 2; i++){ g.fillStyle = i ? b : a; g.fillRect(i*128, 0, 128, 180); g.fillRect(i*128, 180, 128, 36); g.beginPath(); g.ellipse(i*128 + 64, 216, 64, 38, 0, 0, PI); g.fill(); }
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 176, 256, 5); }), [1, 1]);
      const t = AWT[key].clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w/.64)), 1);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: .85, side: THREE.DoubleSide, alphaTest: .5 }), grp = new THREE.Group();
      const sl = new THREE.PlaneGeometry(w, 1, 1, 6), p = sl.attributes.position, uv = sl.attributes.uv;
      for (let i = 0; i < p.count; i++){ const v = .5 - p.getY(i); p.setXYZ(i, p.getX(i), -drop*v + .05*Math.sin(PI*v), dep*v); uv.setY(i, 1 - v*180/256); }
      sl.computeVertexNormals();
      const va = new THREE.PlaneGeometry(w, .26); va.translate(0, -drop - .13, dep); const vu = va.attributes.uv; for (let i = 0; i < vu.count; i++) vu.setY(i, vu.getY(i)*(76/256) + 0);
      for (const g of [sl, va]){ const mm = new THREE.Mesh(g, m); mm.castShadow = true; mm.receiveShadow = true; grp.add(mm); }
      return grp;
    }
    function roofGable(L, W, D, H, rnd, wall){
      const a = .5, ov = .35, run = (D/2 + ov)/Math.cos(a), rise = (D/2 + ov)*Math.tan(a), y0 = H + .14, len = W + .5;
      const tl = tiles(len, run, c, rnd), dir = [0, Math.sin(a), -Math.cos(a)];
      L.body.push([tl, [0, y0 + dir[1]*run/2, ov + dir[2]*run/2], [a - PI/2, 0, 0], 1, null]);
      L.body.push([tl, [0, y0 + dir[1]*run/2, -D - ov - dir[2]*run/2], [a - PI/2, PI, 0], 1, null]);
      L.body.push([prism(W - .04, D - .04, D/2*Math.tan(a)), [0, H + .1, -D/2], 0, 1, wall]);
      L.body.push([cyl(.09, .09, 10), [0, y0 + rise + .02, -D/2], [0, 0, PI/2], [1, len + .06, 1], c('#a84a2e')]);
      return y0 + rise;
    }
    // a house: s { w, d, floors, color, trim, shut, kind ('house'|'bakery'|'cafe'|'shop'), roof ('gable'|'flat'), balcony, boxes, sign, awn:[a,b], door }
    function house(s, M){
      const L = parts(), W = s.w, D = s.d ?? 3.2, F = s.floors ?? 3, G0 = 3.1, FH = 2.75, H = G0 + (F - 1)*FH;
      const wall = c(s.color), trim = c(s.trim ?? '#f1e4cb'), shut = s.shut ? c(s.shut) : null, grime = wall.clone().multiplyScalar(.8);
      const wcol = (x, y) => tmp.copy(grime).lerp(wall, smooth(0, 1.4, y)).clone();
      L.body.push([rbox(W, H, D, .1), [0, H/2, -D/2], 0, 1, s.color ? wcol : wall]);
      L.body.push([rbox(W + .06, .5, D + .06, .04), [0, .25, -D/2], 0, 1, c(s.plinth ?? '#a39585')]);
      for (let f = 1; f < F; f++) L.body.push([rbox(W + .08, .14, .16, .04), [0, G0 + (f - 1)*FH - .05, .02], 0, 1, trim]);
      L.body.push([rbox(W + .3, .22, D + .3, .05), [0, H + .03, -D/2], 0, 1, trim]);
      for (const sg of [-1, 1]) L.body.push([rbox(.22, H - .5, .08, .02), [sg*(W/2 - .11), H/2 + .25, .03], 0, 1, trim]);   // corner pilasters
      // upper floors
      const nw = Math.max(1, Math.round((W - .6)/1.55)), sp = W/nw, ww = Math.min(.82, sp*.5), st = { trim, shut, cap: s.cap };
      for (let f = 1; f < F; f++) for (let i = 0; i < nw; i++){ const x = -W/2 + (i + .5)*sp, y = G0 + (f - 1)*FH + 1.3;
        const balc = s.balcony && f === 1 && i === Math.floor(nw/2);
        win(L, x, balc ? y - .2 : y, ww, balc ? 1.75 : 1.3, Object.assign({}, st, { box: !balc && (s.boxes ?? .4) > R(), lit: R() < .55, arch: s.archTop && f === 1 }));
        if (balc) balcony(L, x, G0 + (f - 1)*FH - .02, Math.min(W - .6, ww + 1.2)); }
      // ground floor
      const meshes = [], kind = s.kind ?? 'house';
      if (kind === 'house'){ const dx = nw > 1 ? -W/2 + .5*sp : 0; door(L, dx, .95, 2.25, { trim, door: c(s.door ?? '#6d4a2f') });
        for (let i = 0; i < nw; i++){ const x = -W/2 + (i + .5)*sp; if (Math.abs(x - dx) > .5) win(L, x, 1.55, ww, 1.2, Object.assign({}, st, { box: R() < .5, lit: R() < .5 })); } }
      else {   // a shop: a door, a big window, an awning, the name over it
        const fr = c(s.frame ?? '#2f5b48'), dw = .95, dx = -W/2 + .35 + dw/2, gx = dx + dw/2 + .2, gw = W/2 - .3 - gx;
        L.body.push([rbox(W - .3, 2.6, .07, .03), [0, 1.35, .035], 0, 1, fr]);
        door(L, dx, dw, 2.3, { trim: fr, door: c(s.door ?? '#7a5233') });
        L.lit.push([BOX, [gx + gw/2, 1.5, .08], 0, [gw - .1, 1.6, .02], c('#6f9cc8')]);
        L.body.push([BOX, [gx + gw/2, .62, .12], 0, [gw, .1, .12], fr], [BOX, [gx + gw/2, 1.5, .1], 0, [.04, 1.6, .02], fr]);
        if (kind === 'bakery') for (let k = 0; k < 5; k++) L.body.push([SPH, [gx + .25 + k*(gw - .5)/4, .76, .02], [0, .3*k, 0], [.12, .07, .07], c('#d39a4f')]);
        const aw = awning(W - .2, .95, .55, ...(s.awn ?? ['#2f8a5a', '#f4efe2'])); aw.position.set(0, 2.95, .05); meshes.push(aw);
        const sg = signMesh(s.sign ?? 'SHOP', Math.min(W - .5, 2.4), .48, { bg: s.signBg ?? '#7a4b25' }); sg.position.set(0, 3.22 + (F > 1 ? -.02 : 0), .1); meshes.push(sg);
        if (F > 1) L.body.push([BOX, [0, 3.22, .07], 0, [Math.min(W - .5, 2.4) - .1, .42, .05], c('#4a2e18')]);
      }
      // roof
      let top = H + .14;
      if ((s.roof ?? 'gable') === 'gable') top = roofGable(L, W, D, H, R, wall);
      else { L.body.push([rbox(W + .1, .55, .18, .04), [0, H + .4, .05], 0, 1, wall], [rbox(W + .24, .1, .3, .03), [0, H + .7, .05], 0, 1, trim]);
        for (const sg of [-1, 1]) L.body.push([rbox(.18, .55, D, .04), [sg*(W/2 - .04), H + .4, -D/2], 0, 1, wall]);
        for (let k = 0; k < 3; k++){ const x = -W/2 + .6 + k*(W - 1.2)/2; L.body.push([lathe([[0, 0], [.16, 0], [.2, .3], [.22, .33], [0, .33]], 12), [x, H + .14, -.5], 0, 1, TERRA], [SPL, [x, H + .65, -.5], 0, [.28, .3, .28], (xx, yy, zz, nx, ny) => tmp.copy(LEAF).lerp(LEAF2, .5 + .5*ny).clone()]); } }
      if (s.chimney !== false && (s.roof ?? 'gable') === 'gable'){ const cx = (R() - .5)*(W - 1.2); L.body.push([rbox(.42, 1.3, .42, .04), [cx, top - .2, -D*.7], 0, 1, wall], [rbox(.56, .1, .56, .03), [cx, top + .47, -D*.7], 0, 1, trim], [cyl(.08, .08, 10), [cx, top + .6, -D*.7], 0, [1, .22, 1], TERRA]); }
      bake(L, M); const g = group(M); meshes.forEach(m => g.add(m));
      return { H, top, G0, FH, W, D, group: g };
    }

    // street furniture into a parts list (bench bakes itself)
    function lamp(L, x, z, y = 0){ const green = c('#2f4a3f');
      L.gloss.push([lathe([[0, 0], [.2, 0], [.2, .1], [.12, .2], [.1, .5], [.07, .6], [.06, 3.0], [.09, 3.06], [.09, 3.12], [0, 3.12]], 14), [x, y, z], 0, 1, green]);
      L.gloss.push([cyl(.05, .17, 6), [x, y + 3.75, z], 0, [1, .14, 1], green], [cyl(.15, .1, 6), [x, y + 3.13, z], 0, [1, .06, 1], green], [SPH, [x, y + 3.9, z], 0, .05, green]);
      for (let k = 0; k < 6; k++){ const a = k*PI/3; L.gloss.push([BOX, [x + Math.cos(a)*.13, y + 3.42, z + Math.sin(a)*.13], [0, -a, 0], [.02, .55, .02], green]); }
      L.lamp.push([cyl(.15, .1, 6), [x, y + 3.42, z], 0, [1, .52, 1], c('#ffe7b0')]); }
    function planter(L, x, z, s){ L.body.push([lathe([[0, 0], [.45, 0], [.55, .55], [.6, .6], [.6, .66], [0, .66]], 20), [x, 0, z], 0, s, TERRA]);
      L.body.push([cyl(.06, .08, 8), [x, .66*s + .5*s, z], 0, [s, 1.0*s, s], c('#7a5233')]);
      for (let k = 0; k < 5; k++){ const a = k*1.3; L.body.push([SPL, [x + Math.cos(a)*.3*s*(k ? 1 : 0), (1.45 + (k ? 0 : .3))*s + .1*Math.sin(k), z + Math.sin(a)*.3*s*(k ? 1 : 0)], 0, [.5*s, .45*s, .5*s], (xx, y, zz, nx, ny) => tmp.copy(LEAF).lerp(LEAF2, .5 + .5*ny).clone()]); } }
    function bench(x, z, yaw){ const M = placeM(x, z, yaw), Lb = parts();
      for (let k = 0; k < 4; k++) Lb.body.push([rbox(1.6, .045, .1, .015), [0, .45, -.18 + k*.12], 0, 1, WOODL]);
      for (let k = 0; k < 3; k++) Lb.body.push([rbox(1.6, .1, .04, .015), [0, .62 + k*.13, -.29], [-.12, 0, 0], 1, WOODL]);
      for (const sx of [-1, 1]) Lb.gloss.push([BOX, [sx*.68, .22, 0], 0, [.06, .44, .4], IRON], [BOX, [sx*.68, .7, -.3], [-.12, 0, 0], [.06, .5, .05], IRON], [BOX, [sx*.68, .6, .02], 0, [.05, .05, .4], IRON]);
      bake(Lb, M); }


    // strings of flags or laundry in one dynamic mesh: lines [{a, b (Vector3), sag, items: [{shape 'tri' | 'rect', w, h, col}]}]
    function strings(lines){
      let strings;
      {
        let nv = 0; for (const l of lines){ nv += 30*6; for (const it of l.items) nv += it.shape === 'tri' ? 3 : 6; }
        const P = new Float32Array(nv*3), Cc = new Float32Array(nv*3); let o3 = 0;
        const cord = c('#f4efe2');
        for (const l of lines){ for (let k = 0; k < 30*6; k++){ Cc[o3++] = cord.r; Cc[o3++] = cord.g; Cc[o3++] = cord.b; }
          for (const it of l.items){ const col = c(it.col); for (let k = 0; k < (it.shape === 'tri' ? 3 : 6); k++){ Cc[o3++] = col.r; Cc[o3++] = col.g; Cc[o3++] = col.b; } } }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
        strings = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide })); strings.castShadow = true; strings.frustumCulled = false; root.add(strings);
      }
    const pt = (l, s, t, wind, out) => { out.copy(l.a).lerp(l.b, s); out.y -= l.sag*4*s*(1 - s);
      const sw = Math.sin(PI*s)*(.04 + .14*wind)*Math.sin(t*1.3 + l.a.x*.3 + l.a.z*.2); const d = _v.copy(l.b).sub(l.a).normalize(); out.x += -d.z*sw; out.z += d.x*sw; return out; };
    const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), ax = new THREE.Vector3(), dn = new THREE.Vector3(), q = new THREE.Quaternion();
    function updateStrings(t, wind){
      const P = strings.geometry.attributes.position.array; let o = 0;
      const put = v => { P[o++] = v.x; P[o++] = v.y; P[o++] = v.z; };
      for (const l of lines){
        for (let k = 0; k < 30; k++){ pt(l, k/30, t, wind, tA); pt(l, (k + 1)/30, t, wind, tB); tC.copy(tA); tC.y -= .02; put(tA); put(tC); put(tB); tC.copy(tB); tC.y -= .02; put(tB); put(tC); tA.y -= .02; put(tA); }
        const n = l.items.length, len = l.a.distanceTo(l.b);
        l.items.forEach((it, i) => { const s0 = (i + .5)/n - it.w/len/2, s1 = s0 + it.w/len; pt(l, s0, t, wind, tA); pt(l, s1, t, wind, tB);
          ax.copy(tB).sub(tA).normalize(); const fl = (it.shape === 'tri' ? .25 : .15) + wind*(.35 + .3*Math.sin(t*3.1 + i*.9 + l.a.z));
          q.setFromAxisAngle(ax, fl); dn.set(0, -it.h, 0).applyQuaternion(q);
          if (it.shape === 'tri'){ tC.copy(tA).add(tB).multiplyScalar(.5).add(dn); put(tA); put(tB); put(tC); }
          else { const a2 = tA.clone().add(dn), b2 = tB.clone().add(dn); put(tA); put(a2); put(tB); put(tB); put(a2); put(b2); } });
      }
      strings.geometry.attributes.position.needsUpdate = true; strings.geometry.computeVertexNormals();
    }
      return updateStrings;
    }


    // birds that walk and peck round their homes ([x, z] or {x, z, y}) and fly off when scattered (seconds since);
    // o.kind 'pigeon' | 'gull'; o.fly: [{x, z, r, y}] circle overhead all the time
    function birds(homesIn, o = {}){
      const pigeons = [], gull = o.kind === 'gull';
      {
      const grey = c(gull ? '#f3f5f7' : '#8d94a6'), dark = c(gull ? '#7f8b99' : '#5d6475'), neck = c(gull ? '#ffffff' : '#5e8f7a'), wingC = c(gull ? '#b7c1cc' : '#8d94a6');
      const pb = solid([[SPH, [0, .12, 0], 0, [.075, .07, .12], grey], [SPH, [0, .13, .06], 0, [.068, .068, .07], gull ? grey : c('#9aa0b0')], [SPH, [0, .175, .07], 0, [.045, .05, .045], neck],
        [BOX, [0, .13, -.15], [-.25, 0, 0], [.08, .015, .1], dark], [cyl(.007, .007, 5), [.025, .03, .01], 0, [1, .06, 1], c(gull ? '#e8a55a' : '#c85a5a')], [cyl(.007, .007, 5), [-.025, .03, .01], 0, [1, .06, 1], c(gull ? '#e8a55a' : '#c85a5a')]]);
      const hb = solid([[SPH, [0, 0, 0], 0, .042, gull ? grey : c('#7a8192')], [cyl(0, .011, 6), [0, -.006, .048], [PI/2, 0, 0], [1, gull ? .045 : .03, 1], c(gull ? '#f2b631' : '#3b3b3b')], [SPH, [0, .002, .036], 0, .012, c(gull ? '#f2b631' : '#e8e8e8')],
        [SPH, [.03, .012, .015], 0, .009, c(gull ? '#1d2228' : '#e8762c')], [SPH, [-.03, .012, .015], 0, .009, c(gull ? '#1d2228' : '#e8762c')]]);
      const wg = solid([[SPH, [0, 0, -.06], 0, [.018, .055, .12], wingC], [BOX, [0, -.02, -.07], 0, [.03, .03, .02], dark], [BOX, [0, -.02, -.11], 0, [.03, .03, .02], gull ? c('#222831') : dark]]);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7 });
      const homes = homesIn.map(h => Array.isArray(h) ? { x: h[0], z: h[1] } : h).concat((o.fly || []).map(f => Object.assign({ fly: true }, f)));
      homes.forEach((h, i) => { const g = new THREE.Group(), body = new THREE.Mesh(pb, mat), head = new THREE.Mesh(hb, mat); head.position.set(0, .2, .1);
        const wl = new THREE.Mesh(wg, mat), wr = new THREE.Mesh(wg, mat); wl.position.set(.07, .15, .04); wr.position.set(-.07, .15, .04);
        for (const m of [body, head, wl, wr]){ m.castShadow = true; g.add(m); } root.add(g);
        pigeons.push({ g, head, wl, wr, hx: h.x, hz: h.z, hy: h.y ?? 0, fly: h.fly, r: h.r ?? .45, ph: i*1.7, sp: .8 + .4*((i*37)%10)/10 }); g.scale.setScalar(gull ? 1.6 : 1.25); });
      }
      return function updatePigeons(t, scatter){
        for (const p of pigeons){
          if (p.fly){ const a = t*.35*p.sp + p.ph; p.g.position.set(p.hx + Math.cos(a)*p.r, p.hy + .6*Math.sin(t*.7 + p.ph), p.hz + Math.sin(a)*p.r);
            p.g.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), .35); const f = .25 + .5*Math.max(0, Math.sin(t*1.3 + p.ph))*Math.sin(t*11 + p.ph); p.wl.rotation.z = -1.25 - f; p.wr.rotation.z = 1.25 + f; continue; }
          if (scatter > 0){ const s = scatter, a = -PI/2 + (p.hx > 0 ? .7 : -.7) + .3*Math.sin(p.ph), d = 3.5*s + .8*s*s;
            p.g.visible = s < 7; p.g.position.set(p.hx + Math.cos(a)*d, p.hy + .12 + 1.4*s + .5*s*s, p.hz + Math.sin(a)*d); p.g.rotation.set(-.35, Math.atan2(Math.cos(a), Math.sin(a)), 0);
            const f = .9*Math.sin(s*30 + p.ph); p.wl.rotation.z = -.2 - f; p.wr.rotation.z = .2 + f; p.head.rotation.x = 0; continue; }
          p.g.visible = true; const u = t*.32*p.sp + .22*Math.sin(t*.55 + p.ph) + p.ph, r = p.r;
          p.g.position.set(p.hx + Math.cos(u)*r, p.hy, p.hz + Math.sin(u)*r); p.g.rotation.set(0, Math.atan2(-Math.sin(u), Math.cos(u)), 0);
          const pause = smooth(.2, .7, -Math.cos(t*.55 + p.ph)), peck = pause*Math.pow(Math.max(0, Math.sin(t*6 + p.ph*3)), 6);
          p.head.rotation.x = 1.0*peck; p.head.position.set(0, .2 - .06*peck, .1 + .015*Math.sin(t*14*p.sp)*(1 - pause) + .03*peck); p.wl.rotation.z = p.wr.rotation.z = 0; }
      };
    }


    // clouds round the island, drifting
    function clouds(){
      const clouds = [];
    {
      const top = c('#ffffff'), bot = c('#dfe4f2'), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .6 });
      const spec = [[38, -5, .4, 1.6], [46, -11, 1.5, 2.0], [34, -3, 2.6, 1.3], [52, -8, 3.6, 2.2], [40, -13, 4.5, 1.8], [44, 4, 5.4, 1.5], [60, 10, .9, 2.4], [70, 14, 2.2, 2.8], [64, 8, 3.1, 2.2], [36, -7, 5.9, 1.4], [58, -2, 4.0, 2.0], [66, 18, 5.0, 2.6]];
      spec.forEach(([d, y, a, s], i) => { const r = E.mulberry32(100 + i), pp = [];
        for (let k = 0; k < 7; k++){ const x = (k - 3)*1.1 + (r() - .5)*.6, rr = 1.3 + r()*.9 - Math.abs(k - 3)*.18; pp.push([SPL, [x, rr*.3 + r()*.3, (r() - .5)*1.2], 0, [rr, rr*.8, rr], (xx, yy, zz, nx, ny) => tmp.copy(bot).lerp(top, smooth(-.4, .6, ny)).clone()]); }
        const m = new THREE.Mesh(solid(pp), mat); m.scale.setScalar(s); root.add(m); clouds.push({ m, d, y, a, i }); });
    }
      return t => clouds.forEach(cl => { const a = cl.a + t*.012; cl.m.position.set(Math.sin(a)*cl.d, cl.y + .4*Math.sin(t*.2 + cl.i), Math.cos(a)*cl.d); cl.m.rotation.y = a; });
    }


    // one mesh per material, from everything baked so far
    function finish(){
    const MATS = {
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82 }),
      gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .32, metalness: .25 }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .08, metalness: .3, envMapIntensity: 1.1 }),
      lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .08, metalness: .3, envMapIntensity: 1.1, emissive: c('#ffc978'), emissiveIntensity: 0 }),
      lamp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .2, emissive: c('#ffd28a'), emissiveIntensity: 0 }),
    };
    for (const k in B) if (B[k].length){ const m = new THREE.Mesh(merge(B[k]), MATS[k]); m.castShadow = k !== 'glass' && k !== 'lit'; m.receiveShadow = true; root.add(m); }
    root.traverse(m => { if (m.isMesh && m.castShadow === false && m.material && !m.material.transparent) m.receiveShadow = true; });
      return MATS;
    }
    return { c, R, tmp, root, B, bake, parts, placeM, toWorld, group, IRON, WOOD, WOODL, TERRA, STONE, LEAF, LEAF2, BLOOMS, dyn, HW, RC, rrShape,
      island, win, door, balcony, awning, roofGable, house, lamp, planter, bench, strings, birds, clouds, finish };
  }


  // ---------- the market square ----------
  function market(ctx, o){
    const K = kit(ctx, 41), { c, R, tmp, root, bake, parts, placeM, toWorld, group, IRON, WOOD, WOODL, TERRA, STONE, LEAF, LEAF2, BLOOMS, dyn, HW, win, door, balcony, awning, house } = K;
    const ring = K.island();
    {
      // the top: grass all over, then the paved square (with a path to the front edge) and a stone kerb round it
      const top = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(top), new THREE.MeshStandardMaterial({ map: grassTex(R), roughness: .95 }));
      gm.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v/14; }); gm.rotation.x = -PI/2; gm.position.y = -.015; gm.receiveShadow = true; root.add(gm);
      const pv = new THREE.Shape(), X = 13.4, Zb = -13.4, Zf = 12.0, r = 4.2;   // shape y = -z
      pv.moveTo(-X + r, -Zf); pv.lineTo(-1.6, -Zf); pv.lineTo(-1.6, -HW); pv.lineTo(1.6, -HW); pv.lineTo(1.6, -Zf); pv.lineTo(X - r, -Zf);
      pv.quadraticCurveTo(X, -Zf, X, -Zf + r); pv.lineTo(X, -Zb - r); pv.quadraticCurveTo(X, -Zb, X - r, -Zb); pv.lineTo(-X + r, -Zb); pv.quadraticCurveTo(-X, -Zb, -X, -Zb - r); pv.lineTo(-X, -Zf + r); pv.quadraticCurveTo(-X, -Zf, -X + r, -Zf);
      const cb = cobbles(R), pg = new THREE.ShapeGeometry(pv, 16); pg.attributes.uv.array.forEach((v, i, a) => { a[i] = v/3.2; });
      const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: cb.map, bumpMap: cb.bump, bumpScale: .035, roughness: .85 })); pm.rotation.x = -PI/2; pm.receiveShadow = true; root.add(pm);
      const kerbPts = pv.getSpacedPoints(700).map(p => new THREE.Vector3(p.x, .05, -p.y));
      const kerb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(kerbPts, true, 'centripetal'), 700, .11, 6, true), new THREE.MeshStandardMaterial({ color: c('#b9ad9c'), roughness: .8 }));
      kerb.scale.y = .7; kerb.receiveShadow = kerb.castShadow = true; root.add(kerb);
      const ro = rosette(R), rm = new THREE.Mesh(new THREE.CircleGeometry(4.3, 72), new THREE.MeshStandardMaterial({ map: ro.map, bumpMap: ro.bump, bumpScale: .03, roughness: .85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      rm.rotation.x = -PI/2; rm.position.y = .002; rm.receiveShadow = true; root.add(rm);
      // front garden: bushes and flowers along the edge, either side of the path
      const gd = parts();
      for (let i = 0; i < 44; i++){ const side = i%2 ? 1 : -1, x = side*(2.2 + R()*10.5), z = 12.5 + R()*1.3, s = .25 + .3*R();
        if (Math.abs(x) > 9.0 && z > 12.9) continue;
        if (R() < .45) gd.body.push([SPL, [x, s*.6, z], 0, [s*1.3, s, s*1.2], (xx, y, zz, nx, ny) => tmp.copy(LEAF).lerp(LEAF2, .5 + .5*ny).clone()]);
        else for (let k = 0; k < 5; k++) gd.body.push([SPX, [x + (R() - .5)*.6, .12 + R()*.12, z + (R() - .5)*.5], 0, .06 + .03*R(), BLOOMS[Math.floor(R()*BLOOMS.length)]]); }
      for (let i = 0; i < 26; i++){ const a = R()*2*PI, x = Math.cos(a)*(HW - .5), z = Math.sin(a)*(HW - .5); if (z > 11 || Math.abs(x) < 12.6 && Math.abs(z) < 12.6) continue;
        const s = .35 + .35*R(); gd.body.push([SPL, [x, s*.6, z], 0, [s*1.3, s, s*1.2], (xx, y, zz, nx, ny) => tmp.copy(LEAF).lerp(LEAF2, .5 + .5*ny).clone()]); }
      bake(gd);
    }

    // ----- the bell tower (back left corner), with a clock and a bell -----
    let clock, bell;
    {
      const M = placeM(-11.0, -9.0), L = parts(), W = 3.2, D = 3.6, H = 11, brick = c('#d48f68'), quoin = c('#ecdcbf'), trim = c('#f1e4cb');
      L.body.push([rbox(W, H, D, .08), [0, H/2, -D/2], 0, 1, (x, y) => tmp.copy(brick).multiplyScalar(.82 + .18*smooth(0, 1.6, y)).clone()]);
      L.body.push([rbox(W + .1, .6, D + .1, .04), [0, .3, -D/2], 0, 1, c('#a39585')]);
      for (let k = 0; k < 16; k++){ const y = .9 + k*.62, dx = k%2 ? .3 : .5, dz = k%2 ? .5 : .3; for (const sx of [-1, 1]) for (const sz of [0, 1])
        L.body.push([rbox(dx, .26, dz, .03), [sx*(W/2 - dx/2 + .03), y, sz ? -D + dz/2 - .03 : -dz/2 + .03], 0, 1, quoin]); }
      for (const y of [3.6, 7.2]) L.body.push([rbox(W + .14, .16, D + .14, .04), [0, y, -D/2], 0, 1, trim]);
      win(L, 0, 5.0, .45, 1.0, { trim, arch: true });
      door(L, 0, 1.0, 2.4, { trim, door: c('#6d4a2f') });
      L.body.push([rbox(W + .3, .3, D + .3, .05), [0, H, -D/2], 0, 1, trim]);
      const pierH = 2.5;
      for (const sx of [-1, 1]) for (const sz of [0, 1]) L.body.push([rbox(.62, pierH, .62, .05), [sx*(W/2 - .31), H + .15 + pierH/2, -sz*(D - .62) - .31], 0, 1, brick]);
      for (const [ry, ox, oz, span] of [[0, 0, -.31, W], [0, 0, -D + .31, W], [PI/2, -W/2 + .31, -D/2, D], [PI/2, W/2 - .31, -D/2, D]])
        L.body.push([new THREE.TorusGeometry(span/2 - .62, .13, 8, 20, PI), [ox, H + .15 + pierH - (span/2 - .62) - .25, oz], [0, ry, 0], 1, quoin]);
      L.body.push([rbox(W + .4, .4, D + .4, .06), [0, H + .15 + pierH + .2, -D/2], 0, 1, trim]);
      const pyr = new THREE.ConeGeometry(2.55, 2.8, 4, 1).toNonIndexed(); pyr.computeVertexNormals();
      L.body.push([pyr, [0, H + .15 + pierH + .4 + 1.4, -D/2], [0, PI/4, 0], 1, c('#c05f3a')]);
      L.gloss.push([SPH, [0, H + pierH + 3.55, -D/2], 0, .16, c('#e8b33a')], [cyl(.03, .05, 6), [0, H + pierH + 3.95, -D/2], 0, [1, .7, 1], c('#e8b33a')]);
      // clock: a face in a stone ring, two hands
      const cy = 8.75, face = new THREE.CanvasTexture(canvas(512, 512, (g, S) => { const r = S/2;
        g.fillStyle = '#f6efdc'; g.beginPath(); g.arc(r, r, r - 4, 0, 2*PI); g.fill(); g.strokeStyle = '#3a3330'; g.lineWidth = 10; g.stroke();
        g.lineWidth = 3; g.beginPath(); g.arc(r, r, r - 46, 0, 2*PI); g.stroke();
        for (let k = 0; k < 60; k++){ const a = k/60*2*PI, l = k%5 ? 14 : 30; g.lineWidth = k%5 ? 3 : 8; g.beginPath(); g.moveTo(r + Math.sin(a)*(r - 18), r - Math.cos(a)*(r - 18)); g.lineTo(r + Math.sin(a)*(r - 18 - l), r - Math.cos(a)*(r - 18 - l)); g.stroke(); }
        g.fillStyle = '#3a3330'; g.font = `700 64px "Libre Caslon Text", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        ['XII', 'III', 'VI', 'IX'].forEach((n, k) => { const a = k*PI/2; g.fillText(n, r + Math.sin(a)*(r - 104), r - Math.cos(a)*(r - 104) + 4); }); }));
      face.encoding = THREE.sRGBEncoding; face.anisotropy = 8;
      L.body.push([cyl(.98, .98, 40), [0, cy, .06], [PI/2, 0, 0], [1, .12, 1], quoin]);
      const tg = group(M), fm = new THREE.Mesh(new THREE.CircleGeometry(.82, 48), new THREE.MeshStandardMaterial({ map: face, roughness: .6, emissive: c('#ffe2a6'), emissiveIntensity: 0, emissiveMap: face }));
      fm.position.set(0, cy, .125); tg.add(fm);
      const handM = new THREE.MeshStandardMaterial({ color: c('#2c2724'), roughness: .5, metalness: .3 });
      const hand = (len, wid) => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(wid, len, .025), handM); m.position.y = len/2 - .08; m.castShadow = true; g.add(m); g.position.set(0, cy, .15); tg.add(g); return g; };
      clock = { hour: hand(.48, .07), min: hand(.7, .045), face: fm };
      const pin = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), handM); pin.position.set(0, cy, .17); tg.add(pin);
      // the bell, hung from a beam in the belfry
      L.body.push([rbox(W - .7, .16, .16, .03), [0, H + .15 + pierH - .55, -D/2], 0, 1, WOOD]);
      bell = new THREE.Group(); bell.position.set(0, H + .15 + pierH - .65, -D/2); tg.add(bell);
      const bm = new THREE.Mesh(lathe([[0, 0], [.18, 0], [.26, -.12], [.3, -.42], [.42, -.72], [.44, -.78], [0, -.78]], 28), new THREE.MeshStandardMaterial({ color: c('#b88a3e'), roughness: .3, metalness: .7 }));
      bm.castShadow = true; bell.add(bm);
      bake(L, M);
    }

    // ----- houses round the square -----
    const H = [];
    const back = [   // façades on z = -9, facing +z (x = left edge .. right edge)
      { x0: -9.4, w: 3.0, floors: 4, color: '#e8a87c', shut: '#3f7f5a', boxes: .7 },
      { x0: -6.4, w: 3.1, floors: 3, color: '#f0cf6e', shut: '#3b6fb0', kind: 'bakery', sign: 'BAKERY', awn: ['#c8402f', '#f4efe2'], frame: '#7a2e22', signBg: '#8a3a26' },
      null,   // the town hall
      { x0: 3.3, w: 3.4, floors: 3, color: '#8fc9a8', shut: '#2f6f8a', kind: 'cafe', sign: 'CAFE', awn: ['#2f8a5a', '#f4efe2'], balcony: true },
      { x0: 6.7, w: 2.7, floors: 4, color: '#e59bb0', shut: '#3f7f5a', roof: 'flat', boxes: .8 },
      { x0: 9.4, w: 3.2, floors: 3, color: '#d8b48a', shut: '#8a5a3c' },
    ];
    for (const s of back) if (s) H.push(house(s, placeM(s.x0 + s.w/2, -9.0)));
    const left = [   // façades on x = -9.4, facing +x (z = back edge .. front edge)
      { z0: -9.0, w: 4.8, floors: 3, color: '#8ab8dc', shut: '#2f5b8a', balcony: true, laundry: true },
      { z0: -4.2, w: 5.2, floors: 2, color: '#e3b778', shut: '#3f7f5a', kind: 'shop', sign: 'TOYS', awn: ['#3b6fb0', '#f4efe2'], frame: '#24456e', signBg: '#2a4f80', archTop: true },
      { z0: 1.0, w: 5.0, floors: 3, color: '#b9a2dc', shut: '#4b3f7a', boxes: .7 },
    ];
    for (const s of left) H.push(Object.assign(house(s, placeM(-9.4, s.z0 + s.w/2, PI/2)), { s, M: placeM(-9.4, s.z0 + s.w/2, PI/2) }));
    const right = [   // façades on x = 9.4, facing -x (z = back edge .. front edge); the bank is built below
      null,
      { z0: -3.0, w: 4.8, floors: 3, color: '#e0b05a', shut: '#3f7f5a', balcony: true, laundry: true, archTop: true },
      { z0: 1.8, w: 4.2, floors: 2, color: '#e8907a', shut: '#2f6f8a', boxes: .8 },
    ];
    for (const s of right) if (s) H.push(Object.assign(house(s, placeM(9.4, s.z0 + s.w/2, -PI/2)), { s, M: placeM(9.4, s.z0 + s.w/2, -PI/2) }));
    // corner houses at the front ends of the side rows (their gables face the visitor)
    house({ w: 3.2, d: 3.4, floors: 2, color: '#f2b880', shut: '#3b6fb0', boxes: .9 }, placeM(-11.0, 9.4, 0));
    house({ w: 3.2, d: 3.4, floors: 2, color: '#a7d0c0', shut: '#8a5a3c', boxes: .9 }, placeM(11.0, 9.4, 0));

    // ----- the town hall (back row, centre): arcade, balcony, flag -----
    let flag, balconySpot, hallDoor;
    {
      const M = placeM(0, -9.0), L = parts(), W = 6.6, D = 3.6, G0 = 3.5, FH = 3.0, Fl = 3, Ht = G0 + (Fl - 1)*FH;
      const wall = c('#df9d7c'), trim = c('#f3e7d0'), dark = c('#4a3833');
      L.body.push([rbox(W, Ht, D, .1), [0, Ht/2, -D/2], 0, 1, (x, y) => tmp.copy(wall).multiplyScalar(.82 + .18*smooth(0, 1.6, y)).clone()]);
      for (let k = 0; k < 10; k++) L.body.push([BOX, [0, .45 + k*.3, .012], 0, [W - .02, .03, .03], wall.clone().multiplyScalar(.8)]);   // rusticated ground floor
      L.body.push([rbox(W + .08, .45, D + .08, .04), [0, .22, -D/2], 0, 1, c('#a39585')]);
      for (const x of [-2.1, 0, 2.1]){ L.body.push([arch(1.62, 2.75, .06), [x, .45, .03], 0, 1, trim], [arch(1.4, 2.65, .04), [x, .45, .062], 0, 1, dark]); }
      for (const x of [-3.15, -1.05, 1.05, 3.15]) L.body.push([rbox(.3, 3.0, .14, .03), [x, 1.95, .07], 0, 1, trim]);
      door(L, 0, 1.0, 2.2, { trim, door: c('#6d4a2f') });
      L.body.push([rbox(W + .12, .2, .2, .04), [0, G0 - .05, .04], 0, 1, trim], [rbox(W + .12, .16, .2, .04), [0, G0 + FH - .05, .04], 0, 1, trim]);
      for (const x of [-2.1, 0, 2.1]){ win(L, x, G0 + 1.3 - (x ? 0 : .15), .9, x ? 1.6 : 1.95, { trim, arch: true, cap: true, lit: true, shut: x ? c('#3f7f5a') : null });
        win(L, x, G0 + FH + 1.25, .8, 1.15, { trim, shut: c('#3f7f5a'), lit: x !== 0 }); }
      balcony(L, 0, G0 - .02, 2.6);
      L.body.push([rbox(W + .4, .3, D + .4, .06), [0, Ht + .05, -D/2], 0, 1, trim]);
      // attic with a pediment and the flag
      L.body.push([rbox(W + .1, .6, .2, .04), [0, Ht + .5, .0], 0, 1, wall], [rbox(W + .24, .1, .3, .03), [0, Ht + .82, .0], 0, 1, trim]);
      const ped = new THREE.Shape(); ped.moveTo(-1.6, 0); ped.lineTo(1.6, 0); ped.lineTo(0, .9); ped.lineTo(-1.6, 0);
      L.body.push([new THREE.ExtrudeGeometry(ped, { depth: .3, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 2 }), [0, Ht + .86, -.15], 0, 1, trim]);
      L.gloss.push([cyl(.035, .045, 8), [0, Ht + 2.6, -.4], 0, [1, 3.4, 1], c('#d8d2c4')], [SPH, [0, Ht + 4.33, -.4], 0, .08, c('#e8b33a')]);
      for (const sx of [-1, 1]){ L.gloss.push([BOX, [sx*.95, 2.6, .16], 0, [.05, .3, .14], IRON]); L.lamp.push([cyl(.12, .09, 6), [sx*.95, 2.35, .3], 0, [1, .32, 1], c('#ffe7b0')]); L.gloss.push([cyl(.02, .14, 6), [sx*.95, 2.56, .3], 0, [1, .1, 1], IRON]); }
      bake(L, M); const g = group(M);
      const sg = signMesh('TOWN HALL', 2.6, .5, { bg: '#2f5b48', edge: '#203f32' }); sg.position.set(0, 3.12, .09); g.add(sg);
      // the flag: the town's own (teal with a gold coin), waving
      const ft = tex(canvas(512, 320, (gg, w, h) => { gg.fillStyle = '#2f8f9d'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#f4ead2'; gg.fillRect(0, h*.08, w, h*.06); gg.fillRect(0, h*.86, w, h*.06);
        gg.drawImage(G.coin(256), w/2 - 90, h/2 - 90, 180, 180); }));
      const fg = new THREE.PlaneGeometry(1.5, .95, 14, 6); fg.translate(.75, 0, 0);
      flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ft, roughness: .8, side: THREE.DoubleSide })); flag.castShadow = true;
      flag.position.set(.04, Ht + 3.75, -.4); flag.userData.base = Float32Array.from(fg.attributes.position.array); g.add(flag);
      balconySpot = toWorld(M, 0, G0 + .05, .35).toArray(); hallDoor = toWorld(M, 0, 0, .9).toArray();
    }

    // ----- the bank (right row, back): steps, columns, pediment, BANK -----
    let bankDoor;
    {
      const M = placeM(9.4, -6.0, -PI/2), L = parts(), W = 6.0, D = 3.2, Ht = 6.6, stone = c('#dccdab'), light = c('#f0e7d3');
      L.body.push([rbox(W, Ht, D, .08), [0, Ht/2, -D/2], 0, 1, (x, y) => tmp.copy(stone).multiplyScalar(.84 + .16*smooth(0, 1.6, y)).clone()]);
      for (let k = 0; k < 18; k++) L.body.push([BOX, [0, .55 + k*.33, .012], 0, [W - .02, .03, .03], stone.clone().multiplyScalar(.82)]);
      L.body.push([rbox(5.0, .45, 1.5, .03), [0, .225, .75], 0, 1, light], [rbox(4.4, .15, .6, .03), [0, .075, 1.8], 0, 1, light], [rbox(4.4, .3, .3, .03), [0, .15, 1.65], 0, 1, light]);
      L.body.push([rbox(1.5, 2.9, .08, .03), [0, 1.9, .04], 0, 1, c('#4a3326')], [rbox(1.3, 2.7, .06, .02), [0, 1.85, .07], 0, 1, c('#6d4a2f')], [BOX, [0, 1.85, .1], 0, [.03, 2.7, .02], c('#4a3326')]);
      L.gloss.push([SPL, [-.12, 1.7, .12], 0, .04, c('#d9a93a')], [SPL, [.12, 1.7, .12], 0, .04, c('#d9a93a')]);
      for (const sx of [-1, 1]) win(L, sx*1.9, 2.0, .7, 1.7, { trim: light, lit: true, cap: true });
      for (const sx of [-1, 0, 1]) win(L, sx*1.9, 5.1, .7, 1.0, { trim: light, lit: sx !== 0 });
      const col = lathe([[0, 0], [.32, 0], [.32, .1], [.27, .14], [.25, .2], [.22, 3.5], [.2, 3.62], [.3, 3.7], [.34, 3.82], [.34, 3.9], [0, 3.9]], 20);
      for (const x of [-1.85, -.62, .62, 1.85]) L.body.push([col, [x, .45, 1.05], 0, 1, (xx, y, zz, nx, ny) => tmp.copy(light).multiplyScalar(.9 + .1*Math.abs(ny)).clone()]);
      L.body.push([rbox(4.9, .55, 1.4, .04), [0, 4.62, .6], 0, 1, light]);
      const ped = new THREE.Shape(); ped.moveTo(-2.5, 0); ped.lineTo(2.5, 0); ped.lineTo(0, .95); ped.lineTo(-2.5, 0);
      L.body.push([new THREE.ExtrudeGeometry(ped, { depth: 1.2, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 2 }), [0, 4.9, -.05], 0, 1, light]);
      L.body.push([rbox(W + .3, .25, D + .3, .05), [0, Ht + .05, -D/2], 0, 1, light]);
      for (let k = 0; k < 15; k++) L.body.push([lathe([[0, 0], [.07, 0], [.09, .1], [.05, .22], [.07, .34], [.08, .38], [0, .38]], 10), [-W/2 + .3 + k*(W - .6)/14, Ht + .18, .02], 0, 1, light]);
      L.body.push([rbox(W + .1, .08, .2, .02), [0, Ht + .6, .02], 0, 1, light]);
      bake(L, M); const g = group(M);
      const word = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .44), new THREE.MeshStandardMaterial({ map: tex(canvas(1024, 205, (gg, w, h) => { gg.font = `800 ${h*.78}px "Libre Caslon Text", Georgia, serif`; gg.textAlign = 'center'; gg.textBaseline = 'middle';
        gg.fillStyle = '#7a5a1c'; gg.fillText('B A N K', w/2 + 3, h*.55 + 4); gg.fillStyle = '#e8b33a'; gg.fillText('B A N K', w/2, h*.55); })), roughness: .35, metalness: .5, alphaTest: .5 }));
      word.position.set(0, 4.62, 1.31); g.add(word);
      bankDoor = toWorld(M, 0, 0, 2.5).toArray();
    }

    // ----- the fountain -----
    let waterFx;
    {
      const L = parts(), st = c('#d6cbb8'), st2 = c('#c2b6a2');
      const FS = .8, fg = new THREE.Group(); fg.scale.setScalar(FS); root.add(fg);
      L.body.push([lathe([[0, .2], [2.1, .2], [2.1, .6], [2.16, .64], [2.4, .66], [2.48, .6], [2.42, .52], [2.36, .5], [2.36, .06], [2.44, 0], [0, 0]], 64), [0, 0, 0], 0, 1, (x, y, z, nx, ny) => tmp.copy(st2).lerp(st, .5 + .5*ny).clone()]);
      L.body.push([lathe([[0, .2], [.42, .2], [.42, .3], [.3, .4], [.26, .9], [.3, 1.08], [.5, 1.18], [.92, 1.28], [.98, 1.38], [.95, 1.45], [.86, 1.42], [.2, 1.38], [.15, 1.6], [.19, 1.75], [.36, 1.86], [.38, 1.92], [.32, 1.95], [.12, 1.95], [.1, 2.05], [0, 2.05]], 40), [0, 0, 0], 0, 1, (x, y, z, nx, ny) => tmp.copy(st2).lerp(st, .5 + .5*ny).clone()]);
      L.gloss.push([SPH, [0, 2.17, 0], 0, .13, c('#e8b33a')]);
      for (let k = 0; k < 4; k++){ const a = k*PI/2 + PI/4; L.body.push([SPH, [Math.cos(a)*.36, .7, Math.sin(a)*.36], 0, [.12, .14, .12], st]); }
      bake(L, new THREE.Matrix4().makeScale(FS, FS, FS));
      const water = new THREE.MeshStandardMaterial({ color: c('#5fb3e0'), roughness: .06, metalness: .1, transparent: true, opacity: .9, envMapIntensity: 1.2 });
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.11, 64), water); pool.rotation.x = -PI/2; pool.position.y = .5; fg.add(pool);
      const bowl = new THREE.Mesh(new THREE.CircleGeometry(.88, 40), water); bowl.rotation.x = -PI/2; bowl.position.y = 1.41; fg.add(bowl);
      const top = new THREE.Mesh(new THREE.CircleGeometry(.33, 24), water); top.rotation.x = -PI/2; top.position.y = 1.9; fg.add(top);
      const streak = tex(canvas(256, 256, (g, w, h) => { const r = E.mulberry32(3); g.clearRect(0, 0, w, h);
        for (let i = 0; i < 70; i++){ const x = r()*w, y = r()*h, l = 30 + r()*90; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, `rgba(235,248,255,${.4 + r()*.5})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(x, y, 3 + r()*5, l); if (y + l > h){ g.fillRect(x, y - h, 3 + r()*5, l); } } }), [6, 1]);
      const curtainM = new THREE.MeshStandardMaterial({ map: streak, color: c('#d8f0ff'), transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide, roughness: .1 });
      const curtain = new THREE.Mesh(new THREE.CylinderGeometry(.97, 1.12, .92, 48, 1, true), curtainM); curtain.position.y = .95; fg.add(curtain);
      const streak2 = streak.clone(); streak2.needsUpdate = true; streak2.repeat.set(3, 1);
      const smallM = curtainM.clone(); smallM.map = streak2;
      const small = new THREE.Mesh(new THREE.CylinderGeometry(.34, .42, .5, 32, 1, true), smallM); small.position.y = 1.66; fg.add(small);
      const rings = []; for (let k = 0; k < 4; k++){ const m = new THREE.Mesh(new THREE.RingGeometry(.96, 1.0, 64), new THREE.MeshBasicMaterial({ color: c('#eaf7ff'), transparent: true, depthWrite: false }));
        m.rotation.x = -PI/2; m.position.y = .505; fg.add(m); rings.push(m); }
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(.02, .05, .5, 8, 1, true), curtainM); jet.position.y = 2.35; fg.add(jet);
      waterFx = (t, flow) => { streak.offset.y = t*1.6; streak2.offset.y = t*1.2; curtain.visible = small.visible = jet.visible = flow > .02; curtain.material.opacity = .85*flow;
        rings.forEach((m, k) => { const f = ((t*.45 + k/4)%1); m.scale.setScalar(1 + f*1.05); m.material.opacity = .55*(1 - f)*flow; });
        jet.scale.y = .4 + .6*flow + .05*Math.sin(t*9); jet.position.y = 2.1 + .25*jet.scale.y; };
    }

    // ----- market stalls -----
    const GOODS = {
      fruit: { name: 'FRUIT', price: '2{c}', awn: ['#e8414f', '#f4efe2'] },
      melons: { name: 'MELONS', price: '5{c}', awn: ['#3f9a4a', '#f4efe2'] },
      bread: { name: 'BREAD', price: '3{c}', awn: ['#e09a2f', '#f4efe2'] },
      fish: { name: 'FISH', price: '6{c}', awn: ['#2f6fb3', '#f4efe2'] },
      cheese: { name: 'CHEESE', price: '4{c}', awn: ['#e8c43a', '#f4efe2'] },
      flowers: { name: 'FLOWERS', price: '1{c}', awn: ['#e46aa0', '#f4efe2'] },
    };
    const PLACES = [[-6.7, -4.6, 1.05], [-6.9, 1.2, 1.35], [-2.5, -6.3, .22], [2.5, -6.3, -.22], [6.9, 1.2, -1.35], [6.7, -4.6, -1.05]];   // x, z, yaw
    const stallsIn = o.stalls ?? ['fruit', 'melons', 'bread', 'fish', 'cheese', 'flowers'].map(g => ({ goods: g }));
    const melonGeo = (() => { const g = SPH.clone(), p = g.attributes.position, cols = [], a = c('#2f7a35'), b = c('#8fca6a');
      for (let i = 0; i < p.count; i++){ const ang = Math.atan2(p.getY(i), p.getX(i)), k = .5 + .5*Math.sin(ang*9 + 1.5*Math.sin(p.getZ(i)*4)); tmp.copy(a).lerp(b, smooth(.55, .8, k)); cols.push(tmp.r, tmp.g, tmp.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); return g; })();
    const fishGeo = (() => { const pp = parts(), back = c('#4f6a86'), side = c('#b8c6d4');
      pp.body.push([SPH, [0, 0, 0], 0, [.035, .05, .17], (x, y) => tmp.copy(side).lerp(back, smooth(-.005, .04, y)).clone()]);
      pp.body.push([cyl(0, .06, 4), [0, 0, -.2], [-PI/2, 0, 0], [.5, .08, 1], back], [SPH, [.028, .015, .12], 0, .012, c('#101418')], [SPH, [-.028, .015, .12], 0, .012, c('#101418')]);
      const g = solid(pp.body); return g; })();
    const stalls = [], boards = [];
    const stall = (i) => {
      const s = Object.assign({}, GOODS[stallsIn[i].goods], stallsIn[i]), [x, z, yaw] = PLACES[i], sd = [-1, -1, 1, -1, 1, 1][i], M = placeM(x, z, yaw), L = parts(), wood = WOOD, light = WOODL;
      // counter: planks in front, a top, posts and the awning frame
      L.body.push([rbox(2.6, .08, 1.15, .03), [0, .95, -.55], 0, 1, light]);
      for (let k = 0; k < 9; k++) L.body.push([rbox(.27, .9, .05, .015), [-1.2 + k*.3, .46, -.02], 0, 1, wood.clone().multiplyScalar(.88 + .2*R())]);
      for (const sx of [-1, 1]) L.body.push([rbox(.05, .9, 1.1, .015), [sx*1.27, .46, -.56], 0, 1, wood]);
      for (const sx of [-1, 1]){ L.body.push([cyl(.045, .05, 10), [sx*1.33, 1.47, .3], 0, [1, 2.95, 1], wood], [cyl(.045, .05, 10), [sx*1.33, 1.37, -1.35], 0, [1, 2.75, 1], wood]);
        L.body.push([rbox(.07, .07, 1.85, .02), [sx*1.33, 2.4, -.5], [.18, 0, 0], 1, wood]); }
      // goods on the counter
      const top = .99, tilt = .32;
      const crate = (cx, cz, w, d, h, fill) => {   // a slatted crate tilted to the customer, filled
        const at = (ox, oy, oz) => [cx + ox, top + .12 + oy*Math.cos(tilt) - oz*Math.sin(tilt), cz + oy*Math.sin(tilt) + oz*Math.cos(tilt)];
        L.body.push([BOX, at(0, -.1, 0), [tilt, 0, 0], [w, .02, d], wood]);
        for (const sz of [-1, 1]) for (const k of [0, 1]) L.body.push([BOX, at(0, -.06 + k*.09, sz*d/2), [tilt, 0, 0], [w, .06, .02], light]);
        for (const sx of [-1, 1]) for (const k of [0, 1]) L.body.push([BOX, at(sx*w/2, -.06 + k*.09, 0), [tilt, 0, 0], [.02, .06, d], light]);
        fill(at, w, d); };
      const heap = (at, w, d, r, item) => { const nx = Math.floor(w/(2*r)), nz = Math.floor(d/(2*r));
        for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < nx - iy; ix++) for (let iz = 0; iz < nz - iy; iz++){
          const px = -w/2 + r*(1 + iy) + ix*2*r + (R() - .5)*r*.25, pz = -d/2 + r*(1 + iy) + iz*2*r + (R() - .5)*r*.25;
          item(at(px, -.08 + r + iy*r*1.45, pz), r); } };
      const ball = (cols, sy = 1) => (p, r) => L.body.push([SPL, p, [R()*3, R()*3, 0], [r, r*sy, r], cols[Math.floor(R()*cols.length)].clone().multiplyScalar(.9 + .2*R())]);
      const fl = (cols) => (p, r) => { L.body.push([cyl(.008, .008, 5), [p[0], p[1] + .12, p[2]], [(R() - .5)*.3, 0, (R() - .5)*.3], [1, .32, 1], c('#4f8a3a')]); L.body.push([SPX, [p[0] + (R() - .5)*.04, p[1] + .3, p[2] + (R() - .5)*.04], 0, [.05, .04, .05], cols[Math.floor(R()*cols.length)]]); };
      if (s.goods === 'fruit'){
        crate(-.82, -.45, .72, .55, .2, (at, w, d) => heap(at, w, d, .052, ball([c('#d8262f'), c('#e83b2f'), c('#b81e2a'), c('#9ccf3c')])));
        crate(0, -.45, .72, .55, .2, (at, w, d) => heap(at, w, d, .055, ball([c('#ff8a1f'), c('#f7931e')])));
        crate(.82, -.45, .72, .55, .2, (at, w, d) => heap(at, w, d, .048, ball([c('#ffe03a'), c('#f6d02a')], 1.25)));
        L.body.push([lathe([[0, 0], [.2, 0], [.26, .22], [.27, .24], [0, .24]], 16), [-sd*1.05, 0, .55], 0, 1, c('#a87a45')]);   // a basket of apples on the ground
        for (let k = 0; k < 7; k++){ const a = k*.9; L.body.push([SPL, [-sd*1.05 + Math.cos(a)*.12*(k ? 1 : 0), .27 + (k ? 0 : .06), .55 + Math.sin(a)*.12*(k ? 1 : 0)], [k, k, 0], .065, c(k%3 ? '#d8262f' : '#9ccf3c')]); }
      } else if (s.goods === 'melons'){
        for (let k = 0; k < 7; k++){ const px = -1.0 + (k%4)*.62 + (k > 3 ? .31 : 0), py = top + .17 + (k > 3 ? .24 : 0), pz = -.5 + (k > 3 ? -.05 : 0);
          L.body.push([melonGeo, [px, py, pz], [0, .3*R(), .2*R()], [.26, .18, .18], null]); }
        for (const sx of [-1, 1]){ L.body.push([SPH, [sx*.95, top + .05, -.1], [0, 0, 0], [.19, .14, .14], c('#2f7a35')]); }
        const slice = new THREE.CylinderGeometry(.2, .2, .06, 16, 1, false, 0, PI);
        for (let k = 0; k < 4; k++) L.body.push([slice, [-.6 + k*.4, top + .14, -.05], [PI/2 - .3, PI/2, 0], 1, (x, y, z, nx, ny, nz) => Math.abs(nz) > .7 || Math.abs(nx) > .7 ? c('#e8414f') : c('#3f9a4a')]);
        for (let k = 0; k < 5; k++) L.body.push([melonGeo, [-1.9 + k*.24, .17, .9 - (k%2)*.3], [0, R()*3, 0], [.25, .17, .17], null]);
      } else if (s.goods === 'bread'){
        crate(-.82, -.45, .72, .55, .2, (at, w, d) => { for (let k = 0; k < 6; k++){ const p = at(-.22 + (k%3)*.22, .04, -.12 + Math.floor(k/3)*.24);
          L.body.push([SPH, p, [0, .2*(R() - .5), 0], [.1, .065, .16], c('#c98a40')]); for (let j = -1; j <= 1; j++) L.body.push([SPH, [p[0] + j*.04, p[1] + .055, p[2] + j*.05], [0, .6, 0], [.015, .01, .05], c('#f0d39a')]); } });
        for (let k = 0; k < 5; k++){ const p = [-.1 + (k%3)*.22 - .1, top + .1, -.55 + Math.floor(k/3)*.28]; L.body.push([SPH, p, 0, [.11, .08, .11], c('#b8742f')], [BOX, [p[0], p[1] + .07, p[2]], [0, .78, 0], [.14, .012, .025], c('#f0d39a')], [BOX, [p[0], p[1] + .07, p[2]], [0, -.78, 0], [.14, .012, .025], c('#f0d39a')]); }
        L.body.push([lathe([[0, 0], [.18, 0], [.22, .3], [.23, .32], [0, .32]], 16), [.85, top, -.55], 0, 1, c('#a87a45')]);
        for (let k = 0; k < 6; k++){ const a = k*1.05; L.body.push([cyl(.03, .035, 8), [.85 + Math.cos(a)*.08, top + .45, -.55 + Math.sin(a)*.08], [Math.sin(a)*.18, 0, -Math.cos(a)*.18], [1, .75, 1], c('#d39a4f')]); }
        for (let k = 0; k < 4; k++) L.body.push([new THREE.TorusGeometry(.07, .035, 8, 12, PI*1.25), [.25 + k*.16, top + .05, -.15], [-PI/2, 0, 0], 1, c('#d9963a')]);
      } else if (s.goods === 'fish'){
        L.body.push([rbox(2.3, .1, .9, .04), [0, top + .05, -.5], [.18, 0, 0], 1, c('#e8f2f8')]);
        for (let k = 0; k < 60; k++) L.body.push([SPX, [-1.1 + R()*2.2, top + .1 + .04*R(), -.9 + R()*.8], 0, [.03 + .02*R(), .02, .03], c('#ffffff')]);
        for (let k = 0; k < 10; k++){ const px = -.95 + (k%5)*.47, pz = -.72 + Math.floor(k/5)*.38; L.body.push([fishGeo, [px, top + .16 + (pz + .9)*.17, pz], [0, PI/2 + (R() - .5)*.3, PI/2], 1, null]); }
        for (let k = 0; k < 3; k++) L.body.push([SPL, [-.4 + k*.4, top + .16, -.05], 0, [.045, .045, .06], c('#ffe03a')]);
      } else if (s.goods === 'cheese'){
        const wheel = cyl(.2, .2, 24);
        for (let k = 0; k < 3; k++) for (let j = 0; j < 2 - (k%2); j++) L.body.push([wheel, [-.8 + k*.8, top + .07 + j*.13, -.5], [0, R(), 0], [1, .12, 1], (x, y, z, nx, ny) => Math.abs(ny) > .5 ? c('#f6d77a') : c('#e3a43a')]);
        const wedge = new THREE.CylinderGeometry(.2, .2, .12, 12, 1, false, 0, 1.1);
        for (let k = 0; k < 4; k++) L.body.push([wedge, [-.6 + k*.4, top + .07, -.08], [0, -.55 + PI, 0], 1, c('#f2c14e')]);
        for (let k = 0; k < 3; k++) L.body.push([SPH, [.95, 1.9 - k*.0, -.9 + k*.25], 0, [.06, .22, .06], c('#a8462f')]);
      } else if (s.goods === 'flowers'){
        const bucket = lathe([[0, 0], [.13, 0], [.17, .3], [.18, .3], [.17, .31], [0, .31]], 16), sets = [[c('#e8414f')], [c('#ff8fb1')], [c('#ffd23f')], [c('#ffffff')], [c('#b07ce8')], [c('#ff7a3d')]];
        for (let k = 0; k < 6; k++){ const onTop = k < 3, px = onTop ? -.8 + k*.8 : -2.05 + (k - 3)*.0, pz = onTop ? -.5 : .2 + (k - 3)*.42, py = onTop ? top : 0;
          L.gloss.push([bucket, [px, py, pz], 0, 1, c('#9fb3bf')]);
          for (let j = 0; j < 9; j++){ const a = j*2.4, rr = .05 + .06*(j%3); const p = [px + Math.cos(a)*rr, py + .3, pz + Math.sin(a)*rr]; fl(sets[k])(p); } }
      }
      // the stall's name over the awning; the price board on an easel at the front right
      bake(L, M); const g = group(M);
      const aw = awning(2.9, 1.8, .33, ...s.awn); aw.position.set(0, 2.6, -1.4); g.add(aw);
      const sg = signMesh(s.name, 1.6, .44, { bg: '#7a4b25' }); sg.position.set(0, 2.66, .385); g.add(sg);
      const back = new THREE.Mesh(rbox(1.66, .5, .05, .02), new THREE.MeshStandardMaterial({ color: c('#4a2e18'), roughness: .8 })); back.position.set(0, 2.66, .355); back.castShadow = true; g.add(back);
      const cv = canvas(512, 640); drawChalk(cv, s.name, s.price); const ct = tex(cv);
      const easel = new THREE.Group(); easel.position.set(sd*1.6, 0, .5); easel.rotation.y = sd*.35; g.add(easel);   // on the side that faces the square's open front
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(.72, .9), new THREE.MeshStandardMaterial({ map: ct, roughness: .9, alphaTest: .5 })); bd.position.set(0, .95, .05); bd.rotation.x = -.14; bd.castShadow = true; easel.add(bd);
      const em = new THREE.MeshStandardMaterial({ color: c('#7a4b25'), roughness: .8 });
      for (const sx of [-1, 1]){ const leg = new THREE.Mesh(new THREE.BoxGeometry(.04, 1.5, .03), em); leg.position.set(sx*.3, .72, -.02); leg.rotation.x = -.14; leg.castShadow = true; easel.add(leg); }
      const lb = new THREE.Mesh(new THREE.BoxGeometry(.04, 1.45, .03), em); lb.position.set(0, .7, -.22); lb.rotation.x = .2; easel.add(lb);
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(.7, .03, .07), em); shelf.position.set(0, .49, .1); easel.add(shelf);
      boards.push({ cv, tex: ct, name: s.name, price: s.price });
      const W = (lx, ly, lz) => toWorld(M, lx, ly, lz);
      stalls.push({ goods: s.goods, name: s.name, at: [W(0, 0, 1.25).x, W(0, 0, 1.25).z], seller: [W(0, 0, -1.75).x, W(0, 0, -1.75).z], yaw, view: yaw + PI + sd*.55, board: W(sd*1.6, .95, .55).toArray(), sign: W(0, 2.66, .38).toArray() });
    };
    for (let i = 0; i < 6; i++) stall(i);

    // ----- lamps, planters, benches -----
    {
      const L = parts();
      for (const [x, z] of [[-7.2, 7.4], [7.2, 7.4], [-7.6, -7.6], [7.6, -7.6], [-2.6, 9.8], [2.6, 9.8]]) K.lamp(L, x, z);
      for (const [x, z, s] of [[-8.6, 10.6, 1.2], [8.6, 10.6, 1.2], [-5.0, 11.2, 1], [5.0, 11.2, 1], [-8.5, -1.6, .9], [8.5, 3.9, .9]]) K.planter(L, x, z, s);
      K.bench(-8.75, 4.6, PI/2); K.bench(8.75, 5.0, -PI/2);
      bake(L);
    }

    // ----- strings over the square: bunting, laundry (one dynamic mesh) -----
    const lines = [];
    const addLine = (a, b, sag, items) => lines.push({ a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), sag, items });
    const flagCols = ['#e8414f', '#ffd23f', '#3b8fe0', '#4fbf6a', '#ff8fb1', '#ffffff', '#ff7a3d', '#b07ce8'];
    const bunting = n => [...Array(n)].map((_, k) => ({ shape: 'tri', w: .34, h: .42, col: flagCols[k%flagCols.length] }));
    addLine([-9.35, 6.3, -6.2], [9.35, 6.3, -6.2], 1.0, bunting(44));
    addLine([-9.35, 6.0, 3.6], [9.35, 6.0, 3.6], 1.1, bunting(44));
    addLine([-9.45, 8.2, -8.95], [9.35, 6.2, 0.2], 1.3, bunting(50));
    addLine([8.9, 7.0, -8.95], [-9.35, 5.9, 0.0], 1.2, bunting(50));
    for (const h of H) if (h.s && h.s.laundry){ const a = toWorld(h.M, -h.W/2 + .5, h.G0 + h.FH + 1.75, .45), b = toWorld(h.M, h.W/2 - .5, h.G0 + h.FH + 1.75, .45);
      const kinds = [['#ffffff', .5, .7], ['#3b8fe0', .42, .5], ['#e8414f', .22, .3], ['#ffd23f', .5, .6], ['#4fbf6a', .2, .28], ['#ff8fb1', .45, .55], ['#ffffff', .6, .8]];
      addLine(a.toArray(), b.toArray(), .25, kinds.map(([col, w, hh]) => ({ shape: 'rect', w, h: hh, col }))); }
    const updateStrings = K.strings(lines);
    const updatePigeons = K.birds([[1.8, 4.2], [2.6, 5.0], [3.3, 4.0], [.8, 5.6], [-1.6, 4.9], [-2.5, 5.9], [4.1, 5.4], [-.4, 4.0]]);
    const updateClouds = K.clouds();
    const MATS = K.finish();


    const spots = {
      center: [0, 3.5], fountain: { at: [0, 0], r: 2.0 }, stalls, balcony: balconySpot, hallDoor: [hallDoor[0], hallDoor[2]], bankDoor: [bankDoor[0], bankDoor[2]],
      bakeryDoor: [-4.4, -8.0], cafe: [5.0, -7.9], clock: [-11.0, 8.75, -8.85], benches: [[-8.75, 4.6], [8.75, 5.0]],
      ins: { front: [0, 14], left: [-9.0, 9.5], right: [9.0, 9.5] },
    };
    const shown = boards.map(b => b.price);
    return {
      object: root, spots, ground: () => 0, water: null,
      update(t, st = {}){
        const wind = st.wind ?? .4, night = st.night ?? 0;
        updateStrings(t, wind);
        { const fp = flag.geometry.attributes.position, b = flag.userData.base;   // the flag ripples along its length
          for (let i = 0; i < fp.count; i++){ const x = b[i*3], y = b[i*3 + 1]; fp.setXYZ(i, x - .04*x*wind, y - .12*x*(1 - wind), (.05 + .1*wind)*x*Math.sin(x*4.2 - t*(4 + 3*wind) + y*1.2)); }
          fp.needsUpdate = true; flag.geometry.computeVertexNormals(); }
        waterFx(t, st.water ?? 1);
        updatePigeons(t, st.scatter ?? 0);
        updateClouds(t);
        const hrs = st.clock ?? (10 + 10/60 + t/3600);
        clock.min.rotation.z = -2*PI*(hrs%1); clock.hour.rotation.z = -2*PI*((hrs%12)/12);
        bell.rotation.x = (st.bell ?? 0)*.55*Math.sin(t*3.2);
        MATS.lit.emissiveIntensity = 1.6*night; MATS.lamp.emissiveIntensity = 3.2*night; clock.face.material.emissiveIntensity = .5*night;
        if (st.prices) st.prices.forEach((p, i) => { if (p != null && i < boards.length && p !== shown[i]){ shown[i] = p; drawChalk(boards[i].cv, boards[i].name, p); boards[i].tex.needsUpdate = true; } });
        for (const f of dyn) f(t);
      },
    };
  }
  // ---------- the beach and the harbour ----------
  // a promenade along the back (hotel, ice cream, harbour office, fish market, warehouse), a sandy beach on the left
  // running into a translucent sea, a stone quay and pier on the right with a fishing boat, a wooden jetty with a
  // rowing boat, a lighthouse on a rocky islet at the front left, a sailing boat out on the water
  function harbor(ctx, o){
    const K = kit(ctx, 77), { c, R, tmp, root, bake, parts, placeM, toWorld, group, IRON, WOOD, WOODL, TERRA, STONE, LEAF, LEAF2, BLOOMS, dyn, HW, win, door, awning, house } = K;
    const WL = -.3, QZ = -4.6, QX = 3.6, DEEP = -1.75, ISL = [-9.6, 9.4], JX = -5.6, JZ = [-.6, 9.6], JY = .32, PX = 8.1, PZ = 10.2, PY = .1;
    const bump = (x, z, cx, cz, r) => { const d = Math.hypot(x - cx, z - cz)/r; return d < 1 ? .5 + .5*Math.cos(PI*d) : 0; };
    // the ground: flat behind the quay line, the beach sloping into the sea, the harbour basin deep, the islet
    const H = (x, z) => {
      if (z <= QZ) return 0;
      const beach = .03 + (DEEP - .03)*smooth(-1.8, 8.5, z - .9*Math.sin(x*.3 + .5)) + .28*bump(x, z, -8.2, -3.3, 2.3) + .2*bump(x, z, -2.4, -3.6, 1.9) + .16*bump(x, z, 1.4, -3.3, 1.7);
      const harb = smooth(QX - 1.2, QX, x), h = beach*(1 - harb) + DEEP*harb;
      return Math.max(h, DEEP + 2.5*Math.pow(bump(x, z, ISL[0], ISL[1], 3.6), .7));
    };
    const sandD = c('#f2d9a2'), sandW = c('#d6b679'), sandU = c('#d2b98a'), deepC = c('#2b7d98'), rockG = c('#8d8a86'), grass = c('#5ea944');
    const gcol = (x, z, y) => {
      if (z < -9.2) return grass;
      const rk = bump(x, z, ISL[0], ISL[1], 3.6);
      if (rk > .3) return tmp.copy(rockG).multiplyScalar(.85 + .25*smooth(WL, .8, y)).clone();
      if (y > WL + .28) return tmp.copy(sandD).multiplyScalar(.96 + .06*Math.sin(x*3.1 + z*2.3)).clone();
      if (y > WL - .04) return sandW;
      return tmp.copy(sandU).lerp(deepC, smooth(WL - .1, DEEP + .2, y)).clone();
    };
    const N = 240, ring = K.island({ n: N, top: H, lip: gcol });
    // ground: concentric copies of the edge ring, heights from H
    {
      const KR = 72, P = [], Cc = [], I = [];
      P.push(0, H(0, 0), 0); const c0 = gcol(0, 0, H(0, 0)); Cc.push(c0.r, c0.g, c0.b);
      for (let k = 1; k <= KR; k++){ const s = k/KR; for (const [ex, ez] of ring){ const x = ex*s, z = ez*s, y = H(x, z), cc = gcol(x, z, y); P.push(x, y, z); Cc.push(cc.r, cc.g, cc.b); } }
      for (let j = 0; j < N; j++) I.push(0, 1 + (j + 1)%N, 1 + j);
      for (let k = 1; k < KR; k++) for (let j = 0; j < N; j++){ const a = 1 + (k - 1)*N + j, b = 1 + (k - 1)*N + (j + 1)%N, d = 1 + k*N + j, e = 1 + k*N + (j + 1)%N; I.push(a, b, d, b, e, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setIndex(I); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 })); m.receiveShadow = true; root.add(m);
    }
    // the sea: a sheet at the water line (the land above it hides it), rippled by a drifting normal map, and its side
    // wall round the island's edge like a cut through resin
    let waterFx;
    {
      const S = 256, cv = canvas(S, S), g = cv.getContext('2d'), img = g.createImageData(S, S), hgt = (u, v) => Math.sin(2*PI*(3*u + v)) + .6*Math.sin(2*PI*(-2*u + 5*v) + 1.3) + .35*Math.sin(2*PI*(7*u - 4*v) + .4) + .25*Math.sin(2*PI*(11*u + 9*v) + 2.1);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){ const u = x/S, v = y/S, e = 1/S, dx = (hgt(u + e, v) - hgt(u - e, v))/(2*e)*.012, dy = (hgt(u, v + e) - hgt(u, v - e))/(2*e)*.012, l = Math.hypot(dx, dy, 1), i = (y*S + x)*4;
        img.data[i] = (-dx/l*.5 + .5)*255; img.data[i + 1] = (-dy/l*.5 + .5)*255; img.data[i + 2] = (1/l*.5 + .5)*255; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      const nm = new THREE.CanvasTexture(cv); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(7, 7);
      const mat = new THREE.MeshStandardMaterial({ color: c('#36aecd'), transparent: true, opacity: .62, roughness: .1, metalness: .05, normalMap: nm, normalScale: new THREE.Vector2(.35, .35), envMapIntensity: 1.2 });
      const sea = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x*1.004, -z*1.004))), 1), mat);
      sea.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v/28 + .5; }); sea.rotation.x = -PI/2; sea.position.y = WL; sea.renderOrder = 2; root.add(sea);
      const P = [], I = [], NN = [];
      ring.forEach(([x, z]) => { const y = H(x, z), l = Math.hypot(x, z); P.push(x*1.006, WL, z*1.006, x*1.006, Math.min(WL, y - .02), z*1.006); NN.push(x/l, 0, z/l, x/l, 0, z/l); });
      for (let j = 0; j < N; j++){ const a = j*2, b = ((j + 1)%N)*2; I.push(a, a + 1, b, b, a + 1, b + 1); }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wg.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3)); wg.setIndex(I);
      const wall = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: c('#3aa9c4'), transparent: true, opacity: .6, roughness: .1, side: THREE.DoubleSide, depthWrite: false })); wall.renderOrder = 3; root.add(wall);
      // foam: where the beach meets the water, and round the islet
      const foamT = tex(canvas(512, 64, (gg, w, h) => { const r = E.mulberry32(5); gg.clearRect(0, 0, w, h);
        for (let i = 0; i < 260; i++){ const x = r()*w, y = Math.pow(r(), 1.6)*h, rr = 3 + r()*9; gg.fillStyle = `rgba(255,255,255,${.35 + .55*(1 - y/h)})`; gg.beginPath(); gg.ellipse(x, y, rr*1.8, rr, 0, 0, 2*PI); gg.fill();
          if (x < 20) { gg.beginPath(); gg.ellipse(x + w, y, rr*1.8, rr, 0, 0, 2*PI); gg.fill(); } if (x > w - 20){ gg.beginPath(); gg.ellipse(x - w, y, rr*1.8, rr, 0, 0, 2*PI); gg.fill(); } } }), [1, 1]);
      const shoreZ = x => { let a = -4.5, b = 12; for (let k = 0; k < 30; k++){ const m = (a + b)/2; if (H(x, m) > WL) a = m; else b = m; } return (a + b)/2; };
      const foams = [];
      for (const [w, ph, op] of [[.55, 0, .9], [.9, 2.1, .55]]){
        const n = 70, Pf = [], Uf = [], If = []; for (let i = 0; i <= n; i++){ const x = -13.4 + i/n*(QX - 1.4 + 13.4), z = shoreZ(x); Pf.push(x, 0, z - .12, x, 0, z + w); Uf.push(x/3, 1, x/3, 0); if (i < n){ const a = i*2; If.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(Pf, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(Uf, 2)); fg.setIndex(If); fg.computeVertexNormals();
        const ft = foamT.clone(); ft.needsUpdate = true; ft.wrapS = THREE.RepeatWrapping;
        const fm = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, opacity: op, side: THREE.DoubleSide })); fm.position.y = WL + .012; fm.renderOrder = 4; root.add(fm); foams.push({ fm, ft, ph, op });
      }
      const ringT = foamT.clone(); ringT.needsUpdate = true;
      const isle = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.55, 48, 1), new THREE.MeshBasicMaterial({ map: ringT, transparent: true, depthWrite: false, opacity: .8 })); isle.rotation.x = -PI/2; isle.position.set(ISL[0], WL + .012, ISL[1]); isle.renderOrder = 4; root.add(isle);
      waterFx = (t, waves) => { nm.offset.set(t*.012, t*.007); mat.normalScale.setScalar(.2 + .3*waves);
        foams.forEach(f => { const k = Math.sin(t*.9 + f.ph); f.fm.position.z = .22*k*(.5 + waves); f.ft.offset.x = t*.02 + f.ph; f.fm.material.opacity = f.op*(.75 + .25*k); });
        isle.rotation.z = t*.05; isle.scale.setScalar(1 + .04*Math.sin(t*.9)); };
    }

    // ----- promenade, sea wall, quay and pier -----
    const slabs = tex(canvas(512, 512, (g, w, h) => { const r = E.mulberry32(9); g.fillStyle = '#9d927f'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 128) for (let x = -(y/128%2)*64; x < w; x += 128){ const col = ['#ddd2bd', '#d2c6af', '#e4dac6', '#cbbfa8'][Math.floor(r()*4)];
        for (const ox of [0, w]){ rrect(g, x + ox + 4, y + 4, 120, 120, 10); g.fillStyle = col; g.fill(); } } }), [1, 1]);
    { const pg = new THREE.PlaneGeometry(27.6, 4.8); pg.attributes.uv.array.forEach((v, i, a) => { a[i] = i%2 ? v*4.8/2.4 : v*27.6/2.4; });
      const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: slabs, roughness: .85 })); pm.rotation.x = -PI/2; pm.position.set(0, .012, -7.0); pm.receiveShadow = true; root.add(pm); }
    const algae = (lo) => (x, y) => tmp.copy(STONE).multiplyScalar(.9).lerp(c('#5e7a5a'), smooth(WL + .15, WL - .2, y)).lerp(c('#6f6a60'), smooth(WL - .2, lo, y)).clone();
    {
      const L = parts();
      // the sea wall along the beach, a gap with steps at x -5.6
      for (const [x0, x1] of [[-13.6, -6.5], [-4.7, QX - .2]]) L.body.push([rbox(x1 - x0, .5, .35, .04), [(x0 + x1)/2, .2, QZ - .1], 0, 1, STONE], [rbox(x1 - x0 + .06, .08, .45, .03), [(x0 + x1)/2, .47, QZ - .1], 0, 1, c('#ece3d1')]);
      // the quay wall round the harbour basin, its top kerb, and the pier
      L.body.push([rbox(HW - QX - .1, .12 - DEEP, .9, .05), [(QX + HW)/2 - .25, (.06 + DEEP)/2, QZ - .45], 0, 1, algae(DEEP)]);
      L.body.push([rbox(HW - QX - .1, .1, .5, .03), [(QX + HW)/2 - .25, .07, QZ - .2], 0, 1, c('#ece3d1')]);
      L.body.push([rbox(.9, .12 - DEEP, 5.2 - QZ, .05), [QX - .45, (.06 + DEEP)/2, (QZ + 5.2)/2], 0, 1, algae(DEEP)]);   // the breakwater between beach and basin
      L.body.push([rbox(2.2, PY - DEEP + .05, PZ - QZ, .08), [PX, (PY + DEEP - .05)/2, (QZ + PZ)/2], 0, 1, algae(DEEP)]);
      L.body.push([rbox(2.3, .1, PZ - QZ + .1, .03), [PX, PY + .02, (QZ + PZ)/2], 0, 1, c('#ece3d1')]);
      // bollards and tyres on the quay and the pier
      const bollard = (x, y, z) => { L.gloss.push([lathe([[0, 0], [.13, 0], [.11, .1], [.09, .28], [.15, .34], [.15, .4], [0, .4]], 14), [x, y, z], 0, 1, c('#2b2f33')]); };
      for (const x of [4.6, 6.3, 10.0, 12.4]) bollard(x, .12, QZ - .35);
      for (let k = 0; k < 5; k++){ bollard(PX - .85, PY + .07, QZ + 1.6 + k*2.9); bollard(PX + .85, PY + .07, QZ + 1.6 + k*2.9); }
      for (let k = 0; k < 4; k++){ L.body.push([new THREE.TorusGeometry(.26, .09, 8, 16), [PX - 1.15, -.05, QZ + 2.2 + k*3.1], [0, PI/2, 0], 1, c('#2a2a2a')], [new THREE.TorusGeometry(.26, .09, 8, 16), [PX + 1.15, -.05, QZ + 2.2 + k*3.1], [0, PI/2, 0], 1, c('#2a2a2a')]); }
      for (const x of [5.3, 11.2]) L.body.push([new THREE.TorusGeometry(.26, .09, 8, 16), [x, -.08, QZ + .02], 0, 1, c('#2a2a2a')]);
      // iron ladders down the pier
      for (const sx of [-1, 1]){ const x = PX + sx*1.12, z = QZ + 7.4; for (const dz of [-.22, .22]) L.gloss.push([cyl(.02, .02, 6), [x, (PY + DEEP)/2 + .2, z + dz], 0, [1, PY - DEEP + .2, 1], IRON]);
        for (let k = 0; k < 6; k++) L.gloss.push([cyl(.015, .015, 6), [x, PY - .2 - k*.3, z], [PI/2, 0, 0], [1, .44, 1], IRON]); }
      // the harbour light at the end of the pier: a striped post with a lantern
      L.body.push([cyl(.2, .26, 16), [PX, PY + 1.1, PZ - .6], 0, [1, 2.1, 1], (x, y) => Math.floor((y - PY)/.42)%2 ? c('#f4f1ea') : c('#d8473a')]);
      L.gloss.push([cyl(.3, .3, 16), [PX, PY + 2.2, PZ - .6], 0, [1, .08, 1], IRON], [cyl(.02, .2, 8), [PX, PY + 2.75, PZ - .6], 0, [1, .25, 1], c('#d8473a')]);
      L.lamp.push([cyl(.17, .17, 10), [PX, PY + 2.45, PZ - .6], 0, [1, .42, 1], c('#ffe7b0')]);
      // the wooden jetty from the beach: planks, stringers, posts down to the sand
      const jl = JZ[1] - JZ[0];
      for (let k = 0; k < Math.floor(jl/.27); k++) L.body.push([rbox(1.6, .06, .23, .015), [JX, JY - .03, JZ[0] + .14 + k*.27], [0, (R() - .5)*.02, 0], 1, WOODL.clone().multiplyScalar(.9 + .15*R())]);
      for (const sx of [-1, 1]){ L.body.push([rbox(.1, .14, jl, .02), [JX + sx*.6, JY - .13, (JZ[0] + JZ[1])/2], 0, 1, WOOD]);
        for (let k = 0; k <= 6; k++){ const z = JZ[0] + .2 + k*(jl - .4)/6, yb = H(JX + sx*.72, z) - .1; L.body.push([cyl(.08, .09, 10), [JX + sx*.72, (JY + .35 + yb)/2, z], 0, [1, JY + .35 - yb, 1], WOOD]); } }
      for (let k = 0; k < 3; k++) L.body.push([rbox(1.0, .06, .26, .015), [JX, .22 - k*.09, JZ[0] - .15 - k*.24], 0, 1, WOODL]);   // steps up from the sand
      bollard(JX + .55, JY, JZ[1] - .3);
      bake(L);
    }

    // ----- boats (each bobs on its own) -----
    function hull(len, beam, depth, cols){
      const g = new THREE.SphereGeometry(1, 28, 10, 0, 2*PI, PI/2, PI/2), p = g.attributes.position, C = [];
      for (let i = 0; i < p.count; i++){ const z = p.getZ(i), y = p.getY(i)*depth, x = p.getX(i)*beam/2*(1 - .55*Math.pow(Math.max(0, z), 1.8));
        p.setXYZ(i, x, y, z*len/2); const cc = y > -.12 ? cols[2] : y > -depth*.5 ? cols[1] : cols[0]; C.push(cc.r, cc.g, cc.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
      const rim = []; for (let i = 0; i <= 28; i++) rim.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
      return { g, rim };
    }
    const boatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55 }), boats = [];
    const boat = (parts, x, z, yaw, free) => { const grp = new THREE.Group(), m = new THREE.Mesh(solid(parts), boatMat); m.castShadow = true; m.receiveShadow = true; grp.add(m); grp.position.set(x, WL, z); grp.rotation.y = yaw; root.add(grp); boats.push({ grp, x, z, yaw, free, ph: R()*6 }); return grp; };
    const deck = (rim, y, col) => { const s = new THREE.Shape(rim.map(v => new THREE.Vector2(v.x*.96, -v.z*.96))); const g = new THREE.ShapeGeometry(s, 1); g.rotateX(-PI/2); g.translate(0, y, 0); return [g, 0, 0, 1, col]; };
    let fishing, fishingDeck;
    {
      const h = hull(6.0, 2.1, .85, [c('#c83a2f'), c('#f2efe6'), c('#2f6fb3')]), F = .5, pp = [];
      pp.push([h.g, [0, F, 0], 0, 1, null], deck(h.rim, F - .08, c('#b98552')));
      pp.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(h.rim.map(v => v.clone().multiplyScalar(.99)), true), 56, .05, 6, true), [0, F + .02, 0], 0, 1, c('#f2efe6')]);
      pp.push([rbox(1.3, 1.25, 1.5, .08), [0, F + .55, -.55], 0, 1, c('#f2efe6')], [rbox(1.5, .12, 1.7, .05), [0, F + 1.2, -.55], 0, 1, c('#c83a2f')]);
      for (const sx of [-1, 1]) pp.push([BOX, [sx*.655, F + .7, -.55], 0, [.02, .4, 1.0], c('#3f6f9f')]);
      pp.push([BOX, [0, F + .72, .2], 0, [.9, .38, .02], c('#3f6f9f')]);
      pp.push([cyl(.05, .06, 8), [0, F + 1.6, .9], 0, [1, 3.0, 1], c('#f2efe6')], [cyl(.035, .035, 8), [0, F + 1.1, .2], [PI/2 - .25, 0, 0], [1, 1.6, 1], c('#f2efe6')]);
      pp.push([new THREE.TorusGeometry(.22, .06, 8, 16), [.67, F + .75, -1.1], [0, PI/2, 0], 1, (x, y, z) => Math.floor((Math.atan2(y - F - .75, z + 1.1) + PI)/(PI/2))%2 ? c('#ffffff') : c('#e8414f')]);
      for (let k = 0; k < 9; k++) pp.push([SPX, [(R() - .5)*.8, F + .05, -2.0 + (R() - .5)*.6], 0, [.25, .12, .25], c('#3f6b4f')]);   // a heap of nets at the stern
      for (let k = 0; k < 3; k++) pp.push([rbox(.45, .25, .35, .03), [-.4 + k*.4, F + .05, 1.6], 0, 1, c('#5f8fbf')]);
      fishing = boat(pp, PX - 2.2, 3.4, 0, false); fishingDeck = [PX - 2.2, WL + F - .08, 3.4 + .9];
    }
    let rowing;
    { const h = hull(2.6, 1.1, .38, [c('#8a5a3c'), c('#b07a4c'), c('#e8e2d4')]), F = .22, pp = [];
      pp.push([h.g, [0, F, 0], 0, 1, null], deck(h.rim, F - .2, c('#9a6a3e')));
      for (const z of [-.5, .35]) pp.push([rbox(.95, .05, .22, .015), [0, F - .07, z], 0, 1, WOODL]);
      for (const sx of [-1, 1]) pp.push([cyl(.025, .025, 6), [sx*.35, F + .02, -.1], [PI/2, .15*sx, 0], [1, 2.2, 1], WOODL], [rbox(.12, .02, .5, .01), [sx*.42, F + .02, -1.15], [0, .15*sx, 0], 1, WOODL]);
      rowing = boat(pp, JX + 1.5, JZ[1] - 1.4, .15, false); }
    let sail;
    { const h = hull(3.2, 1.3, .5, [c('#2f6fb3'), c('#f4f1ea'), c('#f4f1ea')]), F = .3, pp = [];
      pp.push([h.g, [0, F, 0], 0, 1, null], deck(h.rim, F - .06, c('#c89462')), [cyl(.04, .05, 8), [0, F + 1.9, .35], 0, [1, 3.8, 1], c('#f4f1ea')], [cyl(.03, .03, 8), [0, F + .55, -.5], [PI/2, 0, 0], [1, 1.7, 1], c('#f4f1ea')]);
      const grp = boat(pp, 0, 0, 0, true);
      const st = new THREE.Shape(); st.moveTo(0, 0); st.lineTo(0, 3.4); st.quadraticCurveTo(-.6, 1.6, -1.65, 0); st.lineTo(0, 0);
      const sg = new THREE.ShapeGeometry(st, 12); sg.rotateY(-PI/2);
      const sailT = tex(canvas(256, 256, (g, w, h) => { g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8414f'; g.fillRect(0, h*.55, w, h*.12); g.fillStyle = '#ffd23f'; g.fillRect(0, h*.67, w, h*.06); }));
      sg.attributes.uv.array.forEach((v, i, a) => { a[i] = i%2 ? v/3.4 : -v/1.65 + 1; });
      const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sailT, side: THREE.DoubleSide, roughness: .8 })); sm.position.set(0, F + .55, .35); sm.castShadow = true; grp.add(sm); sail = grp; }

    // ----- the lighthouse on its islet -----
    let beam;
    {
      const L = parts(), [ix, iz] = ISL, y0 = .55, Ht = 6.6;
      L.body.push([lathe([[0, 0], [1.2, 0], [1.15, .4], [.8, Ht], [.95, Ht + .05], [.95, Ht + .2], [0, Ht + .2]], 28), [ix, y0, iz], 0, 1, (x, y) => y > y0 + Ht - .05 ? c('#f4f1ea') : Math.floor((y - y0)/1.1)%2 ? c('#f4f1ea') : c('#d8473a')]);
      L.body.push([arch(.7, 1.5, .12), [ix + .82, y0, iz + .78], [0, PI/4, 0], 1, c('#6d4a2f')], [rbox(1.0, .12, .6, .03), [ix + .9, y0 - .02, iz + .9], [0, PI/4, 0], 1, STONE]);
      for (const [a, y] of [[2.4, 2.4], [1.0, 4.2], [-.2, 5.6]]){ const rr = 1.17 - .35*(y - .4)/(Ht - .4); L.body.push([arch(.34, .6, .14), [ix + Math.sin(a)*rr, y0 + y, iz + Math.cos(a)*rr], [0, a, 0], 1, c('#3f6f9f')]); }
      const gy = y0 + Ht + .2;
      L.gloss.push([cyl(1.25, 1.25, 28), [ix, gy + .02, iz], 0, [1, .1, 1], IRON], [new THREE.TorusGeometry(1.2, .03, 6, 40), [ix, gy + .7, iz], [PI/2, 0, 0], 1, IRON]);
      for (let k = 0; k < 24; k++){ const a = k/24*2*PI; L.gloss.push([cyl(.015, .015, 5), [ix + Math.cos(a)*1.2, gy + .36, iz + Math.sin(a)*1.2], 0, [1, .7, 1], IRON]); }
      L.lamp.push([cyl(.58, .58, 20), [ix, gy + .62, iz], 0, [1, 1.1, 1], c('#fff3c8')]);
      for (let k = 0; k < 8; k++){ const a = k/8*2*PI; L.gloss.push([cyl(.025, .025, 5), [ix + Math.cos(a)*.6, gy + .62, iz + Math.sin(a)*.6], 0, [1, 1.1, 1], IRON]); }
      L.body.push([cyl(0, .78, 20), [ix, gy + 1.48, iz], 0, [1, .65, 1], c('#d8473a')]); L.gloss.push([SPH, [ix, gy + 1.88, iz], 0, .1, c('#e8b33a')]);
      bake(L);
      const fade = tex(canvas(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
      const bm = new THREE.MeshBasicMaterial({ color: c('#fff1b8'), alphaMap: fade, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      beam = new THREE.Group(); beam.position.set(ix, gy + .62, iz); root.add(beam);
      for (const sg of [-1, 1]){ const cg = new THREE.ConeGeometry(1.1, 9, 24, 1, true); cg.translate(0, -4.5, 0); cg.rotateZ(sg*PI/2); const m = new THREE.Mesh(cg, bm); beam.add(m); }
      beam.userData.mat = bm;
    }

    // ----- rocks: the islet, the groyne between beach and harbour, the left shore -----
    {
      const pp = [], rock = (x, z, s, y) => pp.push([new THREE.DodecahedronGeometry(1, 0), [x, y ?? H(x, z) + s*.25, z], [R()*3, R()*3, R()*3], [s, s*.7, s*.9], (xx, yy) => tmp.copy(c('#9a958f')).multiplyScalar(.75 + .3*smooth(WL - .3, WL + 1, yy)).clone()]);
      for (let k = 0; k < 14; k++){ const a = k/14*2*PI + R()*.3, d = 1.4 + R()*1.3; rock(ISL[0] + Math.cos(a)*d, ISL[1] + Math.sin(a)*d, .5 + .5*R()); }
      for (let k = 0; k < 17; k++){ const z = QZ + .4 + k*.62, x = QX - .7 + (R() - .5)*.6; rock(x, z, .55 + .35*R(), Math.max(WL - .2, H(x, z)) + .25); }
      for (let k = 0; k < 7; k++) rock(-13.2 + R()*.8, -3 + k*1.7, .45 + .4*R());
      const m = new THREE.Mesh(solid(pp), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, flatShading: true })); m.castShadow = m.receiveShadow = true; root.add(m);
    }

    // ----- the beach: umbrellas, towels, loungers, the lifeguard tower, a sandcastle, a ball, palms, dune grass -----
    const palms = [];
    {
      const L = parts(), umb = [[-11.6, -1.3, '#e8414f'], [-8.6, -.5, '#3b8fe0'], [-3.0, -1.0, '#ffd23f'], [1.6, -1.2, '#4fbf6a']];
      for (const [x, z, col] of umb){ const y = H(x, z), cone = new THREE.ConeGeometry(1.3, .5, 16, 1).toNonIndexed(), cc = c(col), wh = c('#f8f5ee');
        cone.computeVertexNormals(); const pa = cone.attributes.position, C = [];
        for (let i = 0; i < pa.count; i += 3){ const ax = (pa.getX(i) + pa.getX(i + 1) + pa.getX(i + 2))/3, az = (pa.getZ(i) + pa.getZ(i + 1) + pa.getZ(i + 2))/3, k = Math.floor((Math.atan2(az, ax) + PI)/(2*PI)*16)%2 ? cc : wh; for (let j = 0; j < 3; j++) C.push(k.r, k.g, k.b); }
        cone.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        const tilt = (R() - .5)*.2;
        L.body.push([cyl(.035, .035, 8), [x, y + 1.1, z], [0, 0, tilt], [1, 2.2, 1], c('#f8f5ee')], [cone, [x - Math.sin(tilt)*1.0, y + 2.3, z], [0, R(), tilt], 1, null], [SPH, [x - Math.sin(tilt)*1.25, y + 2.58, z], 0, .06, cc]);
        const tc = c(['#ff8fb1', '#ffffff', '#3b8fe0', '#ff7a3d'][umb.findIndex(u => u[0] === x)]);
        L.body.push([rbox(.9, .02, 1.8, .008), [x + .4, H(x + .4, z + 1.1) + .015, z + 1.1], [0, .2, 0], 1, tc], [BOX, [x + .4, H(x + .4, z + 1.1) + .03, z + 1.1], [0, .2, 0], [.9, .012, .2], c('#ffffff')]); }
      const lounger = (x, z, yaw) => { const M = placeM(x, z, yaw, H(x, z)), Lb = parts();
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) Lb.gloss.push([cyl(.025, .025, 6), [sx*.3, .15, sz*.7], 0, [1, .3, 1], c('#f4f1ea')]);
        for (let k = 0; k < 7; k++) Lb.body.push([rbox(.66, .04, .12, .01), [0, .32, -.75 + k*.15], 0, 1, c('#d9a066')]);
        for (let k = 0; k < 4; k++) Lb.body.push([rbox(.66, .04, .12, .01), [0, .42 + k*.1, -.9 - k*.07], [-.95, 0, 0], 1, c('#d9a066')]);
        bake(Lb, M); };
      lounger(-7.4, -.7, PI - .3); lounger(-1.7, -1.3, PI + .2);
      // lifeguard tower
      { const M = placeM(-.8, -3.1, 0, H(-.8, -3.1)), Lb = parts(), pH = 2.2;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) Lb.body.push([rbox(.12, pH + .1, .12, .02), [sx*.62, pH/2, sz*.62], [sz*.06, 0, -sx*.06], 1, c('#f4f1ea')]);
        Lb.body.push([rbox(1.7, .12, 1.7, .03), [0, pH, 0], 0, 1, WOODL], [rbox(1.1, 1.05, .9, .05), [0, pH + .6, -.3], 0, 1, c('#f4f1ea')], [rbox(1.3, .1, 1.1, .04), [0, pH + 1.18, -.3], 0, 1, c('#e8414f')]);
        Lb.body.push([BOX, [0, pH + .62, .16], 0, [.7, .35, .02], c('#3f6f9f')], [BOX, [0, pH + .9, -.3], 0, [1.12, .14, .92], c('#e8414f')]);
        for (const sx of [-1, 1]) Lb.body.push([rbox(.06, .5, 1.6, .02), [sx*.83, pH + .3, 0], 0, 1, c('#f4f1ea')]);
        Lb.body.push([rbox(1.6, .06, .06, .02), [0, pH + .55, .82], 0, 1, c('#f4f1ea')]);
        for (const sx of [-1, 1]) Lb.body.push([rbox(.06, 2.5, .06, .02), [sx*.28, 1.1, 1.25], [-.45, 0, 0], 1, WOODL]);
        for (let k = 0; k < 7; k++) Lb.body.push([rbox(.56, .04, .06, .01), [0, .2 + k*.3, 1.68 - k*.135], 0, 1, WOODL]);
        Lb.gloss.push([cyl(.025, .025, 6), [.7, pH + 1.6, .7], 0, [1, 1.6, 1], c('#d8d2c4')]);
        bake(Lb, M); const g = group(M);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(.6, .4), new THREE.MeshStandardMaterial({ map: tex(canvas(128, 86, (gg, w, h) => { gg.fillStyle = '#e8414f'; gg.fillRect(0, 0, w, h/2); gg.fillStyle = '#ffd23f'; gg.fillRect(0, h/2, w, h/2); })), side: THREE.DoubleSide, roughness: .8 }));
        fl.position.set(1.0, pH + 2.2, .7); g.add(fl); dyn.push(t => { fl.rotation.y = .3*Math.sin(t*2.3); }); }
      // sandcastle with a bucket and spade, a beach ball
      { const x = -7.2, z = 1.0, y = H(x, z) - .02, sand = c('#e9cf94');
        L.body.push([cyl(.55, .62, 16), [x, y + .12, z], 0, [1, .24, 1], sand], [cyl(.38, .42, 16), [x, y + .34, z], 0, [1, .22, 1], sand], [cyl(.2, .22, 12), [x, y + .55, z], 0, [1, .22, 1], sand]);
        for (let k = 0; k < 4; k++){ const a = k*PI/2 + PI/4; L.body.push([cyl(.11, .12, 10), [x + Math.cos(a)*.5, y + .3, z + Math.sin(a)*.5], 0, [1, .36, 1], sand]);
          for (let j = 0; j < 4; j++){ const b = j*PI/2; L.body.push([BOX, [x + Math.cos(a)*.5 + Math.cos(b)*.08, y + .52, z + Math.sin(a)*.5 + Math.sin(b)*.08], 0, .05, sand]); } }
        L.gloss.push([cyl(.008, .008, 5), [x, y + .82, z], 0, [1, .4, 1], c('#ffffff')]); L.body.push([BOX, [x + .1, y + .96, z], 0, [.18, .12, .01], c('#e8414f')]);
        L.gloss.push([lathe([[0, 0], [.12, 0], [.16, .24], [.17, .25], [0, .25]], 14), [x + .9, H(x + .9, z + .3), z + .3], [.4, 0, .3], 1, c('#e8414f')], [BOX, [x + .7, y + .1, z + .7], [0, .5, 1.2], [.05, .45, .03], c('#ffd23f')], [BOX, [x + .8, y + .33, z + .74], [0, .5, 1.2], [.14, .12, .02], c('#ffd23f')]); }
      { const x = -1.6, z = .7, ball = new THREE.SphereGeometry(.28, 18, 12), pa = ball.attributes.position, C = [], cols = ['#e8414f', '#ffffff', '#3b8fe0', '#ffd23f', '#ffffff', '#4fbf6a'].map(h => c(h));
        for (let i = 0; i < pa.count; i++){ const k = cols[Math.floor((Math.atan2(pa.getZ(i), pa.getX(i)) + PI)/(2*PI)*6)%6]; C.push(k.r, k.g, k.b); }
        ball.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); L.gloss.push([ball, [x, H(x, z) + .27, z], [.3, 0, .4], 1, null]); }
      // starfish and shells on the wet sand
      for (let k = 0; k < 7; k++){ const x = -12 + k*2.0 + R(), z = 1.0 + R()*.7, y = H(x, z) + .02;
        if (k%2) for (let j = 0; j < 5; j++){ const a = j/5*2*PI; L.body.push([SPX, [x + Math.cos(a)*.07, y, z + Math.sin(a)*.07], [0, -a, 0], [.08, .02, .03], c('#ff7a3d')]); }
        else L.body.push([SPX, [x, y, z], [0, R()*3, 0], [.07, .03, .06], c('#f6e6d6')]); }
      // dune grass
      for (let k = 0; k < 40; k++){ const x = -13 + R()*15.5, z = -4.3 + R()*2.2, y = H(x, z); if (y < .12) continue;
        for (let j = 0; j < 5; j++) L.body.push([cyl(0, .025, 4), [x + (R() - .5)*.2, y + .18, z + (R() - .5)*.2], [(R() - .5)*.5, 0, (R() - .5)*.5], [1, .4, 1], tmp.copy(c('#9cb84f')).lerp(c('#d6c36a'), R()).clone()]); }
      bake(L);
      // palms: a ringed trunk leaning to the sea, a crown of drooping fronds, coconuts (each sways)
      for (const [x, z, s] of [[-12.4, -3.3, 1.1], [-6.6, -3.9, 1], [2.2, -3.6, .95]]){
        const pp = [], segs = 9, lean = .5;
        for (let k = 0; k < segs; k++){ const v = k/segs, px = 0, py = 4.2*v, pz = lean*v*v*1.6; pp.push([cyl(.13 - .04*v, .16 - .04*v, 10), [px, py + .25, pz], [.25*v, 0, 0], [1, .5, 1], k%2 ? c('#a07850') : c('#8a6440')]); }
        const top = [0, 4.45, lean*1.6];
        for (let k = 0; k < 9; k++){ const a = k/9*2*PI, droop = .45 + .25*(k%2);
          for (let j = 0; j < 4; j++){ const f = (j + .5)/4, r = 1.6*f; pp.push([SPX, [top[0] + Math.cos(a)*r, top[1] - droop*f*f*1.6 + .1, top[2] + Math.sin(a)*r], [0, -a, -droop*f*1.4], [.38, .03, .2*(1 - f*.6)], tmp.copy(LEAF).lerp(LEAF2, f).clone()]); } }
        for (let k = 0; k < 3; k++){ const a = k*2.1; pp.push([SPL, [top[0] + Math.cos(a)*.18, top[1] - .2, top[2] + Math.sin(a)*.18], 0, .12, c('#6b4a2a')]); }
        const g = new THREE.Group(), m = new THREE.Mesh(solid(pp), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75 })); m.castShadow = true; g.add(m);
        g.position.set(x, H(x, z) - .05, z); g.scale.setScalar(s); g.rotation.y = (R() - .5)*.6; root.add(g); palms.push({ g, ph: R()*6, ry: g.rotation.y }); }
    }

    // ----- the promenade row: hotel, a house, ice cream, harbour office, fish market, warehouse -----
    const HS = [];
    HS.push(Object.assign(house({ w: 3.8, d: 3.2, floors: 4, color: '#8fcfd0', shut: '#2f6f8a', roof: 'flat', balcony: true, kind: 'shop', sign: 'HOTEL', awn: ['#2f8f9d', '#f4efe2'], frame: '#24606a', signBg: '#24606a' }, placeM(-11.1, -9.0)), { M: placeM(-11.1, -9.0) }));
    HS.push(Object.assign(house({ w: 3.4, d: 3.2, floors: 3, color: '#f0a58a', shut: '#3b6fb0', boxes: .8, laundry: true }, placeM(-7.5, -9.0)), { M: placeM(-7.5, -9.0), laundry: true }));
    const ice = house({ w: 4.4, d: 3.2, floors: 2, color: '#f2b8cf', shut: '#4b8a9a', roof: 'flat', kind: 'shop', sign: 'ICE CREAM', awn: ['#e46aa0', '#f4efe2'], frame: '#a8406e', signBg: '#a8406e' }, placeM(-3.6, -9.0));
    { const L = parts(), M = placeM(-3.6, -9.0), y = ice.H + .14;   // a giant cone on the roof
      L.body.push([cyl(.55, 0, 16), [1.2, y + .95, -.8], 0, [1, 1.9, 1], c('#d9a35a')]);
      for (const [sx, sy, col] of [[0, 2.0, '#ff8fb1'], [-.22, 2.45, '#fff1d6'], [.18, 2.82, '#8a5a3c']]) L.body.push([SPH, [1.2 + sx*.3, y + sy, -.8], 0, [.55, .48, .55], c(col)]);
      L.gloss.push([SPH, [1.25, y + 3.32, -.8], 0, .12, c('#e8414f')]); bake(L, M); }
    HS.push(Object.assign(house({ w: 4.0, d: 3.2, floors: 3, color: '#7fa8d8', shut: '#f4efe2', kind: 'shop', sign: 'HARBOR', awn: ['#2f6fb3', '#f4efe2'], frame: '#24456e', signBg: '#24456e', balcony: true }, placeM(.6, -9.0)), { M: placeM(.6, -9.0) }));
    const office = HS[HS.length - 1];
    { const L = parts(); L.gloss.push([cyl(.04, .05, 8), [1.3, office.top + 1.6, -10.4], 0, [1, 3.4, 1], c('#d8d2c4')], [SPH, [1.3, office.top + 3.35, -10.4], 0, .08, c('#e8b33a')]); bake(L); }
    // fish market: one tall storey, an arcade, the sign, a fish on the ridge
    let fishMarket;
    { const M = placeM(5.4, -9.0), L = parts(), W = 5.6, D = 3.4, Ht = 4.6, wall = c('#e3cfa2'), trim = c('#3b6fb0');
      L.body.push([rbox(W, Ht, D, .1), [0, Ht/2, -D/2], 0, 1, (x, y) => tmp.copy(wall).multiplyScalar(.84 + .16*smooth(0, 1.4, y)).clone()], [rbox(W + .06, .45, D + .06, .04), [0, .22, -D/2], 0, 1, c('#a39585')]);
      for (const x of [-1.8, 0, 1.8]) L.body.push([arch(1.5, 3.1, .06), [x, .45, .03], 0, 1, trim], [arch(1.28, 3.0, .04), [x, .45, .062], 0, 1, c('#3a3f46')]);
      for (const x of [-2.7, -.9, .9, 2.7]) L.body.push([rbox(.26, 3.3, .14, .03), [x, 2.05, .07], 0, 1, c('#f1e4cb')]);
      L.body.push([rbox(W + .3, .22, D + .3, .05), [0, Ht + .03, -D/2], 0, 1, c('#f1e4cb')]);
      const top = K.roofGable(L, W, D, Ht, R, wall);
      L.gloss.push([cyl(.02, .02, 6), [0, top + .5, -D/2], 0, [1, 1.0, 1], IRON], [SPH, [0, top + 1.05, -D/2], 0, [.42, .17, .07], c('#e8b33a')], [cyl(0, .2, 4), [-.5, top + 1.05, -D/2], [0, 0, PI/2], [.4, .2, 1], c('#e8b33a')]);
      for (let k = 0; k < 3; k++){ const x = -1.8 + k*1.8; L.body.push([rbox(1.0, .7, .6, .03), [x, .35, .7], 0, 1, WOOD], [rbox(.92, .06, .52, .02), [x, .72, .7], 0, 1, c('#e8f2f8')]);
        for (let j = 0; j < 4; j++) L.body.push([SPH, [x - .3 + j*.2, .78, .7], [0, .1*j, 0], [.06, .05, .2], c('#a9b9c9')]); }
      for (let k = 0; k < 10; k++) L.body.push([SPX, [-2.6 + R()*.2, .7 + k*.25, .2], 0, [.08, .18, .06], c('#3f6b4f')]);
      bake(L, M); const g = group(M); const sg = signMesh('FISH MARKET', 3.6, .55, { bg: '#24456e', edge: '#162c48' }); sg.position.set(0, 3.95, .1); g.add(sg);
      const v = toWorld(M, 0, 0, 1.6); fishMarket = [v.x, v.z]; }
    // warehouse: brick, big doors, a hatch with a beam and a hook
    let warehouse;
    { const M = placeM(10.6, -9.0), L = parts(), W = 4.8, D = 3.4, Ht = 6.8, brick = c('#b8623f'), trim = c('#ead9bd');
      L.body.push([rbox(W, Ht, D, .08), [0, Ht/2, -D/2], 0, 1, (x, y) => tmp.copy(brick).multiplyScalar(.82 + .18*smooth(0, 1.4, y)).clone()]);
      for (let k = 0; k < 22; k++) L.body.push([BOX, [0, .5 + k*.3, .012], 0, [W - .02, .025, .025], brick.clone().multiplyScalar(.75)]);
      for (let k = 0; k < 11; k++) for (const sx of [-1, 1]){ const lg = k%2 === 0; L.body.push([rbox(lg ? .45 : .28, .26, .06, .02), [sx*(W/2 - (lg ? .22 : .14)), .55 + k*.6, .03], 0, 1, trim]); }
      for (const x of [-1.15, 1.15]){ L.body.push([arch(1.6, 2.9, .06), [x, 0, .03], 0, 1, trim], [arch(1.4, 2.8, .05), [x, 0, .06], 0, 1, c('#6d4a2f')]);
        for (let j = -2; j <= 2; j++) L.body.push([BOX, [x + j*.27, 1.2, .09], 0, [.02, 2.3, .01], c('#4a3326')]); }
      L.body.push([rbox(1.3, 1.5, .06, .02), [0, 4.7, .04], 0, 1, c('#6d4a2f')], [rbox(.14, .14, 1.4, .03), [0, 6.15, .55], 0, 1, WOOD]);
      L.gloss.push([cyl(.012, .012, 5), [0, 5.35, 1.15], 0, [1, 1.6, 1], c('#c9b48a')], [new THREE.TorusGeometry(.08, .02, 6, 12, PI*1.5), [0, 4.48, 1.15], [0, 0, PI*.75], 1, IRON]);
      for (const sx of [-1, 1]) win(L, sx*1.5, 4.7, .6, 1.0, { trim, arch: true, lit: true });
      L.body.push([rbox(W + .3, .22, D + .3, .05), [0, Ht + .03, -D/2], 0, 1, trim]);
      K.roofGable(L, W, D, Ht, R, brick);
      bake(L, M); const g = group(M); const sg = signMesh('CARGO', 1.8, .45, { bg: '#4a2e18' }); sg.position.set(0, 3.25, .1); g.add(sg);
      const v = toWorld(M, -1.15, 0, 1.0); warehouse = [v.x, v.z]; }

    // ----- the quay: barrels, crates, a crane with a swinging load; promenade lamps, benches, planters -----
    let craneLoad;
    {
      const L = parts(), barrel = lathe([[0, 0], [.22, 0], [.27, .2], [.28, .35], [.27, .5], [.22, .7], [0, .7]], 14);
      const bcol = (x, y) => { const f = (y%.7 + .7)%.7; return f < .06 || (f > .2 && f < .25) || (f > .45 && f < .5) || f > .64 ? c('#3b3b3b') : c('#9a6a3e'); };
      for (const [x, z] of [[8.6, -6.4], [9.2, -6.6], [8.9, -5.95], [12.6, -7.3]]) L.body.push([barrel, [x, 0, z], 0, 1, bcol]);
      L.body.push([barrel, [9.0, .7, -6.35], 0, 1, bcol]);
      const crate = (x, y, z, s, ry = 0) => { L.body.push([rbox(s, s, s, .02), [x, y + s/2, z], [0, ry, 0], 1, WOODL]); for (const k of [-1, 0, 1]) L.body.push([BOX, [x, y + s/2 + k*s*.3, z], [0, ry, 0], [s + .02, .04, s + .02], WOOD]); };
      crate(10.6, 0, -6.2, .7, .2); crate(11.35, 0, -6.4, .6, -.1); crate(10.9, .7, -6.3, .55, .4); crate(3.9, 0, -6.0, .6, .3); crate(4.5, 0, -6.2, .5, -.2);
      // crane
      L.gloss.push([rbox(.8, .5, .8, .05), [12.2, .25, -5.45], 0, 1, c('#2f4a3f')], [cyl(.12, .16, 12), [12.2, 1.9, -5.45], 0, [1, 3.0, 1], c('#2f4a3f')], [BOX, [12.2, 3.75, -4.15], [-.49, 0, 0], [.16, .16, 3.0], c('#2f4a3f')], [BOX, [12.2, 2.9, -4.7], [-1.05, 0, 0], [.06, .06, 1.9], c('#2f4a3f')]);
      L.gloss.push([cyl(.22, .22, 12), [12.2, 1.2, -5.25], [PI/2, 0, 0], [1, .25, 1], c('#d8473a')]);
      for (const [x, z] of [[-11.0, -5.3], [-3.6, -5.3], [1.9, -5.3], [5.7, -5.4], [-8.0, -5.3]]) K.lamp(L, x, z);
      K.planter(L, -5.2, -8.3, .8); K.planter(L, 2.9, -8.2, .8); K.planter(L, -9.4, -8.3, .7);
      bake(L);
      K.bench(-9.5, -5.6, 0); K.bench(-1.0, -5.6, 0);
      craneLoad = new THREE.Group(); craneLoad.position.set(12.2, 4.45, -2.85); root.add(craneLoad);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 2.0, 5), new THREE.MeshStandardMaterial({ color: c('#c9b48a') })); rope.position.y = -1.0; craneLoad.add(rope);
      const net = new THREE.Mesh(solid([[rbox(.7, .55, .7, .03), [0, -2.3, 0], 0, 1, WOODL], [BOX, [0, -2.3, 0], 0, [.72, .05, .72], WOOD], [BOX, [0, -2.1, 0], 0, [.72, .05, .72], WOOD]]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }));
      net.castShadow = true; craneLoad.add(net);
    }

    // ----- strings: signal flags over the harbour, laundry -----
    const lines = [], flagCols = ['#e8414f', '#ffd23f', '#3b8fe0', '#ffffff', '#4fbf6a', '#ff7a3d', '#2f3a8f'];
    const flags = n => [...Array(n)].map((_, k) => ({ shape: k%3 === 2 ? 'tri' : 'rect', w: .34, h: k%3 === 2 ? .5 : .32, col: flagCols[(k*3)%flagCols.length] }));
    lines.push({ a: new THREE.Vector3(1.3, office.top + 3.2, -10.4), b: new THREE.Vector3(PX, PY + 2.5, PZ - .6), sag: 1.2, items: flags(52) });
    lines.push({ a: new THREE.Vector3(-11.1, HS[0].H + 1.0, -9.2), b: new THREE.Vector3(-.1, 4.3, -2.4), sag: .9, items: flags(30) });
    for (const h of HS) if (h.laundry){ const a = toWorld(h.M, -h.W/2 + .45, h.G0 + h.FH + 1.75, .45), b = toWorld(h.M, h.W/2 - .45, h.G0 + h.FH + 1.75, .45);
      lines.push({ a, b, sag: .22, items: [['#ffffff', .45, .6], ['#3b8fe0', .4, .48], ['#ffd23f', .22, .3], ['#e8414f', .45, .55], ['#ffffff', .5, .65]].map(([col, w, hh]) => ({ shape: 'rect', w, h: hh, col })) }); }
    const updateStrings = K.strings(lines);
    const updateGulls = K.birds([{ x: -9.8, z: 1.4, y: H(-9.8, 1.4) }, { x: -3.6, z: 1.7, y: H(-3.6, 1.7) }, { x: -1.9, z: 1.2, y: H(-1.9, 1.2) }, { x: PX + .85, z: QZ + 7.4, y: PY + .48, r: 0 }, { x: 4.6, z: -6.5, y: 0 }],
      { kind: 'gull', fly: [{ x: 0, z: 2, r: 7, y: 9.5 }, { x: -3, z: 0, r: 5.5, y: 11 }, { x: 4, z: 4, r: 6, y: 8.5 }] });
    const updateClouds = K.clouds();
    const MATS = K.finish();

    const ground = (x, z) => {
      if (Math.abs(x - JX) < .8 && z > JZ[0] - .1 && z < JZ[1] + .1) return JY;
      if (Math.abs(x - PX) < 1.15 && z > QZ && z < PZ) return PY + .07;
      if (z <= QZ + .05) return .012;
      return H(x, z);
    };
    const spots = {
      water: WL, beach: [-4.5, -1.6], shore: [-4.0, 1.4], towels: [[-11.2, -.2], [-8.2, .6], [-2.6, .1], [2.0, -.1]], loungers: [[-7.4, -.7], [-1.7, -1.3]],
      lifeguard: [-.8, H(-.8, -3.1) + 2.26, -2.8], sandcastle: [-7.2, 1.0], jetty: { start: [JX, JZ[0] - .9], end: [JX, JY, JZ[1] - .4] }, pier: { start: [PX, QZ - .5], end: [PX, PY + .07, PZ - 1.4] },
      boat: fishingDeck, iceCream: [-4.9, -8.0], harbor: [-.4, -8.0], hotel: [-12.3, -8.0],
      fishMarket, warehouse, quay: [6.0, -5.6], crane: [12.2, -5.45], lighthouse: [ISL[0], .55, ISL[1]], benches: [[-9.5, -5.6], [-1.0, -5.6]],
      ins: { left: [-13.6, -6.8], right: [13.6, -6.8] },
    };
    const SAIL = t => { const a = t*2*PI; return [.6 + 3.4*Math.sin(a), 10.2 + 1.6*Math.sin(2*a), Math.cos(a)]; };
    return {
      object: root, spots, ground, water: WL,
      update(t, st = {}){
        const wind = st.wind ?? .4, night = st.night ?? 0, waves = st.waves ?? .5;
        waterFx(t, waves); updateStrings(t, wind); updateGulls(t, st.scatter ?? 0); updateClouds(t);
        boats.forEach(b => { const k = .5 + waves; b.grp.position.y = WL + .05*k*Math.sin(t*1.3 + b.ph); b.grp.rotation.x = .03*k*Math.sin(t*1.1 + b.ph); b.grp.rotation.z = .045*k*Math.sin(t*.9 + b.ph*2); });
        { const p = SAIL(((st.sail ?? t/60) % 1 + 1) % 1), q = SAIL((((st.sail ?? t/60) + .01) % 1 + 1) % 1); sail.position.x = p[0]; sail.position.z = p[1]; sail.rotation.y = Math.atan2(q[0] - p[0], q[1] - p[1]); sail.rotation.z = -.1*wind; }
        palms.forEach(p => { p.g.rotation.z = (.02 + .04*wind)*Math.sin(t*1.1 + p.ph); p.g.rotation.x = (.015 + .03*wind)*Math.sin(t*.8 + p.ph*1.7); });
        craneLoad.rotation.x = (.04 + .08*wind)*Math.sin(t*1.25); craneLoad.rotation.z = .03*Math.sin(t*.9);
        beam.rotation.y = t*.9; beam.userData.mat.opacity = .3*night;
        MATS.lit.emissiveIntensity = 1.6*night; MATS.lamp.emissiveIntensity = 3.2*night;
        for (const f of dyn) f(t);
      },
    };
  }

  E.fx.set = function(ctx, kind, o = {}){
    const make = { market, harbor }[kind]; if (!make){ console.error('Engine.fx.set: unknown set ' + kind); return null; }
    return make(ctx, o);
  };
})();
