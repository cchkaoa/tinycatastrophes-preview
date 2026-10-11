/* Medieval kit, cartoon style (chunky shapes, saturated colours): castle, huts, manor, church, windmill, props.
   For the history series (feudalism, the Black Death, crusades...). Load after kit.js. Colours through ctx.col.

   const B = Engine.med.builder(ctx)       collects smooth-shaded parts; B.finish() -> one mesh (one draw call)
   Engine.med.castle(B, {x, y, z, s, yaw, stone, roof, flag})   keep, four round towers with cone roofs, crenellated
                                                                curtain walls, gatehouse, flags. ~44 m across at s = 1
   Engine.med.hut(B, {x, y, z, s, yaw, wall, roof})             wattle-and-daub cottage, timber frame, thatched roof
   Engine.med.manor(B, {x, y, z, s, yaw})                       the lord's stone hall with a timber upper floor
   Engine.med.church(B, {x, y, z, s, yaw})                      nave + tower with a spire
   Engine.med.windmill(B, ctx, {x, y, z, s, yaw}) -> sails Group (spin it: sails.userData.spin.rotation.z = t*k)
   Engine.med.fence(B, [[x, z], ...], height)                    posts and two rails along a polyline
   Engine.med.stack(B, x, y, z, s) · sack(B, x, y, z, s) · cart(B, {x, y, z, yaw})   haystack, grain sack, hand cart
   Engine.med.tool(ctx, 'hoe'|'pitchfork'|'scythe'|'sack'|'torch') -> Object3D in a KayKit hand slot's frame (+y along the
     handle): character.attach('handslot.r', tool, true)
   Positions: y is the ground height at (x, z) (pass terrain.height(x, z)). Facing: yaw 0 = door towards +z. */
(function(){
  'use strict';
  const THREE = window.THREE, E = window.Engine;
  if (!THREE || !E || !E.kit) { console.error('kit-medieval.js: load engine.js and kit.js first'); return; }
  const kit = E.kit, M = E.med = {};
  const BOX = new THREE.BoxGeometry(1, 1, 1), SPH = new THREE.SphereGeometry(1, 14, 10);
  // unit gable prism: ridge along x at y = .5, eaves at y = -.5, z from -.5 to .5
  const GABLE = (() => { const a = [-.5, -.5, -.5], b = [-.5, -.5, .5], c = [-.5, .5, 0], A = [.5, -.5, -.5], Bq = [.5, -.5, .5], C = [.5, .5, 0];
    const tri = [a, b, c, A, C, Bq, a, Bq, b, a, A, Bq, b, C, c, b, Bq, C, c, A, a, c, C, A];   // counter-clockwise from outside
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3)); g.computeVertexNormals(); return g; })();

  M.builder = function(ctx){
    const parts = [], c = ctx.col, cache = {};
    const col = h => cache[h] || (cache[h] = c(h));
    const B = {
      ctx, parts, col,
      // a frame at (x, y, z) turned by yaw, scaled by s: every helper below takes local coordinates in it
      frame(x, y, z, yaw = 0, s = 1){ const cs = Math.cos(yaw), sn = Math.sin(yaw);
        return { yaw, s, p: (lx, ly, lz) => [x + (lx*cs + lz*sn)*s, y + ly*s, z + (-lx*sn + lz*cs)*s] }; },
      box(F, lx, ly, lz, sx, sy, sz, h, ry = 0){ parts.push([BOX, F.p(lx, ly, lz), [0, F.yaw + ry, 0], [sx*F.s, sy*F.s, sz*F.s], col(h)]); },
      cyl(F, lx, ly, lz, rt, rb, hgt, h, seg = 16){ parts.push([kit.cyl(rt, rb, seg), F.p(lx, ly, lz), [0, F.yaw, 0], [F.s, hgt*F.s, F.s], col(h)]); },
      // gable roof: ridge along local x (or turned by ry), centred at ly, eaves hgt/2 below the ridge
      gable(F, lx, ly, lz, len, width, hgt, h, ry = 0){ parts.push([GABLE, F.p(lx, ly, lz), [0, F.yaw + ry, 0], [len*F.s, hgt*F.s, width*F.s], col(h)]); },
      ball(F, lx, ly, lz, sx, sy, sz, h){ parts.push([SPH, F.p(lx, ly, lz), [0, F.yaw, 0], [sx*F.s, sy*F.s, sz*F.s], col(h)]); },
      finish(o = {}){
        const mesh = new THREE.Mesh(kit.solid(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? .82, envMapIntensity: .6 }));
        mesh.castShadow = mesh.receiveShadow = true; ctx.scene.add(mesh); return mesh;
      },
    };
    return B;
  };

  M.castle = function(B, o){
    const F = B.frame(o.x, o.y, o.z, o.yaw, o.s ?? 1), st = o.stone ?? '#b9b2a5', st2 = o.stone2 ?? '#a39b8d', roof = o.roof ?? '#3f6fd6', flag = o.flag ?? '#ffa82e';
    const H = 9, R = 18;
    // curtain walls between the four towers, merlons on top
    for (const [ax, az, bx, bz] of [[-R, -R, R, -R], [R, -R, R, R], [-R, R, R, R], [-R, -R, -R, R]]){
      const len = Math.hypot(bx - ax, bz - az), mx = (ax + bx)/2, mz = (az + bz)/2, ry = Math.atan2(bz - az, bx - ax);
      B.box(F, mx, H/2, mz, len, H, 2.4, st, -ry);
      for (let k = -len/2 + 1.2; k < len/2 - 1; k += 2.2){
        const cx = mx + Math.cos(ry)*k, cz = mz + Math.sin(ry)*k;
        for (const off of [-1, 1]) B.box(F, cx - Math.sin(ry)*off*1.05, H + .6, cz + Math.cos(ry)*off*1.05, 1.1, 1.2, .5, st, -ry);
      }
      B.box(F, mx, H*.35, mz, len - 1, .5, 2.6, st2, -ry);   // string course
    }
    // gatehouse on the front wall
    B.box(F, 0, H*.62, R, 9, H*1.25, 4.5, st);
    B.box(F, 0, 2.6, R + 2.3, 4.2, 5.2, .3, '#3a2a1e');
    B.cyl(F, 0, 5.2, R + 2.3, 2.1, 2.1, .3, '#3a2a1e');
    for (let k = -3.6; k <= 3.7; k += 1.8) B.box(F, k, H*1.25 + .55, R + 2.1, .9, 1.1, .6, st);
    // round towers with cone roofs and flags
    for (const [tx, tz] of [[-R, -R], [R, -R], [-R, R], [R, R]]){
      B.cyl(F, tx, H*.7, tz, 3.4, 3.7, H*1.4, st, 20);
      B.cyl(F, tx, H*1.4 + .3, tz, 3.9, 3.9, .7, st2, 20);
      B.cyl(F, tx, H*1.4 + 3.6, tz, 0, 4.3, 6, roof, 20);
      B.cyl(F, tx, H*1.4 + 7.4, tz, .08, .08, 2.4, '#4a3a2a', 6);
      B.box(F, tx + .8, H*1.4 + 8.1, tz, 1.5, .9, .08, flag);
      for (const a of [0, 1.57, 3.14, 4.71]) B.box(F, tx + Math.sin(a)*3.5, H*.9, tz + Math.cos(a)*3.5, .5, 1.2, .5, '#2c2622', a);   // arrow slits
    }
    // the keep: tall square tower inside, with a bigger flag
    B.box(F, -2, 9, -4, 12, 18, 11, st);
    for (let k = -7.4; k <= 3.5; k += 1.85) for (const z of [-9.2, 1.2]) B.box(F, k, 18.6, z, 1, 1.2, .6, st);
    for (let k = -8.6; k <= 1; k += 1.85) for (const x of [-7.7, 3.7]) B.box(F, x, 18.6, k, .6, 1.2, 1, st);
    for (const y of [7, 12, 15.5]) for (const x of [-5, -2, 1]) B.box(F, x, y, 1.55, .9, 1.6, .2, '#2c2622');
    B.cyl(F, 3, 21.5, -8, .1, .1, 6, '#4a3a2a', 6);
    B.box(F, 4.6, 23.3, -8, 3.2, 1.9, .1, flag);
  };

  M.hut = function(B, o){
    const F = B.frame(o.x, o.y, o.z, o.yaw, o.s ?? 1), wall = o.wall ?? '#ecd9b3', roof = o.roof ?? '#d8b04e', beam = '#6b4426';
    const w = o.w ?? 5, d = o.d ?? 4, h = 2.4;
    B.box(F, 0, -.1, 0, w + .4, .4, d + .4, '#8f8577');                        // stone footing
    B.box(F, 0, h/2, 0, w, h, d, wall);
    for (const x of [-w/2, 0, w/2]) for (const z of [-d/2, d/2]) B.box(F, x, h/2, z, .22, h, .22, beam);
    for (const z of [-d/2, d/2]) B.box(F, 0, h - .1, z, w + .1, .2, .22, beam);
    B.box(F, -w/4, h*.5, d/2 + .02, .12, h*.95, .12, beam, 0);
    B.box(F, w*.18, 1, d/2 + .06, 1, 2, .12, '#5a3a22');                         // door
    B.box(F, -w*.3, 1.45, d/2 + .06, .8, .65, .1, '#2b2018');                    // window
    B.gable(F, 0, h + 1.05, 0, w + 1, d + 1.4, 2.4, roof);                        // thatch
    B.box(F, 0, h + 2.2, 0, w + 1.05, .28, .55, '#b38a33');                      // ridge
  };

  M.manor = function(B, o){
    const F = B.frame(o.x, o.y, o.z, o.yaw, o.s ?? 1), stone = '#c8bfae', timber = '#f1e3c4', beam = '#5d3b22', roof = o.roof ?? '#b5482f';
    B.box(F, 0, 2, 0, 12, 4, 7, stone);
    B.box(F, 0, 5.4, 0, 12.6, 2.8, 7.6, timber);
    for (let x = -6; x <= 6.1; x += 1.5) for (const z of [-3.8, 3.8]) B.box(F, x, 5.4, z, .2, 2.8, .2, beam);
    for (const z of [-3.8, 3.8]) B.box(F, 0, 4.1, z, 12.7, .25, .25, beam);
    B.gable(F, 0, 8.3, 0, 13.6, 9, 3.4, roof);
    B.box(F, 0, 1.4, 3.55, 1.8, 2.8, .25, '#4a2f1c');
    for (const x of [-4, -2, 2, 4]) B.box(F, x, 2.4, 3.55, .9, 1.3, .2, '#2b2420');
    for (const x of [-4.5, -1.5, 1.5, 4.5]) B.box(F, x, 5.5, 3.85, .9, 1.1, .15, '#2b2420');
    B.box(F, 4.5, 9.2, -1.5, 1, 3, 1, stone);
  };

  M.church = function(B, o){
    const F = B.frame(o.x, o.y, o.z, o.yaw, o.s ?? 1), stone = '#d6cdbd', roof = '#566b8a';
    B.box(F, 0, 3.2, -2, 7, 6.4, 13, stone);
    B.gable(F, 0, 7.6, -2, 13.6, 8.2, 3.2, roof, Math.PI/2);   // ridge along the nave
    B.box(F, 0, 6, 5.2, 4.4, 12, 4.4, stone);
    B.cyl(F, 0, 15, 5.2, 0, 3.4, 6, roof, 4);
    B.box(F, 0, 18.8, 5.2, .15, 1.6, .15, '#e9c46a'); B.box(F, 0, 19.1, 5.2, .9, .15, .15, '#e9c46a');
    B.box(F, 0, 1.6, 7.45, 1.7, 3.2, .2, '#4a2f1c'); B.cyl(F, 0, 3.2, 7.45, .85, .85, .2, '#4a2f1c');
    B.box(F, 0, 9.5, 7.45, .9, 1.8, .15, '#2b2420');
    for (const z of [-7, -4, -1, 2]) for (const x of [-3.55, 3.55]) B.box(F, x, 3.8, z, .15, 2, .8, '#7aa0c8');
  };

  M.windmill = function(B, ctx, o){
    const F = B.frame(o.x, o.y, o.z, o.yaw, o.s ?? 1);
    B.cyl(F, 0, 4, 0, 2, 2.8, 8, o.wall ?? '#d2c2a2', 16);
    B.cyl(F, 0, 9.4, 0, 0, 2.6, 2.8, '#a8452f', 16);
    B.box(F, 0, 1.1, 2.6, 1.2, 2.2, .3, '#5a3a22');
    const S = o.s ?? 1, hub = F.p(0, 8.2, 2.5), sails = new THREE.Group(), parts = [];
    for (let k = 0; k < 4; k++){ const a = k*Math.PI/2;
      parts.push([BOX, [Math.cos(a)*3.4*S, Math.sin(a)*3.4*S, 0], [0, 0, a], [6.6*S, .22*S, .12*S], ctx.col('#6b4426')]);
      parts.push([BOX, [Math.cos(a)*3.9*S + Math.cos(a + Math.PI/2)*.6*S, Math.sin(a)*3.9*S + Math.sin(a + Math.PI/2)*.6*S, .05*S], [0, 0, a], [5*S, 1.1*S, .04*S], ctx.col('#f3ead8')]); }
    parts.push([SPH, [0, 0, 0], 0, .5*S, ctx.col('#4a3020')]);
    const m = new THREE.Mesh(kit.solid(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 })); m.castShadow = true;
    sails.add(m); sails.position.set(hub[0], hub[1], hub[2]); sails.rotation.order = 'YXZ'; sails.rotation.y = o.yaw || 0;
    const spin = new THREE.Group(); sails.add(spin); spin.add(m);
    ctx.scene.add(sails); sails.userData.spin = spin;
    return sails;
  };

  M.tool = function(ctx, kind){
    const c = ctx.col, C = kit.cyl, parts = [], wood = c('#8a5a32'), iron = c('#9aa1a8');
    if (kind === 'sack'){ parts.push([SPH, [0, -.32, .05], 0, [.26, .3, .22], c('#d9c79a')], [C(.05, .1, 8), [0, -.02, .05], 0, [1, .12, 1], c('#c9b584')]); }
    else {
      parts.push([C(.035, .04, 8), [0, .55, 0], 0, [1, 1.75, 1], wood]);
      if (kind === 'hoe') parts.push([BOX, [-.12, 1.4, 0], [0, 0, .25], [.3, .07, .2], iron]);
      if (kind === 'pitchfork'){ parts.push([BOX, [0, 1.42, 0], 0, [.3, .05, .05], iron]); for (const x of [-.13, 0, .13]) parts.push([C(.016, .02, 6), [x, 1.62, 0], 0, [1, .4, 1], iron]); }
      if (kind === 'scythe') parts.push([BOX, [-.32, 1.4, 0], [0, 0, -.25], [.7, .09, .03], iron]);
      if (kind === 'torch'){ parts.push([C(.08, .06, 10), [0, 1.42, 0], 0, [1, .18, 1], c('#4a3020')]);
        const fl = new THREE.Mesh(kit.solid([[SPH, [0, 1.62, 0], 0, [.1, .2, .1], new THREE.Color(5, 2.2, .5)], [SPH, [0, 1.58, 0], 0, [.13, .12, .13], new THREE.Color(4, 1, .2)]]), ctx.glowMaterial || new THREE.MeshBasicMaterial({ vertexColors: true }));
        const g = new THREE.Group(); g.add(new THREE.Mesh(kit.solid(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7 })), fl); return g; }
    }
    return new THREE.Mesh(kit.solid(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, metalness: kind === 'sack' ? 0 : .15 }));
  };

  M.fence = function(B, pts, h = 1.1, y = () => 0){
    for (let i = 0; i < pts.length - 1; i++){
      const [ax, az] = pts[i], [bx, bz] = pts[i+1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L/2.4)), ry = -Math.atan2(bz - az, bx - ax);
      for (let k = 0; k <= n; k++){ const x = ax + (bx - ax)*k/n, z = az + (bz - az)*k/n; B.box(B.frame(x, y(x, z), z), 0, h/2, 0, .16, h, .16, '#7a5233'); }
      for (const hh of [h*.45, h*.85]){ const x = (ax + bx)/2, z = (az + bz)/2; B.box(B.frame(x, y(x, z), z, ry), 0, hh, 0, L, .1, .07, '#8a6040'); }
    }
  };
  M.stack = (B, x, y, z, s = 1) => { const F = B.frame(x, y, z, 0, s); B.cyl(F, 0, .8, 0, 1.25, 1.4, 1.6, '#e2bb52', 14); B.cyl(F, 0, 2.1, 0, 0, 1.3, 1.2, '#d6ab43', 14); };
  M.sack = (B, x, y, z, s = 1) => { const F = B.frame(x, y, z, 0, s); B.ball(F, 0, .32, 0, .3, .36, .26, '#d9c79a'); B.cyl(F, 0, .7, 0, .06, .12, .14, '#c9b584', 8); };
  M.cart = function(B, o){
    const F = B.frame(o.x, o.y, o.z, o.yaw, o.s ?? 1), wood = '#8a5a32';
    B.box(F, 0, .9, 0, 1.6, .15, 2.4, wood);
    for (const x of [-.8, .8]) B.box(F, x, 1.15, 0, .1, .45, 2.4, wood);
    for (const z of [-1.2, 1.2]) B.box(F, 0, 1.15, z, 1.6, .45, .1, wood);
    for (const x of [-.95, .95]){ const p = F.p(x, .55, -.3); B.parts.push([kit.cyl(.55, .55, 16), p, [0, F.yaw, Math.PI/2], [F.s, .12*F.s, F.s], B.col('#5a3a22')]); }
    for (const x of [-.45, .45]) B.box(F, x, .8, 2.1, .1, .1, 1.8, wood);
  };
})();
