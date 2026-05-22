(function(){
  const canvas=document.getElementById('bgCanvas');
  const ctx=canvas.getContext('2d');
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight}
  resize();window.addEventListener('resize',resize);

  const streams=[
    {hue:220,thickness:170,yFrac:.18,speed:.28,amp:.08,phase:0},
    {hue:270,thickness:155,yFrac:.30,speed:.22,amp:.10,phase:1.2},
    {hue:320,thickness:140,yFrac:.42,speed:.35,amp:.07,phase:2.5},
    {hue:185,thickness:165,yFrac:.12,speed:.25,amp:.09,phase:3.8},
    {hue:10,thickness:130,yFrac:.55,speed:.30,amp:.06,phase:5.0},
    {hue:145,thickness:180,yFrac:.65,speed:.18,amp:.12,phase:6.3},
    {hue:45,thickness:145,yFrac:.10,speed:.32,amp:.11,phase:7.5}
  ];
  const ribbonLen=900,total=streams.length;
  streams.forEach((s,i)=>{s.offset=-(i/total)*(canvas.width+800)});
  let t=0;

  function drawStream(s){
    const W=canvas.width,H=canvas.height;
    const xS=s.offset-300,xE=s.offset+ribbonLen;
    if(xE<-200||xS>W+200)return;
    const yC=H*s.yFrac+Math.sin(t*.018+s.phase)*H*s.amp;
    const yC1=yC+Math.sin(t*.014+s.phase+1)*H*s.amp*.7;
    const yC2=yC+Math.cos(t*.012+s.phase+2)*H*s.amp*.6;
    const hf=Math.max(0,Math.min(1,(s.offset-xS)/(xE-xS)));
    const tf=Math.max(.001,hf-.55),ff=Math.min(.999,hf+.12);

    function grad(l,a){
      const g=ctx.createLinearGradient(xS,0,xE,0);
      g.addColorStop(0,`hsla(${s.hue},80%,${l}%,0)`);
      g.addColorStop(tf,`hsla(${s.hue},80%,${l}%,0)`);
      g.addColorStop(hf||.002,`hsla(${s.hue},80%,${l}%,${a})`);
      g.addColorStop(ff,`hsla(${s.hue},80%,${l}%,0)`);
      g.addColorStop(1,`hsla(${s.hue},80%,${l}%,0)`);
      return g;
    }
    // Bloom
    ctx.save();ctx.filter=`blur(${s.thickness*.55|0}px)`;
    ctx.lineWidth=s.thickness;ctx.lineCap='round';ctx.strokeStyle=grad(60,.18);
    ctx.beginPath();ctx.moveTo(xS,yC);
    ctx.bezierCurveTo(xS+(xE-xS)*.33,yC1,xS+(xE-xS)*.66,yC2,xE,yC);
    ctx.stroke();ctx.restore();
    // Core
    ctx.save();ctx.filter=`blur(${s.thickness*.18|0}px)`;
    ctx.lineWidth=s.thickness*.18;ctx.lineCap='round';ctx.strokeStyle=grad(85,.35);
    ctx.beginPath();ctx.moveTo(xS,yC);
    ctx.bezierCurveTo(xS+(xE-xS)*.33,yC1,xS+(xE-xS)*.66,yC2,xE,yC);
    ctx.stroke();ctx.restore();
  }

  function sparkle(){
    const s=streams[Math.random()*total|0];
    const sx=s.offset+Math.random()*80-40;
    const sy=canvas.height*s.yFrac+(Math.random()-.5)*60;
    const r=2+Math.random()*3;
    const g=ctx.createRadialGradient(sx,sy,0,sx,sy,r*4);
    g.addColorStop(0,'rgba(255,255,255,.9)');
    g.addColorStop(.4,'rgba(255,255,255,.3)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(sx,sy,r*4,0,Math.PI*2);ctx.fill();
  }

  function loop(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    streams.forEach(s=>{
      s.offset+=s.speed*2.2;
      if(s.offset>canvas.width+400)s.offset=-ribbonLen;
      drawStream(s);
    });
    if(Math.random()<.08)sparkle();
    t++;requestAnimationFrame(loop);
  }
  loop();
})();
