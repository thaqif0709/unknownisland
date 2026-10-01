  // ================= Flowers and little plants (decoration only) =================
  // Built per chunk near you. Each species grows where it likes: sea pinks on the
  // sand, daisies and tulips in the meadows, mushrooms and ferny tufts in the
  // forest, bluebells by the springs, lavender in the highlands.
  const decorLambert = c => soft(c, { depthWrite: false });
  const DG = {
    stem: (() => { const g = new THREE.CylinderGeometry(.018, .022, 1, 5); g.translate(0, .5, 0); return g; })(),
    puff: new THREE.SphereGeometry(.1, 7, 5),
    petals: new THREE.CylinderGeometry(.13, .13, .03, 8),
    dot: new THREE.SphereGeometry(.05, 6, 4),
    cup: (() => { const g = new THREE.SphereGeometry(.09, 8, 5, 0, Math.PI * 2, 0, Math.PI * .62); g.rotateX(Math.PI); g.translate(0, .07, 0); return g; })(),
    bell: new THREE.SphereGeometry(.055, 6, 4),
    spike: new THREE.CylinderGeometry(.035, .05, .28, 8),
    cap: new THREE.SphereGeometry(.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
    tuft: new THREE.ConeGeometry(.07, .32, 5),
    // a toadstool: a stout stem that bulges a little, a round cap with a curled-under rim, pale gills beneath
    mStem: (() => { const pr = [[.05, 0], [.058, .04], [.052, .1], [.045, .15], [.05, .17]].map(([r, y]) => new THREE.Vector2(r, y)); return new THREE.LatheGeometry(pr, 12); })(),
    // (points run from the rim up to the crown, so the cap's surface faces outward)
    mCap: (() => { const pr = [[.14, .02], [.165, .015], [.17, .035], [.15, .07], [.11, .12], [.06, .15], [.001, .16]].map(([r, y]) => new THREE.Vector2(r, y)); return new THREE.LatheGeometry(pr, 16); })(),
    mGills: (() => { const g = new THREE.CylinderGeometry(.14, .06, .02, 16); return g; })(),
    mSpot: (() => { const g = new THREE.SphereGeometry(.026, 6, 4); g.scale(1, .45, 1); return g; })(),
  };
  const DM = { stem: decorLambert(0x6F8F5A), tint: decorLambert(0xFFFFFF), yellow: decorLambert(0xE0A33A), lav: decorLambert(0x8C7BA8),
    // mushrooms are solid little objects: their parts need normal depth so the cap hides what's under it
    mushStem: soft(0xEFE3C8), gills: soft(0xE6D2B0), mushCap: soft(0xFFFFFF), mushSpot: soft(0xFFFFFF), white: decorLambert(0xFFFFFF), tuftA: decorLambert(0x7F9A64), tuftB: decorLambert(0x93A873) };
  const decorCols = a => a.map(c => new THREE.Color(c));
  // species: which biomes, how many per chunk, and its parts [geometry, material, y, colours, scale]
  const DECOR = [
    { biomes: ['beach'], n: 14, parts: [[DG.stem, DM.stem, 0, null, [1, .14, 1]], [DG.puff, DM.tint, .15, decorCols(['#D9A09A', '#C98A86', '#E8C0B4'])]] },
    { biomes: ['meadow'], n: 34, parts: [[DG.stem, DM.stem, 0, null, [1, .22, 1]], [DG.petals, DM.tint, .22, decorCols(['#F3EAD6'])], [DG.dot, DM.yellow, .24]] },
    { biomes: ['meadow'], n: 22, parts: [[DG.stem, DM.stem, 0, null, [1, .32, 1]], [DG.cup, DM.tint, .32, decorCols(['#C4574F', '#E0A33A', '#D98C8C', '#8C7BA8', '#F1E6CC'])]] },
    { biomes: ['spring', 'forest'], n: 14, parts: [[DG.stem, DM.stem, 0, null, [1, .2, 1]], [DG.bell, DM.tint, .2, decorCols(['#5F7FA8', '#7E97B8', '#4F6687'])]] },
    { biomes: ['highland'], n: 30, parts: [[DG.stem, DM.stem, 0, null, [1, .18, 1]], [DG.spike, DM.lav, .3]] },
    // toadstools: stem, gills, cap and a few white spots (the spots sit on the cap's curve, off-centre)
    { biomes: ['forest'], n: 16, parts: [[DG.mStem, DM.mushStem, 0], [DG.mGills, DM.gills, .158], [DG.mCap, DM.mushCap, .15, decorCols(['#B8504A', '#C0704F', '#C9623E'])],
      [DG.mSpot, DM.mushSpot, .308, null, null, [.03, -.02]], [DG.mSpot, DM.mushSpot, .292, null, null, [-.07, .03]], [DG.mSpot, DM.mushSpot, .276, null, null, [.05, .09]],
      [DG.mSpot, DM.mushSpot, .269, null, null, [-.02, -.11]], [DG.mSpot, DM.mushSpot, .254, null, null, [.12, -.03]]] },
    { biomes: ['meadow', 'forest', 'highland', 'spring'], n: 40, parts: [[DG.tuft, DM.tuftA, .14], [DG.tuft, DM.tuftB, .12, null, [.8, .8, .8]]] },
  ];
  const dummy = new THREE.Object3D();
  function buildDecor(cx, cz) {
    const out = [], r = mulberry32((cx * 92821) ^ (cz * 68917) ^ 0x51f1);
    DECOR.forEach(sp => {
      const spots = [];
      for (let i = 0; i < sp.n * 2 && spots.length < sp.n; i++) {
        const x = cx * CH + r() * CH, z = cz * CH + r() * CH, h = heightAt(x, z);
        const sn = WG.nearestSpring(x, z);
        if (Math.hypot(x - sn.x, z - sn.z) < 2.9 || (caveList.length && Caves.groundCut(caveList, x, z, h))) continue;
        if (h > RULES.TEETH.SNOW_LINE - 20 && WG.feature('region-teeth') && WG.regionAt(x, z) === 'teeth') continue;   // nothing flowers in the Teeth's snow (C6)
        if (sp.biomes.includes(WG.biomeAt(x, z, h))) spots.push([x, groundAt(x, z), z, .75 + r() * .5, r() * 6.28, r()]);
      }
      if (!spots.length) return;
      for (const [geo, mat, y, colors, sc, off] of sp.parts) {
        const im = new THREE.InstancedMesh(geo, mat, spots.length);
        spots.forEach(([x, h, z, k, rot, rr], i) => {
          // off: an optional sideways offset, turned with the plant
          const ox = off ? (off[0] * Math.cos(rot) + off[1] * Math.sin(rot)) * k : 0, oz = off ? (-off[0] * Math.sin(rot) + off[1] * Math.cos(rot)) * k : 0;
          dummy.position.set(x + ox, h + y * k, z + oz); dummy.rotation.set(0, rot, 0);
          const v = sc || [1, 1, 1]; dummy.scale.set(v[0] * k, v[1] * k, v[2] * k); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          if (colors) im.setColorAt(i, colors[(rr * colors.length) | 0]);
        });
        im.receiveShadow = true;
        scene.add(im); noInk.add(im); out.push(im);
      }
    });
    return out;
  }

