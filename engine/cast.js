/* Characters from glTF models: skinned, animated as a pure function of time, repainted per character, with accessories
   on bones. Made for the series "X, explained using Fortnite" (videos/010-…); any video can use it.
   Load after engine.js and three r128's examples/js/loaders/GLTFLoader.js + examples/js/utils/SkeletonUtils.js.

   Models are built by tools/build-models.mjs into models/build/<pack>__<Name>.js (classic scripts that register
   window.TC_MODELS, so pages open from disk). Parsing is async, so a page starts the engine once they are ready:
     Engine.cast.load(['kaykit-adventurers/Knight', 'kaykit-adventurers/Rogue']).then(() => Engine.create({...}));
   Each pack's animation library (<pack>/anims) comes with its first model.

   Engine.cast.make(ctx, spec) -> character { root, body, bone(name), rest, update(t), at(t), state, rim(k) }
     spec.model   'kaykit-adventurers/Knight'       skeleton, body and props come from this model
     spec.keep    ['Knight_Helmet', '1H_Sword']      props (meshes parented to bones: hats, capes, weapons) to keep;
                  every other prop is hidden. Skinned body parts are kept unless listed in spec.drop.
     spec.drop    ['Knight_Cape']                    parts to leave out
     spec.borrow  { Knight_Head: 'kaykit-adventurers/Rogue:Rogue_Head', '+hat': 'kaykit-adventurers/Mage:Mage_Hat' }
                  replace a body part with one from another model of the same pack, or ('+name') add one of its props
     spec.colors  { '0,0': '#f1c9a5', ... }          repaint swatches of the model's colour atlas (column,row of its 8x4
                  grid, row 0 at the top); { 'kaykit-adventurers/Mage': {...} } for parts borrowed from another model
     spec.attach  [{ bone: 'head', object, local }]   (or character.attach(bone, object, local) later) extra objects placed in character space (metres, standing at the
                  origin in the rest pose, facing +z; character.rest has the head bone position and headBox, the head's extent above it; object may be a function rest => Object3D) that then follow the bone. local: true = the object is already in the bone's frame
                  (KayKit hand slots 'handslot.r' / 'handslot.l': +y runs along a held weapon, model units ~ .7 m)
     spec.height  metres from the soles to the top of the head (default 1.6)
     spec.bones   { head: .85, 'upperarm.l': 1.1 }   scale bones (the clips never animate scale), e.g. a smaller head for
                  less chibi proportions; set before measuring the height
     spec.rim     '#ffb02e'                          a rim light in that colour (character.rim(k) sets its strength 0..1)
     spec.keys    [{ t | v, x, z, y, yaw, gait, act, loop, rate, then, look:[x,y,z] }]
       Between two keys at different spots the character travels with the later key's gait ('walk', 'run' or a clip
       name); when the next key is at the same spot it plays the key's act (a clip name, default 'idle') from key.t.
       One-shot clips (everything but idles, walks, runs, '…ing' loops and Cheer, or any clip with loop: false) then go
       back to `then` (default 'idle'); Death*, *_Down and *_Pose clips hold their last frame instead.
       A key may give a speed v (m/s) instead of a time t; with neither, the clip's own pace is used. Walk and run play
       back by the distance covered (stride measured from the clip), so the feet never slide.
       Facing follows the motion, or a key's yaw (0 = +z) when standing still; look turns the head towards a point.
     spec.ground  (x, z) => y   height of the terrain under the feet (optional)
   Clip times and weights are set, never advanced, so seeks and exports match live playback; clips blend over .25 s.
   Engine.cast.clips(pack) lists a pack's clip names. */
(function(){
  'use strict';
  const THREE = window.THREE, E = window.Engine;
  if (!THREE || !E) { console.error('cast.js: load three.js and engine.js first'); return; }
  const { clamp, smooth } = E;
  const BUILD_URL = document.currentScript ? new URL('../models/build/', document.currentScript.src).href : '';
  const MODELS = window.TC_MODELS = window.TC_MODELS || {};
  const T = {}, CLIPS = {}, STRIDE = {};          // parsed templates, clips per pack, measured gait speeds
  const GAIT = { walk: 'Walking_A', run: 'Running_A', idle: 'Idle' };
  const LOOPS = /Idle|Walking|Running|ing(_[A-Z])?$|^Cheer$/, HOLDS = /Death|_Down$|_Pose$/, BLEND = .25;
  const san = n => THREE.PropertyBinding.sanitizeNodeName(n);
  const packOf = name => name.split('/')[0];

  function script(name){
    return MODELS[name] ? Promise.resolve() : new Promise(done => {
      const s = document.createElement('script'); s.src = BUILD_URL + name.replace('/', '__') + '.js';
      s.onload = done; s.onerror = () => { console.warn('Model not found: ' + name + ' (run node tools/build-models.mjs)'); done(); };
      document.head.appendChild(s);
    });
  }
  function parse(name){
    const m = MODELS[name]; if (!m) return Promise.resolve(null);
    const bin = atob(m.glb), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Promise((ok, fail) => new THREE.GLTFLoader().parse(u.buffer, '', ok, fail));
  }
  async function loadOne(name){
    if (T[name]) return;
    await script(name);
    const gltf = await parse(name); if (!gltf) return;
    let img = null;
    if (MODELS[name].atlas){ img = new Image(); img.src = 'data:image/png;base64,' + MODELS[name].atlas; await img.decode(); }
    gltf.scene.updateMatrixWorld(true);
    T[name] = { name, scene: gltf.scene, img };
  }
  async function loadPack(pack){
    if (CLIPS[pack]) return;
    const name = pack + '/anims';
    await script(name); const gltf = await parse(name);
    CLIPS[pack] = {}; if (gltf) for (const c of gltf.animations) CLIPS[pack][c.name] = c;
  }

  // ---------- atlas repaint: each swatch keeps its light-to-dark gradient, tinted to the new colour ----------
  const texCache = new Map();
  function atlasTexture(tpl, colors){
    const key = tpl.name + JSON.stringify(colors || {});
    if (texCache.has(key)) return texCache.get(key);
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(tpl.img, 0, 0, S, S);
    for (const [cell, hex] of Object.entries(colors || {})){
      const [cx, cy] = cell.split(',').map(Number), w = S/8, h = S/4, x0 = cx*w, y0 = cy*h;
      const d = g.getImageData(x0, y0, w, h), p = d.data, c = new THREE.Color(hex);
      let mean = 0; for (let i = 0; i < p.length; i += 4) mean += .2126*p[i] + .7152*p[i+1] + .0722*p[i+2]; mean /= p.length/4;
      for (let i = 0; i < p.length; i += 4){ const k = (.2126*p[i] + .7152*p[i+1] + .0722*p[i+2])/Math.max(1, mean);
        p[i] = clamp(c.r*255*k, 0, 255); p[i+1] = clamp(c.g*255*k, 0, 255); p[i+2] = clamp(c.b*255*k, 0, 255); }
      g.putImageData(d, x0, y0);
    }
    const t = new THREE.CanvasTexture(cv); t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    texCache.set(key, t); return t;
  }

  // ---------- gait speed: how fast a planted foot slides back in the clip (model units / s at rate 1) ----------
  function stride(pack, clipName){
    const k = pack + '|' + clipName; if (STRIDE[k]) return STRIDE[k];
    const clip = CLIPS[pack][clipName], tpl = Object.values(T).find(x => packOf(x.name) === pack);
    const root = THREE.SkeletonUtils.clone(tpl.scene), mixer = new THREE.AnimationMixer(root), a = mixer.clipAction(clip); a.play();
    const feet = ['foot.l', 'foot.r'].map(n => root.getObjectByName(san(n))), N = 64, P = [], v = new THREE.Vector3();
    for (let i = 0; i <= N; i++){ a.time = clip.duration*i/N; mixer.update(0); root.updateMatrixWorld(true); P.push(feet.map(f => f.getWorldPosition(v).toArray())); }
    let sum = 0, n = 0;
    for (const f of [0, 1]){
      const ys = P.map(p => p[f][1]), lo = Math.min(...ys), hi = Math.max(...ys);
      for (let i = 0; i < N; i++) if (P[i][f][1] < lo + .15*(hi - lo) && P[i+1][f][1] < lo + .15*(hi - lo)){ sum += (P[i][f][2] - P[i+1][f][2])/(clip.duration/N); n++; }
    }
    return STRIDE[k] = Math.max(.2, n ? sum/n : 1);
  }

  // ---------- assembly ----------
  function boneMap(root){ const m = {}; root.traverse(o => { if (o.isBone) m[o.name] = o; }); return m; }
  // all skinned parts become one SkinnedMesh (one draw call per atlas): their skin indices are remapped by bone name
  function mergeSkinned(parts, skeleton, mats){
    const bi = {}; skeleton.bones.forEach((b, i) => { bi[b.name] = i; });
    const P = [], N = [], U = [], SI = [], SW = [], I = [], groups = [];
    let base = 0;
    for (const { mesh, mat } of parts){
      const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv,
            si = g.attributes.skinIndex, sw = g.attributes.skinWeight, remap = mesh.skeleton.bones.map(b => bi[b.name] ?? 0);
      for (let i = 0; i < pos.count; i++){
        P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(nor.getX(i), nor.getY(i), nor.getZ(i)); U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        SI.push(remap[si.getX(i)], remap[si.getY(i)], remap[si.getZ(i)], remap[si.getW(i)]); SW.push(sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i));
      }
      const start = I.length;
      if (g.index) for (let i = 0; i < g.index.count; i++) I.push(base + g.index.getX(i)); else for (let i = 0; i < pos.count; i++) I.push(base + i);
      const mi = mats.indexOf(mat), last = groups[groups.length - 1];
      if (last && last.m === mi) last.count += I.length - start; else groups.push({ start, count: I.length - start, m: mi });
      base += pos.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    geo.setIndex(I); groups.forEach(g => geo.addGroup(g.start, g.count, g.m));
    geo.computeBoundingSphere(); geo.boundingSphere.radius *= 1.4;   // room for raised arms and jumps
    return geo;
  }

  function make(ctx, spec){
    const tpl = T[spec.model]; if (!tpl){ console.error('cast: model not loaded: ' + spec.model); return null; }
    const pack = packOf(spec.model), clips = CLIPS[pack] || {};
    const root = THREE.SkeletonUtils.clone(tpl.scene), bones = boneMap(root);
    const drop = new Set(spec.drop || []), keep = new Set(spec.keep || []);
    const colorsFor = name => (spec.colors && spec.colors[name]) || (name === spec.model && spec.colors && !Object.keys(spec.colors).some(k => k.includes('/')) ? spec.colors : null);
    const mats = {}, rimU = { rimColor: { value: new THREE.Color(spec.rim || '#ffffff').convertSRGBToLinear() }, rimK: { value: 0 } };
    const material = (tplName, skinned) => { const k = tplName + (skinned ? '|s' : '');
      if (!mats[k]){ const m = mats[k] = new THREE.MeshStandardMaterial({ map: atlasTexture(T[tplName], colorsFor(tplName)), roughness: .62, metalness: 0, skinning: skinned, envMapIntensity: .7 });
        if (spec.rim) m.onBeforeCompile = sh => { Object.assign(sh.uniforms, rimU);
          sh.fragmentShader = 'uniform vec3 rimColor; uniform float rimK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n totalEmissiveRadiance += rimColor*rimK*pow(1. - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0., 1.), 3.2);'); }; }
      return mats[k]; };
    const skinned = [], props = [];
    root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); else if (o.isMesh) props.push(o); });
    let skeleton = skinned[0].skeleton, bindMatrix = skinned[0].bindMatrix.clone();
    const parts = [];
    for (const m of skinned){
      if (drop.has(m.name)) continue;
      const b = spec.borrow && spec.borrow[m.name];
      if (b){ const [mn, pn] = b.split(':'), src = T[mn] && T[mn].scene.getObjectByName(pn);
        if (src) parts.push({ mesh: src, mat: material(mn, true) }); else console.warn('cast: no part ' + b); }
      else parts.push({ mesh: m, mat: material(spec.model, true) });
    }
    const matList = [...new Set(parts.map(p => p.mat))];
    const body = new THREE.SkinnedMesh(mergeSkinned(parts, skeleton, matList), matList.length > 1 ? matList : matList[0]);
    body.name = 'body'; body.castShadow = body.receiveShadow = true;
    skinned.forEach(m => m.parent && m.parent.remove(m));
    root.add(body); body.bind(skeleton, bindMatrix);
    for (const p of props){
      if (!keep.has(p.name) || drop.has(p.name)){ p.parent.remove(p); continue; }
      p.material = material(spec.model, false); p.castShadow = p.receiveShadow = true;
    }
    for (const [k, b] of Object.entries(spec.borrow || {})) if (k[0] === '+'){
      const [mn, pn] = b.split(':'), src = T[mn] && T[mn].scene.getObjectByName(pn);
      if (!src || !src.parent || !bones[src.parent.name]){ console.warn('cast: no prop ' + b); continue; }
      const c = src.clone(); c.material = material(mn, false); c.castShadow = c.receiveShadow = true; bones[src.parent.name].add(c);
    }
    for (const [n, k] of Object.entries(spec.bones || {})){ const b = bones[san(n)]; if (b) b.scale.multiplyScalar(k); }
    // size: soles to the top of the head in the rest pose (bone scales included)
    root.updateMatrixWorld(true);
    const box = new THREE.Box3(), v = new THREE.Vector3(), pa = body.geometry.attributes.position;
    skeleton.update();
    const head = bones[san('head')], hy = head.getWorldPosition(new THREE.Vector3()).y, headBox = new THREE.Box3();
    for (let i = 0; i < pa.count; i++){ body.boneTransform(i, v).applyMatrix4(body.matrixWorld); box.expandByPoint(v); if (v.y > hy) headBox.expandByPoint(v); }
    const scale = (spec.height ?? 1.6)/(box.max.y - Math.min(0, box.min.y));
    root.scale.setScalar(scale); root.updateMatrixWorld(true);
    const headPos = head.getWorldPosition(new THREE.Vector3());
    headBox.min.multiplyScalar(scale); headBox.max.multiplyScalar(scale);
    const rest = { height: spec.height ?? 1.6, head: headPos.clone(), headBox, top: box.max.y*scale, scale };
    // attachments: given in character space at rest, re-expressed in the bone's frame
    const inv = new THREE.Matrix4(), restM = {};
    for (const n in bones) restM[n] = bones[n].matrixWorld.clone();   // rest pose, root at the origin
    function attach(boneName, o, local){   // o: Object3D in character space at rest, or rest => Object3D; local: already in bone space
      const bone = bones[san(boneName)]; if (!bone){ console.warn('cast: no bone ' + boneName); return null; }
      if (typeof o === 'function') o = o(rest);
      if (local){ o.traverse(x => { if (x.isMesh){ x.castShadow = true; x.receiveShadow = true; } }); bone.add(o); return o; }
      o.updateMatrix(); o.matrix.premultiply(inv.copy(restM[bone.name]).invert()); o.matrix.decompose(o.position, o.quaternion, o.scale);
      o.traverse(x => { if (x.isMesh){ x.castShadow = true; x.receiveShadow = true; } });
      bone.add(o); return o;
    }
    for (const a of spec.attach || []) attach(a.bone, a.object, a.local);
    ctx.scene.add(root);

    // ---------- motion: keys -> path, facing and clip segments ----------
    const resolve = n => clips[GAIT[n] || n] ? (GAIT[n] || n) : GAIT.idle;
    const natural = clip => stride(pack, clip)*scale;   // m/s at rate 1
    const K = (spec.keys && spec.keys.length ? spec.keys : [{ t: 0, x: 0, z: 0 }]).map(k => Object.assign({}, k));
    K[0].t = K[0].t ?? 0; K[0].d = 0; K[0].x = K[0].x ?? 0; K[0].z = K[0].z ?? 0;
    for (let i = 1; i < K.length; i++){ const a = K[i-1], b = K[i]; if (b.x === undefined){ b.x = a.x; b.z = a.z; }
      const L = Math.hypot(b.x - a.x, b.z - a.z); b.d = a.d + L;
      if (b.t == null) b.t = a.t + (L > .02 ? L/(b.v || natural(resolve(b.gait || 'walk'))) : .3);
      if (b.t <= a.t) console.warn(`cast: ${spec.model} key ${i} at ${b.t.toFixed(2)} s is not after key ${i-1} (${a.t.toFixed(2)} s): too far to walk in time?`); }
    let yaw = K[0].yaw ?? 0;
    const segs = [];
    K.forEach((k, i) => {
      const n = K[i+1], moving = !!n && Math.hypot(n.x - k.x, n.z - k.z) > .02;
      if (moving) yaw = Math.atan2(n.x - k.x, n.z - k.z); else if (k.yaw != null) yaw = k.yaw;
      k.face = yaw; k.moving = moving; k.lookAt = moving ? n.look : k.look;
      if (moving){ segs.push({ t0: k.t, clip: resolve(n.gait || 'walk'), gait: true }); return; }
      const clip = resolve(k.act || 'idle'), loop = k.loop ?? LOOPS.test(clip), rate = k.rate || 1;
      segs.push({ t0: k.t, clip, loop, rate, hold: HOLDS.test(clip) });
      const end = k.t + clips[clip].duration/rate;
      if (!loop && !HOLDS.test(clip) && (!n || end < n.t)){ const th = resolve(k.then || 'idle'); segs.push({ t0: end, clip: th, loop: LOOPS.test(th), rate: 1, hold: HOLDS.test(th) }); }
    });
    const mixer = new THREE.AnimationMixer(root), actions = {};
    for (const s of segs) if (!actions[s.clip]){ const a = actions[s.clip] = mixer.clipAction(clips[s.clip]); a.play(); a.weight = 0; }
    const dist = t => { let i = 0; while (i < K.length - 1 && t >= K[i+1].t) i++; const k = K[i], n = K[i+1];
      return (!k.moving || t < k.t) ? k.d : k.d + (n.d - k.d)*clamp((t - k.t)/(n.t - k.t), 0, 1); };
    const local = (s, t) => { const dur = clips[s.clip].duration || 1e-3;
      if (s.gait) return (dist(t)/natural(s.clip)) % dur;
      const u = Math.max(0, t - s.t0)*s.rate;
      return s.loop ? u % dur : Math.min(u, dur - 1e-4); };
    const state = { x: 0, y: 0, z: 0, yaw: 0, clip: '', moving: false }, headQ = head.quaternion.clone();
    const q = new THREE.Quaternion(), qp = new THREE.Quaternion(), qi = new THREE.Quaternion(), e = new THREE.Euler(), hv = new THREE.Vector3();
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    function at(t){
      let i = 0; while (i < K.length - 1 && t >= K[i+1].t) i++;
      const k = K[i], n = K[i+1], p = K[i-1];
      if (k.moving && t > k.t){ const u = clamp((t - k.t)/(n.t - k.t), 0, 1); state.x = k.x + (n.x - k.x)*u; state.z = k.z + (n.z - k.z)*u; state.y = (k.y ?? 0) + ((n.y ?? k.y ?? 0) - (k.y ?? 0))*u; }
      else { state.x = k.x; state.z = k.z; state.y = k.y ?? 0; }
      if (spec.ground) state.y += spec.ground(state.x, state.z);
      state.yaw = p ? p.face + wrap(k.face - p.face)*smooth(k.t, k.t + .4, t) : k.face;
      state.moving = k.moving && t > k.t; state.look = k.lookAt;
      return state;
    }
    function update(t){
      at(t);
      root.position.set(state.x, state.y, state.z); root.rotation.set(0, state.yaw, 0);
      if (ctx.fast) return;
      let j = 0; while (j < segs.length - 1 && t >= segs[j+1].t0) j++;
      const s = segs[j], pr = segs[j-1], w = pr ? smooth(s.t0, s.t0 + BLEND, t) : 1;
      for (const k in actions) actions[k].weight = 0;
      const A = actions[s.clip]; state.clip = s.clip;
      if (pr && w < 1 && pr.clip !== s.clip){ const B = actions[pr.clip]; B.time = local(pr, t); B.weight = 1 - w; A.weight = w; }
      else A.weight = 1;
      A.time = local(s, t);
      head.quaternion.copy(headQ);         // the look turn below is added on top of the clip: never let it accumulate
      mixer.update(0);
      if (state.look){                     // turn the head towards a point (on top of the clip), clamped
        root.updateMatrixWorld(true);
        head.getWorldPosition(hv); const dx = state.look[0] - hv.x, dy = state.look[1] - hv.y, dz = state.look[2] - hv.z;
        const yw = clamp(wrap(Math.atan2(dx, dz) - state.yaw), -1, 1), pt = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.45, .45);
        e.set(-pt, state.yaw + yw, 0, 'YXZ'); q.setFromEuler(e); e.set(0, state.yaw, 0); qi.setFromEuler(e).invert(); q.multiply(qi);   // world-space turn
        head.parent.getWorldQuaternion(qp); head.quaternion.premultiply(qp).premultiply(q).premultiply(qp.invert());
      }
    }
    update(0);
    return { root, body, rest, state, update, at, keys: K, bone: n => bones[san(n)], duration: c => (clips[resolve(c)] || {}).duration || 0,
      rim(k){ rimU.rimK.value = k; }, attach };
  }

  E.cast = {
    load(names){ const packs = [...new Set(names.map(packOf))];
      return Promise.all(names.map(loadOne)).then(() => Promise.all(packs.map(loadPack))); },
    make,
    clips: pack => Object.keys(CLIPS[pack] || {}),
    stride: (pack, clip) => stride(pack, clip),
    templates: T,
  };
})();
