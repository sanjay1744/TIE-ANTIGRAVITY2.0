(function(){
  const slides=document.querySelectorAll('.slide');
  const total=slides.length;
  const progress=document.getElementById('progressBar');
  const counter=document.getElementById('slideCounter');
  const dots=document.querySelectorAll('.nav-dot');
  let current=0,transitioning=false;

  const transitions=['morph','glitch','wipe','rise','morph','glitch','wipe','rise','morph','glitch','wipe','rise','morph','glitch','wipe'];

  function updateUI(){
    progress.style.width=((current+1)/total*100)+'%';
    counter.innerHTML='<span class="cur">'+String(current+1).padStart(2,'0')+'</span> / '+String(total).padStart(2,'0');
    dots.forEach((d,i)=>d.classList.toggle('active',i===current));
  }

  function triggerAnimations(slide){
    const els=slide.querySelectorAll('[data-anim]');
    els.forEach(el=>el.classList.remove('visible'));
    els.forEach((el,i)=>{
      const delay=parseInt(el.dataset.delay||0)+i*120;
      setTimeout(()=>el.classList.add('visible'),delay);
    });
    // Terminal typing
    const lines=slide.querySelectorAll('.terminal-line');
    if(lines.length){
      lines.forEach(l=>l.classList.remove('typed'));
      lines.forEach((l,i)=>setTimeout(()=>l.classList.add('typed'),400+i*350));
    }
    // Counter animation
    const counters=slide.querySelectorAll('[data-count]');
    counters.forEach(c=>{
      const target=c.dataset.count;
      if(target==='∞'){c.textContent='∞';return}
      const num=parseInt(target);
      let cur=0;const step=Math.max(1,Math.floor(num/40));
      const iv=setInterval(()=>{cur+=step;if(cur>=num){cur=num;clearInterval(iv)}c.textContent=cur+(c.dataset.suffix||'')},30);
    });
    // Play full-screen video if present
    const fsVideo=slide.querySelector('.full-screen-video');
    if(fsVideo){
      fsVideo.play().catch(e=>console.log("Autoplay prevented:",e));
    }
  }

  function resetAnimations(slide){
    slide.querySelectorAll('[data-anim]').forEach(el=>el.classList.remove('visible'));
    slide.querySelectorAll('.terminal-line').forEach(l=>l.classList.remove('typed'));
    // Pause and reset full-screen video if present
    const fsVideo=slide.querySelector('.full-screen-video');
    if(fsVideo){
      fsVideo.pause();
      fsVideo.currentTime=0;
    }
  }

  function goTo(index,options){
    if(transitioning||index===current||index<0||index>=total)return;
    transitioning=true;
    const from=slides[current],to=slides[index];
    const tr=transitions[index%transitions.length];
    const dir=index>current?1:-1;

    // Exit current
    from.classList.add('exit-'+tr);
    from.classList.remove('active');

    // Enter next
    to.classList.add('active','enter-'+tr);
    current=index;updateUI();
    window.dispatchEvent(new CustomEvent('slideChange',{detail:{index:index,remote:!!(options&&options.remote)}}));
    triggerAnimations(to);

    const dur=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--transition-speed'))||600;
    setTimeout(()=>{
      from.classList.remove('exit-'+tr);
      to.classList.remove('enter-'+tr);
      resetAnimations(from);
      transitioning=false;
    },dur+100);
  }

  // Wheel
  let wheelTimer=0;
  window.addEventListener('wheel',(e)=>{
    e.preventDefault();
    const now=Date.now();
    if(now-wheelTimer<800)return;
    wheelTimer=now;
    if(e.deltaY>0)goTo(current+1);else goTo(current-1);
  },{passive:false});

  // Touch
  let touchY=0;
  window.addEventListener('touchstart',e=>{touchY=e.touches[0].clientY});
  window.addEventListener('touchend',e=>{
    const dy=touchY-e.changedTouches[0].clientY;
    if(Math.abs(dy)>50){dy>0?goTo(current+1):goTo(current-1)}
  });

  // Keyboard
  window.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowRight'||e.key===' '){e.preventDefault();goTo(current+1)}
    else if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();goTo(current-1)}
    else if(e.key==='f'||e.key==='F'){toggleFS()}
    else if(e.key>='1'&&e.key<='9'){goTo(parseInt(e.key)-1)}
    else if(e.key==='0'){goTo(9)}
  });

  // Dots
  dots.forEach((d,i)=>d.addEventListener('click',()=>goTo(i)));

  // Fullscreen
  function toggleFS(){
    if(!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen();
  }
  document.querySelector('.fs-btn').addEventListener('click',toggleFS);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const group=btn.closest('.slide');
      group.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      group.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // Init
  slides[0].classList.add('active');
  updateUI();
  setTimeout(()=>triggerAnimations(slides[0]),300);

  // Expose API for collaboration module
  window.Presentation={
    goTo:goTo,
    getCurrent:function(){return current},
    isTransitioning:function(){return transitioning}
  };
})();
