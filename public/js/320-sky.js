  // ================= Sky =================
  const skyKeys = [
    // dawn and dusk are short (about a minute and a half each at 20 minutes a day)
    // a clear blue by day, warm at sunrise and sunset, deep blue at night
    [0, 0x283450, 0x7E8AAE, .1], [.21, 0x34425E, 0x8E9AB8, .12], [.25, 0xF0B9A0, 0xFFD2A8, .5], [.29, 0xA9D0EA, 0xFFF1DC, .9],
    [.5, 0x8EC3EA, 0xFFF6E6, 1], [.71, 0xA7CDE8, 0xFFE9C8, .85], [.75, 0xE89A7E, 0xFFB38A, .5], [.79, 0x3E4868, 0x9CA3C4, .12], [1, 0x283450, 0x7E8AAE, .1]
  ];
  const cA = new THREE.Color(), cB = new THREE.Color(), skyCol = new THREE.Color(), sunCol = new THREE.Color();
  function sky(tt) {
    let i = 0; while (i < skyKeys.length - 2 && tt > skyKeys[i + 1][0]) i++;
    const a = skyKeys[i], b = skyKeys[i + 1], f = (tt - a[0]) / (b[0] - a[0]);
    skyCol.copy(cA.set(a[1])).lerp(cB.set(b[1]), f);
    sunCol.copy(cA.set(a[2])).lerp(cB.set(b[2]), f);
    return a[3] + (b[3] - a[3]) * f;
  }

