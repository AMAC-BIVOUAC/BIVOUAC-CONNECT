(function(){'use strict';
const modules={},base=document.currentScript.src||location.href;
const inlineAssets={};
function asset(dir,name){const path=dir+name.replace(/^\.\//,'');return inlineAssets[path]||new URL(path,base).href}
modules["human/atlas.js"]=(()=>{
const parts = {"eye-far":[0,0,15,25,325.5,155.0],"eye-near":[19,0,16,25,361.5,155.5],"brow-far":[39,0,28,18,320.0,140.0],"brow-near":[71,0,55,24,355.5,137.0],"mouth-smile":[130,0,57,16,336.5,196.0],"hat":[191,0,291,250,310.5,65.0],"face":[486,0,163,201,316.0,131.5],"hair":[653,0,336,181,306.0,149.5],"lid-far":[993,0,17,8,325.0,160.0],"lid-near":[1014,0,17,8,361.0,160.0],"mouth-speak":[1035,0,55,18,337.0,196.5],"mouth-round":[1094,0,23,17,345.0,197.0],"thigh-far":[1121,0,238,152,244.5,418.0],"calf-far":[1363,0,235,324,245.0,465.5],"thigh-near":[1602,0,394,157,347.5,422.0],"calf-near":[0,328,374,356,347.0,469.5],"boot-far":[378,328,241,160,207.0,619.0],"boot-near":[623,328,227,174,309.0,631.0],"pelvis":[854,328,233,123,428.0,454.0],"torso":[1091,328,293,377,0,0],"upper-near":[1388,328,179,343,0,0],"fore-near":[1571,328,345,142,0,0],"upper-far":[1057,709,183,318,0,0],"fore-far":[1244,709,320,154,0,0],"hand-left-rest":[0,1033,231,160,0,0],"hand-left-open":[235,1033,283,217,0,0],"hand-left-palm":[522,1033,265,155,0,0],"hand-right-fist":[0,709,231,160,0,0],"hand-right-open":[770,709,283,217,0,0],"hand-right-palm":[235,709,265,155,0,0],"hand-right-point":[504,709,262,134,0,0]};

return {parts};})();
modules["human/human.js"]=(()=>{
const {parts}=modules["human/atlas.js"];

// Portrait coordinates are half the source resolution. Angles exposed to the
// scene use screen space, even though the sitter is mirrored at composition.
const humanRig = {
  seat: [488,508], height:650, neck:[378,228],
  near:{shoulder:[478,285],elbow:[448,399],wrist:[323,400]},
  far:{shoulder:[346,285],elbow:[319,376],wrist:[292,373]},
  hips:[[483,473],[456,463]], knees:[[391,468],[282,456]], ankles:[[388,638],[292,620]],
  limits:{head:[-12,13],upper:[-34,12],fore:[-55,14],farUpper:[-19,10],farFore:[-38,14]}
};
const degrees=Math.PI/180;
const bounded=(quantity,lo,hi)=>Math.min(hi,Math.max(lo,Number.isFinite(quantity)?quantity:0));
// Wrist centers are in source pixels at the skin/cuff seam. The right hand
// presents its back to camera, and the left presents its palm.
const handRig = {
  near: {
    side: 'right', scale: .34, rest: 'fist', intermediate: 'palm',
    wrists: {fist:[185,84],open:[239,74],palm:[218,73],point:[230,72]}
  },
  far: {
    side: 'left', scale: .268, rest: 'rest', intermediate: 'palm',
    wrists: {rest:[185,89],open:[225,130],palm:[206,100]}
  }
};
function pivot(ctx,point,angle,body) {
  ctx.save();
  ctx.translate(...point); ctx.rotate(-angle*degrees); ctx.translate(-point[0],-point[1]);
  body(); ctx.restore();
}
async function loadHuman(){
  const atlas=new Image();
  atlas.src=asset("human/", './human-atlas.webp');
  await atlas.decode();
  return function draw(ctx,x,y,height,pose={}){
    const sprite=(id,left,top,width,drawHeight)=>{
      const [u,v,w,h,bx,by]=parts[id];
      ctx.drawImage(atlas,u,v,w,h,left??bx,top??by,width??w/2,drawHeight??h/2);
    };
    function segment(id,a,b,from,to){
      // Bind two painted points to the joint endpoints without changing aspect.
      const [, ,w,h]=parts[id];
      const sx=(to[0]-from[0])*w,sy=(to[1]-from[1])*h;
      const dx=b[0]-a[0],dy=b[1]-a[1];
      const scale=Math.hypot(dx,dy)/Math.hypot(sx,sy);
      ctx.save();ctx.translate(...a);
      ctx.rotate(Math.atan2(dy,dx)-Math.atan2(sy,sx));
      sprite(id,-from[0]*w*scale,-from[1]*h*scale,w*scale,h*scale);
      ctx.restore();
    }
    const rotation=(key)=>bounded(pose[key],...humanRig.limits[key]);
    function drawHand(side,wrist) {
      const near=side==='near', hand=handRig[side];
      const requested=near?(pose.rightHand??pose.hand):pose.leftHand;
      const target=Object.hasOwn(hand.wrists,requested)?requested:hand.rest;
      const amount=bounded((near?pose.rightHandAmount:pose.leftHandAmount)??1,0,1);
      const intermediate=hand.intermediate;
      const throughIntermediate=target!==hand.rest && target!==intermediate;
      const from=throughIntermediate && amount>=.5?intermediate:hand.rest;
      const to=throughIntermediate && amount<.5?intermediate:target;
      const phase=throughIntermediate?(amount<.5?2*amount:2*amount-1):amount;
      // Keep the overlap brief to avoid a persistent double outline.
      const blend=bounded((phase-.32)/.36,0,1);
      const turn=target===hand.rest?0:Math.sin(Math.PI*amount)*(near?-7:5);
      const angle=bounded((near?(pose.wrist??0):0)+turn,-15,15);
      const opacity=ctx.globalAlpha;
      const paint=(variant,weight)=>{
        const id='hand-'+hand.side+'-'+variant;
        const [, ,width,height]=parts[id];
        const [anchorX,anchorY]=hand.wrists[variant];
        const scale=hand.scale;
        ctx.globalAlpha=opacity*weight;
        sprite(id,wrist[0]-4-anchorX*scale,wrist[1]-anchorY*scale,width*scale,height*scale);
      };
      pivot(ctx,wrist,angle,()=>{
        if(from===to){paint(to,1);return;}
        if(blend<1)paint(from,1-blend);
        if(blend>0)paint(to,blend);
      });
    }
    function arm(side){
      const near=side==='near';
      const {shoulder,elbow,wrist}=humanRig[side];
      const shoulderAngle=rotation(near?'upper':'farUpper');
      const elbowAngle=rotation(near?'fore':'farFore');
      // Ease the highest right-hand poses toward the jawline.
      const lift=near?bounded((-shoulderAngle-elbowAngle-65)/20,0,1):0;
      const clearance=lift*lift*(3-2*lift);
      pivot(ctx,shoulder,shoulderAngle+14*clearance,()=>{
        segment('upper-'+side,shoulder,elbow,[.65,.20],[.23,.87]);
        pivot(ctx,elbow,elbowAngle+12*clearance,()=>{
          // The far arm bends toward the viewer. Its painted forearm is foreshortened.
          if(near)segment('fore-near',elbow,wrist,[.84,.53],[.13,.53]);
          else sprite('fore-far',wrist[0]-7,wrist[1]-15,elbow[0]-wrist[0]+25,36);
          drawHand(side,wrist);
        });
      });
    }
    ctx.save();ctx.translate(x,y);
    const scale=height/humanRig.height;ctx.scale(-scale,scale);ctx.translate(-humanRig.seat[0],-humanRig.seat[1]);
    for(const side of ['far','near']){
      sprite('boot-'+side);sprite('calf-'+side);sprite('thigh-'+side);
    }
    sprite('pelvis');
    const breath=bounded(pose.breath,-1,1);
    pivot(ctx,humanRig.seat,breath*.21,()=>{
      arm('far');
      sprite('torso',306,207,250,290);
    });
    sprite('calf-near');sprite('thigh-near');
    pivot(ctx,humanRig.seat,breath*.21,()=>{
      pivot(ctx,humanRig.neck,rotation('head'),()=>{
        sprite('hair');sprite('face');sprite('hat');
        const blink=bounded(pose.blink,0,1),gaze=bounded(pose.gaze,-1,1);
        for(const side of ['far','near']){
          const brow='brow-'+side;
          sprite(brow,parts[brow][4],parts[brow][5]-bounded(pose.brow,0,1)*3);
          if(blink>.83){sprite('lid-'+side);continue;}
          const eye='eye-'+side, [, ,w,h,ox,oy]=parts[eye];
          ctx.save();ctx.beginPath();ctx.rect(ox-2,oy+blink*h*.42,w/2+4,h/2*(1-blink*.76));ctx.clip();
          sprite(eye,ox-gaze*.9,oy+Math.abs(gaze)*.28);
          ctx.restore();
        }
        const talk=bounded(pose.talk,0,1);
        sprite(talk>.72?'mouth-round':talk>.25?'mouth-speak':'mouth-smile');
      });
      // The right arm is in front of the head when it reaches the face.
      arm('near');
    });
    ctx.restore();
  };
}

return {humanRig,loadHuman};})();
modules["robot/atlas.js"]=(()=>{
const parts = {"head":[2,2,554,490,549,266],"display":[560,2,350,321,582,387],"eye_l":[914,2,52,75,625,509],"eye_r":[970,2,55,75,783,515],"smile":[1029,2,69,41,692,573],"lid":[1102,2,43,14,628,541],"mouth_o":[1149,2,26,23,712,582],"mouth_small":[1179,2,47,14,702,584],"antenna":[1230,2,85,94,841,177],"pack":[1319,2,176,364,966,716],"torso":[2,496,462,511,621,705],"emitter":[468,496,85,90,715,825],"pelvis":[557,496,412,158,648,1075],"thigh_far":[973,496,203,141,551,1062],"shin_far":[1180,496,240,242,396,1065],"sole_far":[2,1011,116,155,394,1152],"thigh":[122,1011,252,152,792,1087],"shin":[378,1011,251,267,639,1092],"sole":[633,1011,117,158,639,1201],"shoulder_far":[754,1011,72,121,622,757],"upper_far":[830,1011,124,167,545,814],"fore_far":[958,1011,135,143,531,924],"hand_far":[1097,1011,147,135,614,929],"upper":[1248,1011,144,253,887,819],"shoulder":[1396,1011,131,130,913,775],"hand":[2,1282,117,120,644,940],"fore":[123,1282,254,149,736,943],"hand_fist":[381,1282,109,93,656,958],"hand_open":[494,1282,108,93,657,958],"hand_point":[606,1282,149,93,616,958],"hand_palm":[759,1282,142,93,623,958]};

return {parts};})();
modules["robot/robot.js"]=(()=>{
const {parts}=modules["robot/atlas.js"];

// Pivots use coordinates from the 1536 px source; angles are in canvas degrees.
const robotRig = {
  seat: [938,1205], height: 1186,
  neck: [818,740], antenna: [853,272],
  shoulder: [968,837], elbow: [952,1025], wrist: [759,1008],
  farShoulder: [647,826], farElbow: [567,972], farWrist: [646,986],
  hip: [950,1148], knee: [834,1115], ankle: [705,1258],
  farHip: [704,1148], farKnee: [578,1091], farAnkle: [472,1203],
  limits: {head:[-12,13],upper:[-16,33],fore:[-14,64],farUpper:[-8,22],farFore:[-13,35]},
};
const radians = Math.PI / 180;
const bound = (v,lo,hi) => Math.max(lo,Math.min(hi,Number.isFinite(v)?v:0));
const rotation = (key,p) => bound(p[key],...robotRig.limits[key]);
function joint(ctx,[x,y],angle,draw) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle*radians); ctx.translate(-x,-y);
  draw(); ctx.restore();
}
async function loadRobot() {
  const atlas = new Image();
  atlas.src = asset("robot/", './atlas.webp');
  await atlas.decode();
  return function draw(ctx,x,y,height,p = {}) {
    ctx.save();
    ctx.translate(x,y);
    const scale=height/robotRig.height;
    ctx.scale(scale,scale); ctx.translate(-robotRig.seat[0],-robotRig.seat[1]);
    const sprite=(key,dx=0,dy=0)=>{
      const [u,v,w,h,left,top]=parts[key];
      ctx.drawImage(atlas,u,v,w,h,left+dx,top+dy,w,h);
    };
    const blendEye=(eye,dx,dy)=>{
      const blink=bound(p.blink,0,1);
      if(blink<.80) {
        // An eyelid clips the light on the screen; the contours keep their width.
        ctx.save();
        if(blink>.04) {
          ctx.beginPath();ctx.rect(dx+618,dy+511+blink*36,70,69-blink*64);ctx.clip();
        }
        sprite(eye,eye==='eye_r'?dx-160:dx,eye==='eye_r'?dy-7:dy);
        ctx.restore();
      } else sprite('lid',dx,dy+3);
    };
    // Feet, knees and seat stay attached to the log throughout conversation.
    joint(ctx,robotRig.farHip,0,()=>{
      sprite('thigh_far');
      joint(ctx,robotRig.farKnee,0,()=>{sprite('shin_far');sprite('sole_far')});
    });
    sprite('pelvis');
    const nearLeg=()=>joint(ctx,robotRig.hip,0,()=>{
      sprite('thigh');
      joint(ctx,robotRig.knee,0,()=>{sprite('shin');sprite('sole')});
    });
    const breath=bound(p.breath,-1,1);
    ctx.save();ctx.translate(0,-breath*1.3);
    sprite('pack');sprite('torso');sprite('emitter');
    joint(ctx,robotRig.farShoulder,rotation('farUpper',p),()=>{
      sprite('upper_far');sprite('shoulder_far');
      joint(ctx,robotRig.farElbow,rotation('farFore',p),()=>{
        ctx.save();ctx.translate(1415,-14);ctx.scale(-1,1);sprite('hand_fist');ctx.restore();
        sprite('fore_far');
      });
    });
    joint(ctx,robotRig.shoulder,rotation('upper',p),()=>{
      sprite('upper');sprite('shoulder');
      joint(ctx,robotRig.elbow,rotation('fore',p),()=>{
        const variant=['palm','point','open','fist'].includes(p.hand) ? 'hand_'+p.hand:'hand';
        joint(ctx,robotRig.wrist,bound(p.wrist,-18,18),()=>sprite(variant));
        sprite('fore');
      });
    });
    joint(ctx,robotRig.neck,rotation('head',p),()=>{
      joint(ctx,robotRig.antenna,bound(p.antenna,-3,3),()=>sprite('antenna'));
      sprite('head');sprite('display');
      const gaze=bound(p.gaze,-1,1)*5;
      blendEye('eye_l',gaze,0);blendEye('eye_r',gaze+160,7);
      const talk=bound(p.talk,0,1);
      sprite(talk>.62?'mouth_o':talk>.27?'mouth_small':'smile');
    });
    ctx.restore();nearLeg();ctx.restore();
  };
}

return {robotRig,loadRobot};})();
modules["landscape/coordinates.js"]=(()=>{
const maps={"wide":{"factor":2.0,"width":1000,"height":558,"motions":[{"id":"branch-left","pivot":[163,18],"degrees":0.95},{"id":"pine-tip","pivot":[315,10],"degrees":1.8},{"id":"bough-center","pivot":[636,15],"degrees":1.6},{"id":"bough-pendant","pivot":[643,75],"degrees":1.6},{"id":"leaves-right","pivot":[891,81],"degrees":0.58},{"id":"fern-front","pivot":[850,555],"degrees":1.5},{"id":"canvas-left","pivot":[207,331],"degrees":0.36},{"id":"canvas-right","pivot":[710,320],"degrees":0.43}],"day":{"leaves-right":[0,0,393,295,1414,32],"canvas-left":[395,0,69,191,414,680],"branch-left":[466,0,295,184,312,0],"canvas-right":[763,0,79,151,1402,646],"pine-tip":[844,0,94,149,619,0],"bough-pendant":[940,0,135,132,1284,130],"ripple":[1077,0,475,129,778,682],"bough-center":[1554,0,141,120,1134,0],"fern-front":[1697,0,161,82,1602,1034]},"night":{"leaves-right":[0,0,393,295,1414,32],"canvas-left":[395,0,69,191,414,680],"branch-left":[466,0,295,184,312,0],"canvas-right":[763,0,79,151,1402,646],"pine-tip":[844,0,94,149,619,0],"bough-pendant":[940,0,135,132,1284,130],"ripple":[1077,0,475,129,778,682],"bough-center":[1554,0,141,120,1134,0],"fern-front":[1697,0,161,82,1602,1034]}},"portrait":{"factor":1.8521739130434782,"width":460,"height":997,"motions":[{"id":"branch-left","pivot":[32,13],"degrees":0.8},{"id":"bough-right","pivot":[435,40],"degrees":1.1},{"id":"bough-left-low","pivot":[23,130],"degrees":1.2},{"id":"pine-tip","pivot":[357,246],"degrees":2.5},{"id":"grass-right","pivot":[447,911],"degrees":1.05},{"id":"canvas-left","pivot":[49,606],"degrees":0.43},{"id":"canvas-right","pivot":[382,606],"degrees":0.41}],"day":{"bough-right":[0,0,179,221,661,44],"branch-left":[181,0,355,190,48,0],"grass-right":[538,0,143,184,709,1517],"bough-left-low":[683,0,180,140,31,215],"cloud-1":[865,0,226,138,497,152],"cloud-0":[1093,0,236,133,141,264],"pine-tip":[1331,0,138,110,615,397],"ripple":[1471,0,423,107,228,1102],"canvas-right":[1896,0,42,101,704,1134],"canvas-left":[1940,0,27,92,80,1135],"cloud-2":[0,223,121,30,206,583]},"night":{"bough-right":[0,0,179,221,661,44],"branch-left":[181,0,355,190,48,0],"grass-right":[538,0,143,184,709,1517],"bough-left-low":[683,0,180,140,31,215],"pine-tip":[865,0,138,110,615,397],"ripple":[1005,0,423,107,228,1102],"canvas-right":[1430,0,42,101,704,1134],"canvas-left":[1474,0,27,92,80,1135]}}};

return {maps};})();
modules["landscape/landscape.js"]=(()=>{
const {maps}=modules["landscape/coordinates.js"];

async function loadSheet(kind,mode) {
  const load=async type=>{
    const img=new Image();
    img.src=asset("landscape/", './assets/'+kind+'-'+mode+'-'+type+'.webp');
    await img.decode();return img;
  };
  const [base,moving]=await Promise.all([load('base'),load('moving')]);
  return {base,moving};
}
const waves=Array.from({length:16},(_,i)=>({
  x:Math.sin(i*39.71)*.42, y:(i*.6180339)%1, length:1.6+((i*13.37)%5)
}));
function ambience(ctx,t,night,wind,p,moon) {
  const lake=p?[232,610,150,26]:[512,355,162,22];
  ctx.save();ctx.lineCap='round';
  for(let i=0;i<waves.length;i++){
    const w=waves[i],k=t*.62+i*2.18,x=lake[0]+w.x*lake[2]+Math.sin(k)*2,y=lake[1]+w.y*lake[3];
    ctx.strokeStyle='rgba(226,238,231,'+((.055+.055*Math.sin(k))*(1-.29*night))+')';
    ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+w.length,y-.45,x+w.length*1.8,y);ctx.stroke();
  }
  const light=(x,y,r,fill)=>{
    const glow=ctx.createRadialGradient(x,y,0,x,y,r);glow.addColorStop(0,fill);glow.addColorStop(1,'rgba(255,202,125,0)');
    ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,r*2,r*2);
  };
  const shimmer=.5+.28*Math.sin(4.7*t)+.22*Math.sin(7.1*t);
  if(night>.002){
    if(!p){ctx.save();ctx.globalAlpha=night*.87;ctx.drawImage(moon,525,35,13,16);ctx.restore()}
    const mx=p?255:531,my=p?613:354;
    for(let i=0;i<4;i++){
      const glint=.5+.5*Math.sin(t*1.19+i);
      ctx.strokeStyle='rgba(206,224,241,'+(night*(.028+.064*glint))+')';ctx.lineWidth=.65;
      ctx.beginPath();ctx.moveTo(mx-2-glint,my+i*2.2);ctx.lineTo(mx+2+glint,my+i*2.2);ctx.stroke();
    }
    const lantern=p?[56,688]:[143,454];
    light(...lantern,p?13:22,'rgba(255,186,84,'+night*(.11+.15*shimmer)+')');
    const tents=p?[[57,646,24],[399,641,30]]:[[225,393,53],[720,371,44]];
    for(const [x,y,r] of tents)light(x,y,r,'rgba(255,190,102,'+night*(.04+.045*shimmer)+')');
    const sky=p?[210,130,140,210]:[479,43,87,47];
    for(let i=0;i<21;i++){
      const x=sky[0]+Math.sin(14.17*i+1)*sky[2],y=sky[1]+(Math.sin(i*19.9+1)*.5+.5)*sky[3];
      ctx.fillStyle='rgba(227,239,255,'+(night*(.20+.20*Math.sin(t*.87+i)))+')';
      ctx.beginPath();ctx.arc(x,y,.44+i%3*.11,0,6.29);ctx.fill();
    }
    const cycle=(t+8)%71;
    if(cycle<.65){
      const x=sky[0]+cycle*91,y=sky[1]+cycle*26;
      ctx.strokeStyle='rgba(230,242,255,'+(Math.sin(Math.PI*cycle/.65)*night*.68)+')';
      ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-9,y-2.6);ctx.stroke();
    }
    for(let i=0;i<7;i++){
      const u=t*.33+i*1.9, x=(p?80:115)+i*(p?49:122)+Math.sin(u)*8,y=(p?650:407)+Math.cos(u*.7)*9;
      ctx.fillStyle='rgba(231,240,145,'+(night*Math.max(0,Math.sin(t*.71+i*3.1))*.76)+')';
      ctx.beginPath();ctx.arc(x,y,.9,0,6.29);ctx.fill();
    }
  }
  if(night<.99){
    const x=p?328:825,y=p?405:178;
    ctx.save();ctx.translate(x,y);ctx.rotate(.52);ctx.scale(.18,1);
    light(0,0,p?132:102,'rgba(255,225,158,'+((1-night)*(.04+.035*Math.sin(t*.29)))+')');
    ctx.restore();
    for(let i=0;i<9;i++){const px=x-13+(i%3)*12+Math.sin(i+t*.23)*5,py=y+((i*17-t*(1+i%3))%67+67)%67;
      ctx.fillStyle='rgba(255,232,164,'+((1-night)*(.18+.14*Math.sin(i+t*.9)))+')';ctx.fillRect(px,py,.85,.85)}
  }
  // Airborne pine needles drift into the clearing on the stronger gusts.
  const gust=(t+6)%24;
  if(gust<4.8 && wind>-.1){
    const u=gust/4.8,x=(p?292:710)+u*59+Math.sin(u*12)*5,y=(p?287:125)+u*49;
    ctx.translate(x,y);ctx.rotate(u*9);ctx.strokeStyle='rgba(127,96,43,'+(.6*Math.sin(Math.PI*u))+')';
    ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(-1.8,0);ctx.lineTo(2,0);ctx.stroke();
  }
  ctx.restore();
}
function pass(ctx,t,wind,kind,mode,images) {
  const meta=maps[kind], f=meta.factor, rects=meta[mode];
  ctx.drawImage(images.base,0,0,meta.width,meta.height);
  const sprite=(key,dx=0,dy=0)=>{
    const r=rects[key];if(!r)return;
    const [u,v,w,h,x,y]=r;
    ctx.drawImage(images.moving,u,v,w,h,x/f+dx,y/f+dy,w/f,h/f);
  };
  for(let i=0;i<3;i++)sprite('cloud-'+i,Math.sin(t*.026+i)*2);
  for(let i=0;i<meta.motions.length;i++){
    const m=meta.motions[i], [x,y]=m.pivot;
    ctx.save();ctx.translate(x,y);
    ctx.rotate((wind*.69+.23*Math.sin(t*.94+i*1.3))*m.degrees*Math.PI/180);
    ctx.translate(-x,-y);sprite(m.id);ctx.restore();
  }
  const [u,v,w,h,x,y]=rects.ripple;
  // The alpha mask ends inside the shoreline. Rows displace only reflected pigment.
  const slice=Math.max(2,Math.round(f*2.4));
  for(let j=0;j<h;j+=slice){
    const sh=Math.min(slice,h-j), d=Math.sin(t*1.6+j/f*.31)*(.18+.55*j/h);
    ctx.drawImage(images.moving,u,v+j,w,sh,x/f+d,(y+j)/f,w/f,sh/f+.04);
  }
}
async function loadLandscape(options={}) {
  const sheets=new Map(), pending=new Map();
  function ensure(kind){
    if(!pending.has(kind))pending.set(kind,Promise.all([loadSheet(kind,'day'),loadSheet(kind,'night')]).then(([day,night])=>{sheets.set(kind,{day,night});options.invalidate?.()}));
    return pending.get(kind);
  }
  const first=options.portrait?'portrait':'wide';
  const moon=new Image();moon.src=asset("landscape/", './assets/moon.webp');
  await Promise.all([ensure(first),moon.decode()]);
  return (ctx,t,night,wind,portrait=false)=>{
    const kind=portrait?'portrait':'wide';
    if(!sheets.has(kind)){
      ensure(kind).catch(()=>{});const old=sheets.get(first);ctx.drawImage(old[night>.5?'night':'day'].base,0,0,maps[kind].width,maps[kind].height);return;
    }
    const both=sheets.get(kind);
    if(night<.9999)pass(ctx,t,wind,kind,'day',both.day);
    if(night>.0001){
      // Intermediate opacities must composite the entire night scene as one plate.
      if(night<.9999) {
        const meta=maps[kind];let mix=both.mix;
        if(!mix){mix=document.createElement('canvas');mix.width=both.night.base.width;mix.height=both.night.base.height;both.mix=mix}
        const brush=mix.getContext('2d');brush.setTransform(mix.width/meta.width,0,0,mix.height/meta.height,0,0);
        pass(brush,t,wind,kind,'night',both.night);
        ctx.save();ctx.globalAlpha=night;ctx.drawImage(mix,0,0,meta.width,meta.height);ctx.restore();
      }else pass(ctx,t,wind,kind,'night',both.night);
    }
    ambience(ctx,t,night,wind,portrait,moon);
  };
}

return {loadLandscape};})();
modules["fire/fire.js"]=(()=>{
// World units are relative to the 1000 × 558 camp illustration.
const WICK_X = 576;
const WICK_Y = 454;
const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 144;
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const fract = value => value - Math.floor(value);

async function texture(name) {
  const image = new Image();
  image.src = asset("fire/", name);
  await image.decode();
  return image;
}

const tongues = [
  { x: -14, y: -3, h: 24, rate: 10.2, phase: 1, flip: -1 },
  { x: 8, y: -4, h: 30, rate: 12.3, phase: 5, flip: 1 },
  { x: -4, y: 0, h: 42, rate: 11.4, phase: 0, flip: 1 },
  { x: 11, y: 0, h: 18, rate: 10.8, phase: 3, flip: -1 },
];

const sparks = Array.from({ length: 14 }, (_, i) => ({
  seed: fract((i + 1) * 0.6180339),
  drift: Math.sin(i * 1.793),
  lifetime: 1.9 + fract(i * 0.3092) * 2.7,
  height: 25 + fract(i * 0.77913) * 80,
  phase: fract((i + 2) * 0.429873),
}));

/** Common linear firelight intensity, usable on character-local light masks. */
function fireIntensity(t) {
  const pulse = Math.sin(t * 5.1 + 0.8 * Math.sin(t * 1.7));
  return 0.60 + 0.14 * pulse + 0.12 * Math.sin(t * 7.73 + 2.1) + 0.08 * Math.sin(t * 11.71);
}

async function loadFire() {
  const [atlas, logs, smoke, glow] = await Promise.all([
    texture('flammes.webp'), texture('bois-braise.webp'), texture('fumee.webp'), texture('lueur.webp'),
  ]);

  return function draw(ctx, t, night = 0, wind = 0) {
    const darkness = clamp(night, 0, 1);
    const breeze = clamp(wind, -1, 1);
    const light = fireIntensity(t);
    ctx.save();
    // Restore the hand-drawn wood underneath the daylight source's flat ember patch.
    ctx.globalAlpha = (1 - darkness) * 0.96;
    ctx.drawImage(logs, 514, 427);

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.12 + darkness * 0.28) * light;
    ctx.drawImage(glow, WICK_X - 145, WICK_Y - 32, 290, 72);
    ctx.globalAlpha = darkness * light * 0.11;
    ctx.drawImage(glow, WICK_X - 250, WICK_Y - 105, 500, 150);
    ctx.globalCompositeOperation = 'source-over';

    // Four soft, advecting puffs form a narrow column. A new puff begins invisibly.
    for (let i = 0; i < 4; i++) {
      const u = fract(t / 6.8 + i * 0.25);
      const width = 6 + u * 36;
      const x = WICK_X + breeze * 20 * u * u + Math.sin(t * 0.67 - u * 7) * u * 7;
      const y = WICK_Y - 26 - 64 * u;
      ctx.globalAlpha = Math.sin(Math.PI * u) ** 1.5 * (0.28 - 0.11 * darkness);
      ctx.drawImage(smoke, x - width / 2, y - width * 0.60, width, width * 1.2);
    }

    ctx.globalAlpha = (0.20 + darkness * 0.26) * light;
    ctx.drawImage(glow, WICK_X - 44, WICK_Y - 56, 88, 67);
    ctx.globalAlpha = 1;
    for (const part of tongues) {
      const sampleTime = t * part.rate + part.phase + 0.42 * Math.sin(t * 1.13 + part.phase);
      const frame = Math.floor(sampleTime) % 8;
      const height = part.h * (0.94 + 0.075 * Math.sin(t * 4.3 + part.phase) + 0.04 * Math.sin(t * 8.4 + part.phase));
      const width = height * 0.74;
      ctx.save();
      ctx.translate(WICK_X + part.x, WICK_Y + part.y);
      ctx.rotate(0.075 * breeze + 0.035 * Math.sin(t * 2.5 + part.phase));
      ctx.scale(part.flip, 1);
      ctx.drawImage(atlas, frame * FRAME_WIDTH, 0, FRAME_WIDTH, FRAME_HEIGHT, -width / 2, -height, width, height);
      ctx.restore();
    }

    // Each spark follows a seeded trajectory, with long gaps between launches.
    ctx.lineCap = 'round';
    for (let i = 0; i < sparks.length; i++) {
      const particle = sparks[i];
      const cycle = t / particle.lifetime + particle.phase;
      const u = fract(cycle);
      if (u > 0.62 || Math.sin(Math.floor(cycle) * 4.13 + i * 9.37) > 0.5) continue;
      const age = u / 0.62;
      const slip = Math.sin(age * 4.8 + particle.seed * TAU) - Math.sin(particle.seed * TAU);
      const x = WICK_X + (particle.seed - 0.5) * 29 + age * age * (breeze * 26 + particle.drift * 10) + slip * 2.1;
      const y = WICK_Y - 10 - particle.height * age * (1.1 - age * 0.23);
      ctx.globalAlpha = Math.sin(Math.PI * age) ** 0.7 * (0.55 + 0.45 * darkness);
      ctx.strokeStyle = age < 0.50 ? '#ffdc80' : '#ff9751';
      ctx.lineWidth = 0.65 + particle.seed * 0.75;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (breeze * 0.4 + particle.drift * 0.3) * age, y + 0.8 + particle.seed * 1.3);
      ctx.stroke();
    }
    ctx.restore();
  };
}

return {fireIntensity,loadFire};})();
modules["motion/library.js"]=(()=>{
// Angles describe a right-facing actor. Times are normalized to the duration of a phrase.
// Each row: time, head, near shoulder, near elbow, far shoulder, far elbow.
const gestures = {
  explain: {hand:'open', keys:[[0,0,0,0,0,0],[.22,-2,-5,-11,1,1],[.43,1,-8,-22,0,-2],[.66,-1,-6,-14,-1,-3],[.80,1,-5,-18,0,0],[1,0,0,0,0,0]]},
  offer: {hand:'palm', keys:[[0,0,0,0,0,0],[.32,2,-10,-10,0,0],[.56,-1,-12,-17,1,2],[.76,-1,-11,-16,0,1],[1,0,0,0,0,0]]},
  enumerate: {hand:'point', keys:[[0,0,0,0,0,0],[.24,-2,-5,-21,-2,-5],[.38,2,-8,-15,-1,-4],[.53,-2,-6,-22,-2,-5],[.69,1,-10,-15,-2,-7],[1,0,0,0,0,0]]},
  landscape: {hand:'point', keys:[[0,0,0,0,0,0],[.19,-5,-4,-4,0,0],[.41,-6,-17,-38,0,1],[.72,-4,-16,-37,0,0],[1,0,0,0,0,0]]},
  question: {hand:'palm', keys:[[0,0,0,0,0,0],[.29,-4,-5,-15,2,-3],[.50,-5,-8,-18,-4,-10],[.76,-5,-7,-17,-4,-11],[1,0,0,0,0,0]]},
  emphasis: {hand:'open', keys:[[0,0,0,0,0,0],[.33,-2,-5,-21,0,0],[.47,3,-8,-10,1,1],[.67,1,-7,-13,0,0],[1,0,0,0,0,0]]},
  warm: {hand:'palm', keys:[[0,0,0,0,0,0],[.28,5,-9,6,-7,6],[.62,7,-12,7,-10,9],[.82,5,-10,6,-9,6],[1,0,0,0,0,0]]},
  stretch: {hand:'open',keys:[[0,0,0,0,0,0],[.30,-2,4,-18,4,-14],[.56,-4,7,-33,4,-24],[.78,-2,5,-27,3,-18],[1,0,0,0,0,0]]},
  rub: {hand:'palm',keys:[[0,0,0,0,0,0],[.22,4,-6,-6,-6,-8],[.35,5,-8,-8,-5,-11],[.46,5,-6,-12,-7,-6],[.58,5,-9,-8,-5,-11],[.68,4,-6,-11,-7,-6],[.78,3,-7,-8,-5,-8],[1,0,0,0,0,0]]},
  knees: {hand:'rest',keys:[[0,0,0,0,0,0],[.35,4,-2,9,-2,5],[.75,5,-2,10,-4,6],[1,0,0,0,0,0]]},
  shrug: {hand:'palm',keys:[[0,0,0,0,0,0],[.25,-2,2,-14,1,-9],[.42,-4,3,-25,4,-16],[.60,-3,2,-22,3,-13],[1,0,0,0,0,0]]},
  chin: {hand:'rest',keys:[[0,0,0,0,0,0],[.25,1,-10,-28,0,0],[.43,3,-32,-53,0,0],[.69,4,-32,-53,0,0],[.84,1,-18,-34,0,0],[1,0,0,0,0,0]]},
  fold: {hand:'rest',keys:[[0,0,0,0,0,0],[.22,1,1,-6,-4,-15],[.43,1,-1,-33,-9,-28],[.73,1,-1,-33,-9,-28],[.85,0,0,-14,-6,-18],[1,0,0,0,0,0]]},
  surprise: {hand:'open',keys:[[0,0,0,0,0,0],[.17,-5,2,-7,0,-4],[.43,-6,3,-11,1,-6],[.72,-2,1,-7,0,-2],[1,0,0,0,0,0]]},
  nod: {hand:'rest', keys:[[0,0,0,0,0,0],[.27,-2,0,0,0,0],[.49,5,0,0,0,0],[.74,1,0,0,0,0],[1,0,0,0,0,0]]},
  amused: {hand:'rest', keys:[[0,0,0,0,0,0],[.24,-4,-1,-3,0,-2],[.41,1,-2,-4,-1,-3],[.59,-2,0,-2,0,-2],[.8,1,0,-1,0,0],[1,0,0,0,0,0]]},
  consider: {hand:'rest', keys:[[0,0,0,0,0,0],[.35,-5,2,-7,0,0],[.73,-5,1,-8,0,0],[1,0,0,0,0,0]]}
};
const smooth = x => {const v=Math.max(0,Math.min(1,x)); return v*v*(3-2*v)};
// Allow the left hand to move on its own beat during two-handed gestures.
const leftHandPoses = {
  landscape:'palm',
  question:'open',
  shrug:'open',
  surprise:'open',
  stretch:'open',
  warm:'palm',
  rub:'palm'
};
const joints=['head','upper','fore','farUpper','farFore'];
const handEnvelope=(u,start,opened,release,end)=>smooth((u-start)/(opened-start))*smooth((end-u)/(end-release));

function keyVelocity(keys,index,column) {
  if(index===0 || index===keys.length-1) return 0;
  const [a,b,c]=[keys[index-1],keys[index],keys[index+1]];
  const incoming=(b[column]-a[column])/(b[0]-a[0]);
  const outgoing=(c[column]-b[column])/(c[0]-b[0]);
  // Carry momentum through passing poses, while slowing down at reversals.
  if(incoming*outgoing<=0) return 0;
  return 2*incoming*outgoing/(incoming+outgoing);
}

function sampleGesture(name,u,out,orientation) {
  if(!name || u<=0 || u>=1) return;
  const {keys,hand}=gestures[name];
  const i=keys.findIndex(k=>k[0]>=u);
  const a=keys[i-1], b=keys[i], interval=b[0]-a[0];
  const t=(u-a[0])/interval, f=smooth(t);
  joints.forEach((joint,j)=>{
    const column=j+1, start=keyVelocity(keys,i-1,column), end=keyVelocity(keys,i,column);
    const travel=interval*t*(1-t)*((1-t)*start-t*end);
    out[joint] += orientation*(a[column]+(b[column]-a[column])*f+travel);
  });
  // Preserve the robot's discrete hand selection. The human has its own
  // progress for each hand and can begin unfolding before reaching a key pose.
  if (u>.14 && u<.88) out.hand=hand;
  if(hand!=='rest'){
    out.rightHand=hand;
    out.rightHandAmount=handEnvelope(u,.05,.24,.77,.96);
  }
  if(Object.hasOwn(leftHandPoses,name)){
    out.leftHand=leftHandPoses[name];
    out.leftHandAmount=handEnvelope(u,.16,.36,.69,.92);
  }
}

return {gestures,smooth,sampleGesture};})();
modules["motion/conversation.js"]=(()=>{
const {sampleGesture,smooth}=modules["motion/library.js"];
const randomBetween=(lo,hi)=>lo+Math.random()*(hi-lo);
const pick=list=>list[Math.floor(Math.random()*list.length)];
function actor() {return {nextBlink:randomBetween(1,4),phase:randomBetween(0,6),blinkAt:-1}}
class Conversation {
  constructor() {
    this.actors=[actor(),actor()]; this.speaker=0; this.exchanges=0; this.start=0;
    this.previous=['','']; this.begin('speak',0);
  }
  begin(state,t) {
    this.state=state; this.start=t;
    if(state==='speak') {
      const choices=['explain','offer','enumerate','landscape','question','emphasis','shrug'];
      this.gesture=pick(choices.filter(x=>x!==this.previous[this.speaker]));
      this.previous[this.speaker]=this.gesture;
      this.duration=randomBetween(3.5,5.8); this.reaction=pick(['nod','nod','amused','consider','surprise',null]);
      this.reactionStart=randomBetween(.32,.55); this.reactionLength=randomBetween(.30,.43);
    } else {
      this.duration=state==='hearth'?randomBetween(4.1,7.7):randomBetween(.65,1.55);
      if(state==='hearth')this.rest=pick(['warm','warm','knees','rub','stretch','chin','fold']);
    }
  }
  poses(t) {
    if(t-this.start>=this.duration){
      if(this.state==='speak') {
        this.exchanges++; const quiet=this.exchanges>=3 && (this.exchanges>=5 || Math.random()<.55);
        if(quiet)this.exchanges=0;
        this.begin(quiet?'hearth':'pause',t);
      } else {this.speaker=1-this.speaker; this.begin('speak',t)}
    }
    const u=(t-this.start)/this.duration;
    return this.actors.map((a,i)=>{
      const direction=i===0?1:-1;
      if(t>=a.nextBlink){a.blinkAt=t; a.nextBlink=t+randomBetween(2.9,6.4)}
      const since=t-a.blinkAt;
      const blink=since<.09?smooth(since/.09):1-smooth((since-.09)/.13);
      const p={head:0,upper:0,fore:0,farUpper:0,farFore:0,blink,hand:'rest',talk:0,gaze:0,breath:Math.sin(t*(i===0?1.52:1.09)+a.phase)};
      p.head=p.breath*.32*direction;
      if(this.state==='speak'){
        if(i===this.speaker) {
          sampleGesture(this.gesture,u,p,direction);
          const phrase=(.5+.5*Math.sin(t*4.1+a.phase));
          p.talk=smooth(u/.11)*smooth((1-u)/.15)*smooth(phrase*2)*(.52+.48*Math.sin(t*12.2+.42*Math.sin(t*7.3)));
          p.gaze=this.gesture==='landscape'?-.8*Math.sin(Math.PI*u):.2;
        } else {
          sampleGesture(this.reaction,(u-this.reactionStart)/this.reactionLength,p,direction);
          p.gaze=.55;
          const reactionTime=(u-this.reactionStart)/this.reactionLength;
          if(reactionTime>0&&reactionTime<1){const beat=Math.sin(Math.PI*reactionTime);
            p.brow=this.reaction==='surprise'?beat:0;
            p.talk=this.reaction==='surprise'?beat*.78:0;
          }
        }
      }
      if(this.state==='hearth') {
        const focus=Math.sin(Math.PI*u)**2;
        if(i===this.speaker)sampleGesture(this.rest,u,p,direction);
        else p.head+=direction*4*focus;
        p.gaze=-.7*focus;
      }
      p.antenna=p.breath*.65-p.head*.19;
      return p;
    });
  }
}

return {Conversation};})();
modules["scene.js"]=(()=>{
const {loadHuman}=modules["human/human.js"];
const {loadRobot}=modules["robot/robot.js"];
const {loadLandscape}=modules["landscape/landscape.js"];
const {loadFire,fireIntensity}=modules["fire/fire.js"];
const {Conversation}=modules["motion/conversation.js"];

const palettes={day:0,jour:0,night:1,nuit:1};
function localLight(mode) {
  if (mode in palettes) return palettes[mode];
  const now=new Date(), h=now.getHours()+now.getMinutes()/60;
  if(h<6||h>=21)return 1;
  if(h<8)return (8-h)/2;
  return h<19?0:(h-19)/2;
}
const layout={
  desktop:{width:1000,height:558,human:[346,434,164],robot:[792,419,120],fire:[576,455,1]},
  portrait:{width:460,height:997,human:[121,694,160],robot:[349,694,119],fire:[235,716,.62]}
};
function shadow(ctx,x,y,h,night) {
  ctx.save();
  ctx.translate(x,y+1.1); ctx.scale(h*.16,h*.024);
  const g=ctx.createRadialGradient(0,0,0,0,0,1);
  g.addColorStop(0,'rgba(24,16,27,'+(.56+.16*night)+')');
  g.addColorStop(1,'rgba(24,16,27,0)');
  ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
}
function actorLayer(draw) {
  const surface=document.createElement('canvas'), brush=surface.getContext('2d');
  const mask=document.createElement('canvas'), maskBrush=mask.getContext('2d');
  return (ctx,seat,pose,night,time,side,res)=>{
    const [x,y,h]=seat, w=Math.ceil(h*1.42), top=h*1.05, height=Math.ceil(h*1.55);
    const density=Math.min(2.5,Math.max(1,res));
    const px=Math.round(w*density), py=Math.round(height*density);
    if(surface.width!==px ||surface.height!==py){surface.width=mask.width=px;surface.height=mask.height=py}
    brush.setTransform(px/w,0,0,py/height,0,0);brush.clearRect(0,0,w,height);
    brush.save();draw(brush,w*.5,top,h,pose);brush.restore();
    maskBrush.globalCompositeOperation='copy';maskBrush.drawImage(surface,0,0);
    brush.globalCompositeOperation='multiply';
    const flicker=fireIntensity(time);
    const warm=brush.createLinearGradient(side<0?w:0,height*.68,side<0?0:w,height*.35);
    warm.addColorStop(.23,'rgba(255,197,132,'+(.15+night*(.44+.22*flicker))+')');
    warm.addColorStop(.79,'rgba(112,139,189,'+(.13+night*.57)+')');brush.fillStyle=warm;
    brush.fillRect(0,0,w,height);brush.globalCompositeOperation='destination-in';
    brush.drawImage(mask,0,0,w,height);brush.globalCompositeOperation='source-over';
    shadow(ctx,x,y,h,night);ctx.drawImage(surface,x-w*.5,y-top,w,height);
  };
}
function mountCamp(host,options={}) {
  let mode=options.mode||'auto',animated=options.animated!==false, debug=!!options.debug;
  const canvas=document.createElement('canvas');
  canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none;';
  canvas.setAttribute('aria-hidden','true');host.appendChild(canvas);
  const ctx=canvas.getContext('2d',{alpha:false});
  const stats={fps:0,frameMs:0,quality:60,frames:0,phase:'loading'};
  const controller=new Conversation(), motion=matchMedia('(prefers-reduced-motion: reduce)');
  let destroyed=false,ready=false,visible=true,id=0,time=0,previous=0,night=localLight(mode),target=night;
  let width=1,height=1,dpr=1,windowTime=0,windowFrames=0,slow=0;
  let landscape,actors,fire;
  function resize() {
    const rect=host.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
    dpr=Math.min(devicePixelRatio||1,stats.quality===30?1.35:2,Math.sqrt(4200000/(width*height)));
    canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
    if(ready) paint();
  }
  function paint() {
    if(destroyed||!ready)return;
    const start=performance.now(), portrait=width/height<1.27, l=portrait?layout.portrait:layout.desktop;
    const zoom=Math.max(width/l.width,height/l.height);
    const dx=(width-l.width*zoom)*(portrait?.5:.55), dy=(height-l.height*zoom)*(portrait?.68:.66);
    ctx.setTransform(dpr*zoom,0,0,dpr*zoom,dpr*dx,dpr*dy);
    const wind=.46*Math.sin(time*.49)+.20*Math.sin(time*1.13+.7)+.24*Math.sin(time*.17+1.8);
    ctx.save();landscape(ctx,time,night,wind,portrait);ctx.restore();
    const poses=controller.poses(time);
    actors[0](ctx,l.human,poses[0],night,time,-1,dpr*zoom);
    actors[1](ctx,l.robot,poses[1],night,time,1,dpr*zoom);
    ctx.save();ctx.translate(l.fire[0],l.fire[1]);ctx.scale(l.fire[2],l.fire[2]);ctx.translate(-576,-455);
    fire(ctx,time,night,wind);ctx.restore();
    stats.phase=controller.state;stats.frames++;stats.frameMs=performance.now()-start;
    if(debug){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#18231de8';ctx.fillRect(12,height-39,205,26);ctx.fillStyle='#f6f2da';ctx.font='12px monospace';ctx.fillText(stats.fps+' fps · '+stats.quality+' · '+stats.phase,20,height-21)}
  }
  function tick(now) {
    id=0;if(destroyed||document.hidden||!visible||!ready)return;
    if(!previous)previous=now;
    const elapsed=now-previous;
    if(stats.quality!==30 || elapsed>=31){
      previous=now;const dt=Math.max(0,Math.min(elapsed/1000,.1));
      if(animated&&!motion.matches)time+=dt;
      target=localLight(mode);
      const dir=Math.sign(target-night);
      night+=dir*Math.min(Math.abs(target-night),dt*.58);
      paint();
      if(elapsed>0){
        windowTime+=elapsed;windowFrames++;
        if(windowTime>=2000) {
          stats.fps=Math.round(windowFrames*1000/windowTime);
          if(stats.quality===60){slow=stats.fps<46?slow+1:0;if(slow>=2){stats.quality=30;resize()}}
          windowTime=0;windowFrames=0;
        }
      }
    }
    if((animated&&!motion.matches)||Math.abs(night-target)>.0001)id=requestAnimationFrame(tick);
  }
  function restart(){
    cancelAnimationFrame(id);previous=0;windowFrames=0;windowTime=0;
    if(ready&&!document.hidden&&visible&&!destroyed){paint();id=requestAnimationFrame(tick)}
  }
  const ro=new ResizeObserver(resize);ro.observe(host);
  const io=new IntersectionObserver(entries=>{visible=entries.at(-1).isIntersecting;restart()});io.observe(host);
  document.addEventListener('visibilitychange',restart);motion.addEventListener('change',restart);
  const clock=setInterval(()=>{if(mode==='auto' && Math.abs(localLight(mode)-target)>.001)restart()},60000);
  resize();
  const loaded=Promise.all([loadLandscape({portrait:width/height<1.27,invalidate:()=>{if(ready)restart()}}),loadHuman(),loadRobot(),loadFire()]).then(([bg,h,r,f])=>{
    if(destroyed)return;
    landscape=bg;actors=[actorLayer(h),actorLayer(r)];fire=f;ready=true;resize();restart();
    host.dispatchEvent(new CustomEvent('camp-ready',{bubbles:true}));
  });
  return {
    ready:loaded, stats,
    setMode(value){mode=value;target=localLight(mode);if(motion.matches||!animated)night=target;restart()},
    setAnimated(value){animated=!!value;restart()},
    setDebug(value){debug=!!value;restart()},
    destroy(){destroyed=true;ready=false;cancelAnimationFrame(id);clearInterval(clock);ro.disconnect();io.disconnect();
      document.removeEventListener('visibilitychange',restart);motion.removeEventListener('change',restart);
      actors=null;landscape=fire=null;canvas.width=canvas.height=1;canvas.remove()}
  };
}

return {mountCamp};})();
window.BivouacCamp=modules['scene.js'];})();
