// Series "X, explained using Fortnite": the fixed cast. Every episode loads this file (../_series-fortnite/cast-list.js),
// so each character looks the same in every era; an episode only gives them a role ("The king", "The dictator"...).
// Bodies: KayKit Adventurers (CC0, models/kaykit-adventurers), repainted per character; hats, crowns and plumes are built
// here and ride on the head bone. Rarity = the character's colour everywhere (beam, rim light, card).
//   CAST.models              every model file to load (Engine.cast.load(CAST.models))
//   CAST.byId[id]            { id, name, rarity, role, line, gesture: [[clip, delay s], ...] }
//   CAST.spec(id, ctx, o)    the Engine.cast.make spec (model, parts, colours, accessories); o overrides (height...)
//   CAST.extra(ctx, o)       a random Common villager (body, clothes, hair and skin from shuffled palettes; ctx.R)
window.CAST = (function(){
  'use strict';
  const P = 'kaykit-adventurers/';
  const LIST = [
    { id: 'pip', name: 'Pip Turnip', rarity: 'common', role: 'The peasant', line: 'Always pays. Always hopeful.',
      gesture: [['Cheer', 0]] },
    { id: 'clank', name: 'Sir Clank', rarity: 'rare', role: 'The knight', line: 'Loyal to whoever gave him the land.',
      gesture: [['1H_Melee_Attack_Chop', 0], ['Cheer', 1.15]] },
    { id: 'goldie', name: 'Goldie Crownsworth', rarity: 'legendary', role: 'The king', line: 'Owns everything. Earned nothing.',
      gesture: [['Spellcast_Raise', 0]] },
    { id: 'ledger', name: 'Baron Ledger', rarity: 'epic', role: 'The lord', line: 'Will tax your tax.',
      gesture: [['Interact', 0]] },
    { id: 'rook', name: 'Rook', rarity: 'uncommon', role: 'The rebel', line: 'Has questions. Has a torch.',
      gesture: [['Throw', 0]] },
  ];
  const byId = {}; LIST.forEach(c => { byId[c.id] = c; });

  // ---------- accessories, sized from the head (rest.headBox: the head's extent above the head bone) ----------
  const T = window.THREE;
  function solid(parts, mat){ const m = new T.Mesh(Engine.kit.solid(parts), mat); m.castShadow = true; return m; }
  const headFrame = rest => { const b = rest.headBox; return { w: b.max.x - b.min.x, top: b.max.y, cz: (b.min.z + b.max.z)/2, h: b.max.y - b.min.y }; };
  function strawHat(ctx){ return rest => {
    const { w, top, cz, h } = headFrame(rest), C = Engine.kit.cyl, c = ctx.col, y = top - h*.2;
    const g = solid([[C(w*.66, w*.7, 28), [0, y, cz], 0, [1, w*.035, 1], c('#e7c35f')], [C(w*.3, w*.38, 24), [0, y + w*.13, cz], 0, [1, w*.24, 1], c('#efcf6e')],
      [C(w*.385, w*.385, 24), [0, y + w*.05, cz], 0, [1, w*.07, 1], c('#b5402f')]], new T.MeshStandardMaterial({ vertexColors: true, roughness: .85 }));
    g.rotation.x = -.14; g.position.y = 0; return g; }; }
  function crown(ctx){ return rest => {
    const { w, top, cz, h } = headFrame(rest), C = Engine.kit.cyl, SPH = Engine.kit.SPH, c = ctx.col, y = top - h*.08, r = w*.29, parts = [];
    parts.push([C(r, r*.94, 28), [0, y, cz], 0, [1, w*.15, 1], c('#ffc63a')]);
    for (let k = 0; k < 6; k++){ const a = k/6*Math.PI*2; parts.push([C(0, w*.075, 4), [Math.sin(a)*r*.95, y + w*.15, cz + Math.cos(a)*r*.95], [0, a, 0], [1, w*.18, 1], c('#ffc63a')]);
      parts.push([SPH, [Math.sin(a)*r*.98, y + w*.27, cz + Math.cos(a)*r*.98], 0, w*.028, c('#fff1b0')]); }
    for (const [a, col] of [[0, '#e0263b'], [1.05, '#2f6fe0'], [-1.05, '#2f6fe0']]) parts.push([SPH, [Math.sin(a)*r*1.0, y, cz + Math.cos(a)*r*1.0], 0, [w*.05, w*.05, w*.03], c(col)]);
    const g = solid(parts, new T.MeshStandardMaterial({ vertexColors: true, roughness: .28, metalness: .7, envMapIntensity: 1.2 }));
    g.rotation.z = .08; return g; }; }
  function plume(ctx, col){ return rest => {
    const { w, top, cz } = headFrame(rest), SPH = Engine.kit.SPH, c = ctx.col, parts = [];
    for (let k = 0; k < 6; k++) parts.push([SPH, [0, top + w*(.16 + k*.07), cz - w*(.05 + k*.09)], [-.5 - k*.12, 0, 0], [w*.07, w*.17, w*.07], c(col)]);
    return solid(parts, new T.MeshStandardMaterial({ vertexColors: true, roughness: .7 })); }; }

  function spec(id, ctx, o = {}){
    const base = {
      pip: { model: P + 'Rogue', drop: ['Rogue_Cape'], height: 1.5,
        colors: { '0,1': '#b58c5c', '1,1': '#8a6440', '3,2': '#5e4b3a', '5,2': '#c9a173', '7,1': '#5a3a24' },
        attach: [{ bone: 'head', object: strawHat(ctx) }] },
      clank: { model: P + 'Knight', keep: ['Knight_Helmet', 'Knight_Cape', '1H_Sword', 'Round_Shield'], height: 1.68,
        colors: { '0,1': '#2a6ad1', '6,1': '#2a5fb8' },
        attach: [{ bone: 'head', object: plume(ctx, '#38a6ff') }] },
      goldie: { model: P + 'Mage', keep: ['Mage_Cape'], height: 1.62,
        borrow: { Mage_Head: P + 'Barbarian:Barbarian_Head' },
        colors: { [P + 'Mage']: { '0,1': '#b3262f', '2,1': '#f2b632', '3,2': '#4a2a5a', '4,0': '#f2c14e' }, [P + 'Barbarian']: { '0,0': '#efbf98', '1,0': '#c9702a' } },
        attach: [{ bone: 'head', object: crown(ctx) }] },
      ledger: { model: P + 'Mage', keep: ['Mage_Cape'], height: 1.66,
        colors: { '0,1': '#5b2a8c', '2,1': '#2d1546', '3,2': '#2a2233' } },
      rook: { model: P + 'Rogue_Hooded', keep: ['Rogue_Cape'], height: 1.55,
        colors: { '0,1': '#2f8f3a', '1,1': '#3fae4a' } },
    }[id];
    return Object.assign({ rim: Engine.game.RARITY[byId[id].rarity] }, base, o);
  }

  // ---------- extras: villagers, soldiers, crowds (all Common: earthy undyed cloth) ----------
  const CLOTH = ['#a8865a', '#8c6b48', '#7d8a5a', '#6f5a44', '#b59a72', '#94755a', '#5f6f7d', '#8a4f3a', '#c2a77c', '#6b7a4b', '#9a8f7a', '#7a5a6a'];
  const LEGS = ['#5e4b3a', '#4a4036', '#6b5844', '#3e3a33', '#5a5a52'];
  const HAIR = ['#2a1d14', '#4a2f1c', '#6b4426', '#9a6a3a', '#c9a46a', '#b5652e', '#3a3a3a', '#d8d2c6'];
  const SKIN = ['#f3cfb0', '#e8b896', '#d9a27c', '#c68b62', '#a8704c', '#f6dcc6'];
  const BODIES = [
    { model: P + 'Rogue', drop: ['Rogue_Cape'], cloth: ['0,1', '1,1'], legs: '3,2' },
    { model: P + 'Barbarian', cloth: ['6,0', '0,1'], legs: '3,2' },
    { model: P + 'Knight', cloth: ['3,0', '7,0'], legs: '7,1' },
    { model: P + 'Mage', cloth: ['0,1', '2,1'], legs: '3,2' },
  ];
  function extra(ctx, o = {}){
    const b = o.body != null ? BODIES[o.body] : ctx.pick(BODIES), colors = { '0,0': ctx.pick(SKIN), '1,0': ctx.pick(HAIR), [b.legs]: ctx.pick(LEGS) };
    const cloth = ctx.pick(CLOTH); colors[b.cloth[0]] = cloth; colors[b.cloth[1]] = ctx.pick(CLOTH);
    return Object.assign({ model: b.model, drop: b.drop || [], keep: [], height: ctx.R(1.35, 1.6), colors }, o.spec || {});
  }

  return { list: LIST, byId, spec, extra, models: [P + 'Rogue', P + 'Knight', P + 'Mage', P + 'Barbarian', P + 'Rogue_Hooded'] };
})();
