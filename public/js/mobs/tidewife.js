  // ---- boss: the Tidewife (C1, the Landing's boss; detailed model V15) ----
  // A great crab built from a wreck: a carapace of hull timber and ribs, a bow for a face, eight
  // jointed legs, two heavy claws of wreck beams blanketed in moss and barnacles, lantern
  // eyestalks that blaze when she rears, a torn sail on a broken mast, and kelp hanging off her
  // (gone once it's burned: the snapshot's extra is 1 while it's on her). She rears and crashes
  // down, swings a claw, heaves a beam of the wreck (bossfx 'wreck').
  // The static parts are baked into one mesh per material (100-plants-and-rocks.js `bake`);
  // the claws, eyestalks, kelp and sail stay apart because they move. One light for both
  // lanterns (every light costs every material in view).

  const twM = {
    wood: softShared(0x4b382b), wood2: softShared(0x34271f),
    rot: softShared(0x17120e), moss: softShared(0x35412b), mossDark: softShared(0x263226),
    shell: softShared(0x75614f), shell2: softShared(0x5d493b),
    barn: softShared(0xaaa48f), barnDark: softShared(0x6d685a),
    kelp: softShared(0x344a2e), black: softShared(0x171715),
    rope: softShared(0x75664e), fungus: softShared(0x9a9176),
    eye: new THREE.MeshStandardMaterial({ color: 0x6d4a28, roughness: .45, emissive: 0x4b2108, emissiveIntensity: .35 }),
    eyeLit: new THREE.MeshStandardMaterial({ color: 0xffc35a, roughness: .28, emissive: 0xff7a18, emissiveIntensity: 2.2 }),
    halo: new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: .11, blending: THREE.AdditiveBlending, depthWrite: false }),
    sail: new THREE.MeshStandardMaterial({ color: 0x817967, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: .9 })
  };

  function twAdd(parent, geo, mat, x=0, y=0, z=0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function twLimb(parent, a, b, r0, r1, mat, sides=8) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length(), mid = new THREE.Vector3().addVectors(a,b).multiplyScalar(.5);
    const q = twAdd(parent, new THREE.CylinderGeometry(r1, r0, len, sides), mat, mid.x, mid.y, mid.z);
    q.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d.normalize()); return q;
  }
  function twTube(parent, pts, r0, r1, mat, seg=6) {
    for (let i=0;i<pts.length-1;i++) {
      const t=i/Math.max(1,pts.length-2), rr0=THREE.MathUtils.lerp(r0,r1,t), rr1=THREE.MathUtils.lerp(r0,r1,(i+1)/Math.max(1,pts.length-1));
      twLimb(parent,pts[i],pts[i+1],rr0,rr1,mat,seg);
    }
  }
  function twBlob(parent, x,y,z, sx,sy,sz, mat, detail=1) {
    const q=twAdd(parent,new THREE.IcosahedronGeometry(1,detail),mat,x,y,z); q.scale.set(sx,sy,sz); return q;
  }
  function twPlank(parent,x,y,z,sx,sy,sz,mat,rx=0,ry=0,rz=0) {
    const q=twAdd(parent,new THREE.BoxGeometry(sx,sy,sz),mat,x,y,z); q.rotation.set(rx,ry,rz); return q;
  }

  function twBarnaclePatch(parent, center, normal, spreadX, spreadY, count, seed) {
    const n=normal.clone().normalize(), ref=Math.abs(n.y)<.85?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
    const tangent=new THREE.Vector3().crossVectors(ref,n).normalize(), bitangent=new THREE.Vector3().crossVectors(n,tangent).normalize();
    for(let i=0;i<count;i++){
      const h1=Math.sin((i+1)*127.1+seed*311.7)*43758.5453, h2=Math.sin((i+1)*269.5+seed*183.3)*24634.6345;
      const rx=(h1-Math.floor(h1))*2-1, ry=(h2-Math.floor(h2))*2-1; if((i+seed)%11===0)continue;
      const off=tangent.clone().multiplyScalar(rx*spreadX).add(bitangent.clone().multiplyScalar(ry*spreadY));
      const c=center.clone().add(off).add(n.clone().multiplyScalar(.008)), r=.025+((i*17+seed)%7)*.009, h=.022+((i*11+seed)%5)*.008;
      const q=twAdd(parent,new THREE.CylinderGeometry(r*.64,r,h,7),(i+seed)%5===0?twM.barnDark:twM.barn,c.x,c.y,c.z);
      q.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n);
      const cap=c.clone().add(n.clone().multiplyScalar(h*.52));
      const hole=twAdd(parent,new THREE.CylinderGeometry(r*.26,r*.34,.006,7),twM.black,cap.x,cap.y,cap.z); hole.quaternion.copy(q.quaternion);
    }
  }

  function twMakeSail(body) {
    const mastBase=new THREE.Vector3(.38,2.55,-.42), mastTop=new THREE.Vector3(.58,7.65,-.48);
    twLimb(body,mastBase,mastTop,.14,.085,twM.wood2);
    const yardL=new THREE.Vector3(-1.72,6.65,-.48), yardR=new THREE.Vector3(2.78,6.65,-.48);
    twLimb(body,yardL,yardR,.105,.072,twM.wood2);
    twTube(body,[mastTop,new THREE.Vector3(.66,8.02,-.5),new THREE.Vector3(.54,8.38,-.52)],.075,.016,twM.wood2);
    twTube(body,[mastTop,yardL],.012,.004,twM.rope); twTube(body,[mastTop,yardR],.012,.004,twM.rope);
    twTube(body,[yardL,mastBase],.009,.003,twM.rope); twTube(body,[yardR,mastBase],.009,.003,twM.rope);

    const geo=new THREE.BufferGeometry(), cols=15,rows=11,pos=[],idx=[];
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const u=x/(cols-1),v=y/(rows-1), topX=THREE.MathUtils.lerp(yardL.x,yardR.x,u);
      const bottomX=.5+(u-.5)*2.76, px=THREE.MathUtils.lerp(topX,bottomX,v), py=6.62-v*3.15;
      pos.push(px,py,-.5+Math.sin(u*Math.PI*2+v*2.4)*.035);
    }
    for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){
      if(((x*7+y*11)%23)<3 || (y>7&&((x+y)%4===0||x<2||x>cols-4)))continue;
      const a=y*cols+x,b=a+1,c=a+cols,d=c+1; idx.push(a,c,b,b,c,d);
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.setIndex(idx); geo.computeVertexNormals();
    const sail=twAdd(body,geo,twM.sail); sail.name='tornSail'; sail.userData.base=Float32Array.from(pos); return sail;
  }

  const TW_Y=-.1;   // her feet on the ground
  function makeTidewife() {
    const g=new THREE.Group(), body=new THREE.Group(); g.add(body);

    // Broad/deep crab carapace constructed from wreck timber.
    twBlob(body,0,2.0,0,2.75,.82,2.15,twM.shell2,2);
    twBlob(body,0,2.38,-.15,2.35,.48,1.75,twM.wood2,2);
    for(let i=-14;i<=14;i++){
      const x=i*.18, edge=Math.abs(i)/15, len=3.95*(1-edge*.28);
      twPlank(body,x,2.66-Math.abs(i)*.018,-.12,.15,.09,len,i%4?twM.wood:twM.wood2,0,(i%3-1)*.008,i*.012);
    }
    // shell ribs / wreck frames
    for(let i=0;i<13;i++){const z=-1.65+i*.28;twTube(body,[new THREE.Vector3(-2.35,2.2,z),new THREE.Vector3(0,2.72,z*.92),new THREE.Vector3(2.35,2.2,z)],.065,.04,twM.wood2);}

    // Bow-like crab face / rostrum.
    twBlob(body,0,1.55,2.0,1.25,.52,.62,twM.shell,2);
    for(let i=-4;i<=4;i++)twPlank(body,i*.2,1.65,2.36,.14,.12,.62,i%2?twM.wood:twM.wood2,(i%3-1)*.05,0,i*.045);

    // Eight articulated walking legs.
    for(const side of[-1,1])for(let li=0;li<4;li++){
      const z=-1.28+li*.83, hip=new THREE.Vector3(side*2.0,1.75,z), knee=new THREE.Vector3(side*(3.05+li*.12),1.18,z+.08),
        ankle=new THREE.Vector3(side*(3.72+li*.15),.55,z+.3), foot=new THREE.Vector3(side*(4.18+li*.12),.18,z+.62);
      twLimb(body,hip,knee,.23,.18,twM.wood2); twBlob(body,knee.x,knee.y,knee.z,.27,.23,.25,twM.shell,1);
      twLimb(body,knee,ankle,.18,.12,twM.wood); twBlob(body,ankle.x,ankle.y,ankle.z,.2,.17,.18,twM.shell2,1);
      twLimb(body,ankle,foot,.12,.055,twM.wood2);
    }

    // Massive chelipeds; each entire claw is a movable arm group for existing attack pose.
    const arms=[];
    for(const side of[-1,1]){
      const arm=new THREE.Group(); body.add(arm); arms.push(arm);
      const shoulder=new THREE.Vector3(side*1.9,1.8,1.35), elbow=new THREE.Vector3(side*2.65,1.65,1.85), wrist=new THREE.Vector3(side*3.15,1.45,2.35);
      twLimb(arm,shoulder,elbow,.36,.29,twM.wood2); twBlob(arm,elbow.x,elbow.y,elbow.z,.4,.34,.42,twM.shell,2);
      twLimb(arm,elbow,wrist,.31,.25,twM.wood);
      twBlob(arm,side*3.45,1.5,2.72,.95,.62,.9,twM.wood2,2); // palm
      // curved wreck-beam pincers; no white tooth/spike row
      twTube(arm,[new THREE.Vector3(side*3.65,1.62,3.15),new THREE.Vector3(side*3.95,1.82,3.62),new THREE.Vector3(side*3.72,1.72,4.05)],.18,.055,twM.wood2);
      twTube(arm,[new THREE.Vector3(side*3.45,1.35,3.1),new THREE.Vector3(side*3.72,1.12,3.58),new THREE.Vector3(side*3.52,1.25,3.98)],.16,.05,twM.wood);
      // moss blankets directly on claw surface
      for(let i=0;i<58;i++){const t=((i*23)%57)/56,a=i*2.399,x=side*(2.35+t*1.5),y=1.2+Math.sin(t*Math.PI)*.82,z=2.0+Math.cos(a)*(.24+(i%4)*.04);twBlob(arm,x,y,z,.18+(i%5)*.04,.035,.14+(i%4)*.035,i%6?twM.moss:twM.mossDark,1);}
      twBarnaclePatch(arm,new THREE.Vector3(side*3.35,1.62,3.05),new THREE.Vector3(0,.15,1),.72,.45,22,side<0?3:7);
      twBarnaclePatch(arm,new THREE.Vector3(side*3.55,1.48,2.35),new THREE.Vector3(0,0,-1),.6,.34,16,side<0?13:19);
    }

    // Lantern eyestalks.
    const eyes=[];
    for(const side of[-1,1]){
      const st=new THREE.Group(); st.position.set(side*.72,2.0,2.48); body.add(st);
      twTube(st,[new THREE.Vector3(0,0,0),new THREE.Vector3(side*.05,.86,.28)],.085,.045,twM.wood2);
      const ly=.86,lz=.28;
      twAdd(st,new THREE.CylinderGeometry(.22,.27,.13,8),twM.black,side*.05,ly+.32,lz);
      twAdd(st,new THREE.CylinderGeometry(.25,.2,.13,8),twM.black,side*.05,ly-.31,lz);
      const glass=twAdd(st,new THREE.CylinderGeometry(.18,.18,.52,10),twM.eyeLit,side*.05,ly,lz); glass.name='tideLanternGlass';
      const flame=twAdd(st,new THREE.SphereGeometry(.075,10,7),twM.eyeLit,side*.05,ly-.055,lz); flame.scale.set(1,1.45,1); flame.name='tideLanternFlame';
      const halo=twAdd(st,new THREE.SphereGeometry(.28,10,8),twM.halo,side*.05,ly,lz); halo.scale.set(1,1.15,1); halo.name='tideLanternHalo';
      for(let c=0;c<6;c++){const aa=c/6*Math.PI*2,xx=side*.05+Math.cos(aa)*.205,zz=lz+Math.sin(aa)*.205;twLimb(st,new THREE.Vector3(xx,ly-.27,zz),new THREE.Vector3(xx,ly+.27,zz),.018,.018,twM.black);}
      halo.castShadow=false; eyes.push({st,e:glass,flame,halo,seed:side<0?1.7:4.3});
    }

    // Heavy moss / algae across roughly 20% of wreck surface.
    for(let i=0;i<185;i++){
      const a=i*2.399,band=(i%23)/22,x=Math.sin(a)*(.72+band*2.25),z=Math.cos(a)*(.58+band*1.55),y=.82+((i*29)%37)/36*2.25;
      twBlob(body,x,y,z,.22+(i%7)*.055,.035+(i%4)*.014,.18+(i%6)*.045,i%6?twM.moss:twM.mossDark,1);
    }
    // hanging algae/moss
    for(let i=0;i<76;i++){const a=i*1.77,x=Math.sin(a)*(1.15+(i%8)*.22),z=Math.cos(a)*(.75+(i%6)*.16),y=1.15+(i%5)*.22;twTube(body,[new THREE.Vector3(x,y,z),new THREE.Vector3(x+Math.sin(i)*.08,y-.4,z),new THREE.Vector3(x+Math.cos(i)*.12,y-.8-(i%6)*.08,z+.06)],.026,.003,i%5?twM.moss:twM.mossDark);}

    // Surface barnacle colonies: scattered, low-profile and attached.
    twBarnaclePatch(body,new THREE.Vector3(-1.72,2.58,1.28),new THREE.Vector3(-.12,.55,.82),.66,.5,18,51);
    twBarnaclePatch(body,new THREE.Vector3(-.35,2.86,1.55),new THREE.Vector3(0,.62,.78),.58,.42,15,57);
    twBarnaclePatch(body,new THREE.Vector3(1.12,2.67,1.42),new THREE.Vector3(.08,.58,.81),.7,.48,18,61);
    twBarnaclePatch(body,new THREE.Vector3(-2.2,2.2,.48),new THREE.Vector3(-.72,.45,.3),.46,.36,13,67);
    twBarnaclePatch(body,new THREE.Vector3(2.18,2.3,.55),new THREE.Vector3(.72,.45,.3),.48,.36,13,71);

    // Rotten cavities / fungal shelves.
    for(let i=0;i<31;i++){const a=i*2.21,x=Math.sin(a)*(1.15+(i%7)*.27),z=Math.cos(a)*(.8+(i%5)*.23),y=1.28+((i*13)%17)*.095;twBlob(body,x,y,z,.09+(i%4)*.035,.018,.16+(i%5)*.035,twM.rot,1);}
    for(let i=0;i<19;i++){const a=i*2.7,x=Math.sin(a)*(1.45+(i%5)*.24),z=Math.cos(a)*(.85+(i%4)*.2),y=1+(i%8)*.26;const q=twAdd(body,new THREE.SphereGeometry(.09+(i%3)*.025,8,4,0,Math.PI*2,0,Math.PI/2),twM.fungus,x,y,z);q.scale.set(1.5,.28,1);}

    // Kelp remains its own group because gameplay burns/removes it through m.extra.
    const kelp=new THREE.Group(); body.add(kelp);
    for(let i=0;i<48;i++){const a=i/48*Math.PI*2,q=twAdd(kelp,new THREE.PlaneGeometry(.12+(i%5)*.045,1.2+(i%9)*.18,1,6),twM.kelp,Math.sin(a)*2.55,.58,Math.cos(a)*1.85);q.rotation.y=a;q.rotation.z=Math.sin(i*.9)*.16;}

    const sail=twMakeSail(body);
    const light=new THREE.PointLight(0xffad45,2.8,9,2); light.position.set(0,2.9,2.8); body.add(light);   // (both lanterns)

    // ~950 parts: bake what doesn't move into one mesh per material
    bake(body,[...arms,...eyes.map(e=>e.st),kelp,sail]);
    arms.forEach(a=>bake(a));
    eyes.forEach(({st,e,flame,halo})=>bake(st,[e,flame,halo]));
    shadows(body); eyes.forEach(({halo})=>{halo.castShadow=false;}); sail.castShadow=true;
    body.position.y=TW_Y; g.userData={body,eyes,arms,kelp,sail,light}; return g;
  }

  UI.mobs.register('boss_tidewife', {
    make: makeTidewife,
    pose(m, dt, now) {
      const {body,eyes,arms,kelp,sail,light}=m.mesh.userData, s=(now-m.stateAt)/1000, t=now/1000;
      kelp.visible=m.extra!==0;
      kelp.children.forEach((k,i)=>{k.rotation.x=Math.sin(now/500+i)*.15;k.rotation.z+=Math.sin(now/800+i*.7)*dt*.06;});

      const rear=m.state==='rear'?Math.min(1,s/.5):m.state==='recover'&&s<.3?1-s/.3:0;
      body.rotation.x+=(-.65*rear-body.rotation.x)*Math.min(1,dt*12);
      eyes.forEach(({st,e,flame,halo,seed},i)=>{
        st.scale.y=.6+rear*.9;
        const f=.78+Math.sin(t*8.7+seed)*.12+Math.sin(t*17.3+seed*2.1)*.07+Math.sin(t*31.1+seed*.7)*.035;
        if(i===0){light.intensity=(rear>.5?5:3)*Math.max(.52,f);light.position.y=2.9+rear*.8;}
        e.material=rear>.5?twM.eyeLit:twM.eye;
        if(e.material.emissiveIntensity!==undefined)e.material.emissiveIntensity=(rear>.5?2.4:.55)*Math.max(.65,f);
        flame.scale.set(.95+f*.06,1.15+f*.32,.95+f*.06);
        halo.material.opacity=.055+Math.max(.55,f)*.07; halo.scale.setScalar(.92+Math.max(.55,f)*.13);
      });

      const swipe=m.state==='claw'?Math.sin(Math.min(1,s/.9)*Math.PI):0, heave=m.state==='throw'?Math.min(1,s/.6):0;
      arms[1].rotation.y=-swipe*.9; arms[0].rotation.x=-heave*1.2;

      // Torn sail: top remains rigged; lower fabric gets progressively more movement.
      if(sail?.geometry?.attributes?.position&&sail.userData.base){
        const a=sail.geometry.attributes.position.array,b=sail.userData.base;
        for(let i=0;i<a.length;i+=3){const u=(i/3)%15/14,v=Math.floor((i/3)/15)/10;a[i]=b[i]+Math.sin(t*1.35+v*3.8+u*5.5)*(.025+.12*v);a[i+2]=b[i+2]+Math.sin(t*1.7+u*4.2+v*2.3)*(.035+.16*v);}
        sail.geometry.attributes.position.needsUpdate=true;
      }
      body.position.y=TW_Y+Math.sin(now/400)*.04+(UI.bosses&&UI.bosses.phaseOf(m.id)?Math.sin(now/90)*.02:0);
    },
  });

  // Existing wreck-heave projectile behavior.
  const twBeams=[];
  UI.net.on('bossfx',m=>{
    if(m.k!=='wreck')return;
    const beam=new THREE.Mesh(new THREE.BoxGeometry(.25,.2,1.6),twM.wood); scene.add(beam);
    twBeams.push({beam,fx:m.fx,fz:m.fz,x:m.x,z:m.z,t:0,ms:m.ms||1400});
  });
  UI.onFrame(dt=>{
    for(let i=twBeams.length-1;i>=0;i--){
      const b=twBeams[i];b.t+=dt*1000;
      const k=Math.min(1,b.t/b.ms),x=b.fx+(b.x-b.fx)*k,z=b.fz+(b.z-b.fz)*k;
      b.beam.position.set(x,Math.max(groundAt(x,z),0)+.3+Math.sin(k*Math.PI)*6,z);
      b.beam.rotation.set(k*8,Math.atan2(b.x-b.fx,b.z-b.fz),0);
      if(k>=1){scene.remove(b.beam);b.beam.geometry.dispose();twBeams.splice(i,1);}
    }
  });
